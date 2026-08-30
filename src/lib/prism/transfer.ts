/** Prism AI — Llevarte tus cosas a otro dispositivo, sin cuentas ni servidor.
 *
 * El problema real es «no quiero volver a poner las claves en el portátil». La
 * respuesta habitual —una cuenta y un servidor que guarde tus claves— es
 * justamente la que no quiero: si ese servidor se filtra, se filtran claves de
 * API de otra gente, que son dinero. Y Prism anuncia «sin cuentas, tus claves
 * solo en tu dispositivo» en la propia app.
 *
 * Aquí los datos viajan CIFRADOS y sin intermediario: sale un texto que no
 * significa nada sin la frase que elijas, lo pasas como quieras (correo,
 * mensaje, un archivo) y lo pegas en el otro dispositivo con la misma frase.
 * Quien lo intercepte no tiene nada. Se reutiliza el mismo AES-GCM + PBKDF2 de
 * la bóveda del PIN.
 */

import { decryptJson, encryptJson, type VaultBlob } from "./crypto";
import type { AppSettings, ProviderConfig, ProviderId, Session } from "./types";

/** Marca de formato. Va delante para poder rechazar pronto lo que no es nuestro. */
export const TRANSFER_PREFIX = "PRISM1.";

/** Mínimo de la frase. No es un PIN: protege claves de API en tránsito. */
export const MIN_FRASE = 8;

export interface TransferBundle {
  v: 1;
  /** cuándo se creó, para saber qué copia es más reciente */
  at: number;
  /** versión de Prism que lo generó, informativo */
  app?: string;
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
  settings?: AppSettings;
  sessions?: Session[];
  githubToken?: string;
}

export interface TransferResumen {
  proveedores: number;
  conversaciones: number;
  mensajes: number;
  ajustes: boolean;
  github: boolean;
  fecha: number;
}

/* ------------------------------------------------------------------ */
/* qué merece la pena mandar                                          */
/* ------------------------------------------------------------------ */

/** Lo que el catálogo define para un proveedor recién instalado. */
export interface ProveedorPorDefecto {
  baseUrl?: string;
  defaultModels: readonly string[];
}

/**
 * ¿Este proveedor está tal y como vino de fábrica?
 *
 * Importa más de lo que parece: el paquete llevaba los DIECISIETE proveedores
 * del catálogo, y quince de ellos son plantillas vacías idénticas en el otro
 * dispositivo. Eso inflaba el código de 900 a 5.300 caracteres —o sea, por
 * encima del límite de un QR— para no transportar ni un dato del usuario.
 */
export function sinTocar(cfg: ProviderConfig, def: ProveedorPorDefecto): boolean {
  if (cfg.apiKey?.trim()) return false;
  if (cfg.enabled) return false;
  if ((cfg.baseUrl ?? "") !== (def.baseUrl ?? "")) return false;
  const a = cfg.models ?? [];
  const b = def.defaultModels;
  if (a.length !== b.length) return false;
  return a.every((m, i) => m === b[i]);
}

/** Se queda solo con los proveedores que el usuario ha tocado. */
export function proveedoresUtiles(
  providers: Partial<Record<ProviderId, ProviderConfig>>,
  defs: Partial<Record<ProviderId, ProveedorPorDefecto>>
): Partial<Record<ProviderId, ProviderConfig>> {
  const out: Partial<Record<ProviderId, ProviderConfig>> = {};
  for (const [id, cfg] of Object.entries(providers) as [ProviderId, ProviderConfig][]) {
    const def = defs[id];
    if (def && sinTocar(cfg, def)) continue;
    out[id] = cfg;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* empaquetado                                                        */
/* ------------------------------------------------------------------ */

/** Los tres trozos del blob en una sola tira: [sal 16][iv 12][cifrado]. */
function aplanar(blob: VaultBlob): Uint8Array {
  const salt = Uint8Array.from(blob.salt);
  const iv = Uint8Array.from(blob.iv);
  const data = Uint8Array.from(blob.data);
  const out = new Uint8Array(salt.length + iv.length + data.length);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(data, salt.length + iv.length);
  return out;
}

function desaplanar(bytes: Uint8Array): VaultBlob {
  if (bytes.length <= 28) throw new Error("El código está incompleto");
  return {
    v: 1,
    salt: Array.from(bytes.slice(0, 16)),
    iv: Array.from(bytes.slice(16, 28)),
    data: Array.from(bytes.slice(28)),
  };
}

/** base64 «url-safe»: sobrevive a pegarlo en un chat, un correo o una URL. */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const limpio = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const bin = atob(limpio.padEnd(Math.ceil(limpio.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Qué lleva dentro un paquete, para poder enseñarlo antes de aplicarlo. */
export function resumirBundle(b: TransferBundle): TransferResumen {
  const sesiones = b.sessions ?? [];
  return {
    proveedores: Object.values(b.providers ?? {}).filter((p) => p?.apiKey?.trim()).length,
    conversaciones: sesiones.length,
    mensajes: sesiones.reduce((n, s) => n + s.messages.length, 0),
    ajustes: !!b.settings,
    github: !!b.githubToken,
    fecha: b.at,
  };
}

/** Cifra el paquete y lo deja listo para copiar. */
export async function packTransfer(bundle: TransferBundle, frase: string): Promise<string> {
  if (frase.trim().length < MIN_FRASE) {
    throw new Error(`La frase debe tener al menos ${MIN_FRASE} caracteres`);
  }
  const blob = await encryptJson(frase.trim(), bundle);
  return TRANSFER_PREFIX + toBase64Url(aplanar(blob));
}

/**
 * Abre un paquete. Distingue los tres fallos posibles, porque el consejo es
 * distinto en cada caso: esto no es de Prism, esto está cortado, o la frase no
 * es la misma.
 */
export async function unpackTransfer(texto: string, frase: string): Promise<TransferBundle> {
  const limpio = texto.trim().replace(/\s+/g, "");
  if (!limpio.startsWith(TRANSFER_PREFIX)) {
    throw new Error("Eso no parece un código de Prism");
  }
  let blob: VaultBlob;
  try {
    blob = desaplanar(fromBase64Url(limpio.slice(TRANSFER_PREFIX.length)));
  } catch {
    throw new Error("El código está incompleto o mal copiado");
  }
  try {
    const b = await decryptJson<TransferBundle>(frase.trim(), blob);
    if (!b || typeof b !== "object" || b.v !== 1) throw new Error("formato");
    return b;
  } catch {
    throw new Error("La frase no coincide (o el código no es este)");
  }
}

/* ------------------------------------------------------------------ */
/* aplicar lo recibido                                                */
/* ------------------------------------------------------------------ */

export interface EstadoLocal {
  providers: Record<ProviderId, ProviderConfig>;
  sessions: Session[];
  settings: AppSettings;
}

/**
 * Mezcla lo recibido con lo que ya hay, sin destruir nada.
 *
 * Un «reemplazar» era más simple, pero llevarte las claves al portátil no
 * debería borrar las conversaciones que tengas ahí. Reglas:
 *  - Proveedores: solo entran los que traen clave; los tuyos vacíos se
 *    rellenan y los que ya tenías puestos NO se pisan.
 *  - Conversaciones: se unen por id, y si la misma está en los dos gana la de
 *    updatedAt más reciente.
 *  - Ajustes: solo si el paquete los trae, y en bloque.
 */
export function mergeTransfer(local: EstadoLocal, entrante: TransferBundle): EstadoLocal {
  const providers = { ...local.providers };
  for (const [id, cfg] of Object.entries(entrante.providers ?? {})) {
    if (!cfg?.apiKey?.trim()) continue;
    const actual = providers[id as ProviderId];
    if (actual?.apiKey?.trim()) continue; // lo que ya funciona aquí no se toca
    providers[id as ProviderId] = { ...actual, ...cfg };
  }

  const porId = new Map(local.sessions.map((s) => [s.id, s]));
  for (const s of entrante.sessions ?? []) {
    const mia = porId.get(s.id);
    if (!mia || s.updatedAt > mia.updatedAt) porId.set(s.id, s);
  }
  const sessions = [...porId.values()].sort((a, b) => b.updatedAt - a.updatedAt);

  return { providers, sessions, settings: entrante.settings ?? local.settings };
}
