/** Prism AI — Escudo de red del proxy (anti-SSRF).
 *
 * El proxy existe para saltarse el CORS de los proveedores de IA: el navegador
 * le pasa una URL y el servidor la pide por él. Sin filtro, eso convierte al
 * servidor en un ariete contra su propia red: cualquiera que conozca la URL del
 * despliegue puede pedirle que lea `169.254.169.254` (los metadatos de la nube,
 * que en muchos proveedores devuelven credenciales de la instancia), `localhost`
 * o cualquier IP privada, y recibir la respuesta.
 *
 * Aquí se decide qué destinos son legítimos. Dos capas:
 *
 *  1. Por nombre: se rechazan los sospechosos habituales antes de tocar el DNS
 *     (localhost, *.internal, *.local, metadata.google.internal…).
 *  2. Por dirección: se resuelve el nombre y se rechaza si CUALQUIERA de las IP
 *     resueltas es privada, de bucle local, link-local o reservada. Mirar solo
 *     el nombre no basta: `mi-dominio.com` puede apuntar a 127.0.0.1.
 *
 * Contra el «DNS rebinding» —resolver a una IP pública en la comprobación y a
 * una privada al conectar— queda una ventana teórica. Se estrecha rechazando
 * también las redirecciones hacia destinos bloqueados, que es por donde se
 * explota en la práctica.
 */

/** Motivo por el que un destino queda descartado; se enseña tal cual al cliente. */
export type BlockReason =
  | "protocolo"
  | "nombre-interno"
  | "ip-privada"
  | "sin-resolver"
  | "url-invalida";

export interface BlockedTarget {
  blocked: true;
  reason: BlockReason;
  detail: string;
}
export interface AllowedTarget {
  blocked: false;
  url: URL;
}
export type TargetCheck = AllowedTarget | BlockedTarget;

const MENSAJES: Record<BlockReason, string> = {
  protocolo: "Solo se permiten destinos http y https.",
  "nombre-interno": "Ese nombre apunta a la red interna del servidor.",
  "ip-privada": "Ese destino resuelve a una dirección privada o reservada.",
  "sin-resolver": "No se pudo resolver el nombre del destino.",
  "url-invalida": "La URL de destino no es válida.",
};

export function mensajeDe(reason: BlockReason): string {
  return MENSAJES[reason];
}

/** Nombres que nunca son un proveedor de IA legítimo. */
const NOMBRES_BLOQUEADOS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^ip6-\w+$/i,
  /\.internal$/i, // metadata.google.internal, *.compute.internal
  /\.local$/i, // mDNS
  /\.home$/i,
  /\.lan$/i,
  /^metadata(\.|$)/i, // metadata, metadata.google.internal
  /^instance-data(\.|$)/i, // AWS
];

/** ¿El nombre del host es, por sí solo, motivo de rechazo? */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.replace(/\.$/, "").toLowerCase();
  if (!h) return true;
  return NOMBRES_BLOQUEADOS.some((re) => re.test(h));
}

/* ------------------------------------------------------------------ */
/* direcciones                                                         */
/* ------------------------------------------------------------------ */

function ipv4Partes(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const partes = m.slice(1, 5).map(Number);
  return partes.every((n) => n >= 0 && n <= 255) ? partes : null;
}

/** ¿Una IPv4 pertenece a un rango que no debe alcanzarse desde fuera? */
export function isPrivateIpv4(ip: string): boolean {
  const p = ipv4Partes(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 «esta red»
  if (a === 10) return true; // privada
  if (a === 127) return true; // bucle local
  if (a === 169 && b === 254) return true; // link-local: METADATOS DE LA NUBE
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 y 192.0.2.0/24 (doc)
  if (a === 198 && (b === 18 || b === 19)) return true; // pruebas de rendimiento
  if (a === 198 && b === 51) return true; // documentación
  if (a === 203 && b === 0) return true; // documentación
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast y reservado (224-255)
  return false;
}

/** ¿Una IPv6 es de bucle local, privada, link-local o mapea una IPv4 privada? */
export function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase().split("%")[0]; // quita el índice de zona (fe80::1%eth0)
  if (h === "::" || h === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 únicas locales
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(h)) return true; // multicast
  // IPv4 embebida: ::ffff:127.0.0.1 o ::ffff:7f00:1
  const mapeada = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapeada) return isPrivateIpv4(mapeada[1]);
  if (/^(::ffff:)?64:ff9b:/.test(h)) return true; // NAT64
  return false;
}

/** ¿Esta dirección, IPv4 o IPv6, está fuera de lo alcanzable desde internet? */
export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

/* ------------------------------------------------------------------ */
/* comprobación completa                                               */
/* ------------------------------------------------------------------ */

/** Resolutor de nombres inyectable, para poder probar sin red. */
export type Resolver = (hostname: string) => Promise<string[]>;

/** Comprobación SIN red: protocolo, nombre y, si el host ya es una IP, la IP. */
export function checkTargetSync(target: string): TargetCheck {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { blocked: true, reason: "url-invalida", detail: target.slice(0, 80) };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { blocked: true, reason: "protocolo", detail: url.protocol };
  }
  // Un host entre corchetes es IPv6 literal: [::1] → ::1
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) {
    return { blocked: true, reason: "nombre-interno", detail: host };
  }
  const esIp = /^[\d.]+$/.test(host) || host.includes(":");
  if (esIp && isPrivateAddress(host)) {
    return { blocked: true, reason: "ip-privada", detail: host };
  }
  return { blocked: false, url };
}

/** Comprobación completa: la anterior más la resolución del nombre.
 * Si CUALQUIER dirección resuelta es privada se rechaza: un nombre puede tener
 * varios registros y basta con uno malo para que la petición acabe dentro. */
export async function checkTarget(target: string, resolve: Resolver): Promise<TargetCheck> {
  const previo = checkTargetSync(target);
  if (previo.blocked) return previo;

  const host = previo.url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return previo; // ya era una IP

  let direcciones: string[];
  try {
    direcciones = await resolve(host);
  } catch {
    return { blocked: true, reason: "sin-resolver", detail: host };
  }
  if (!direcciones.length) {
    return { blocked: true, reason: "sin-resolver", detail: host };
  }
  const mala = direcciones.find(isPrivateAddress);
  if (mala) {
    return { blocked: true, reason: "ip-privada", detail: `${host} → ${mala}` };
  }
  return previo;
}
