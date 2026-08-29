/** Prism AI — «Copiar diagnóstico»: lo que hace falta para arreglar un fallo.
 *
 * Nace de una tarde entera detrás de un «Failed to fetch» a base de capturas de
 * pantalla. Lo que hacía falta —qué copia corría, qué proveedor, qué código
 * devolvió— estaba repartido por tres sitios de la interfaz y ninguno se podía
 * pegar en un mensaje.
 *
 * Regla dura: aquí NO entra ni una clave, ni un trozo de conversación. El
 * informe está pensado para pegarlo en un chat público, así que se construye
 * quitando, no confiando. Cada campo que sale de datos del usuario pasa por
 * `sinSecretos`, y hay tests que meten claves por todos los huecos y comprueban
 * que no aparecen en el texto.
 */

export interface ProveedorDiag {
  id: string;
  nombre: string;
  activo: boolean;
  tieneClave: boolean;
  /** longitud de la clave: distingue «vacía» de «pegada a medias» sin enseñarla */
  largoClave: number;
  modelos: number;
  porProxy: boolean;
  /** URL propia si la hay, ya limpia de credenciales */
  baseUrl?: string;
}

export interface ModeloConFalloDiag {
  clave: string;
  estado: number;
  motivo?: string;
  enfriadoHasta?: number;
}

export interface EntradaDiagnostico {
  version: string;
  commit: string;
  built: string;
  userAgent: string;
  idioma: string;
  pantalla: string;
  online: boolean;
  instalada: boolean;
  modeloPorDefecto: string;
  proveedores: ProveedorDiag[];
  fallos: ModeloConFalloDiag[];
  sesiones: number;
  mensajes: number;
  ahora?: number;
}

/**
 * Deja una URL utilizable para depurar y sin nada que valga robar.
 *
 * Se queda con el origen y la ruta. Fuera la query y el usuario:contraseña,
 * porque hay proveedores que llevan la clave en `?key=` y ese es justo el campo
 * que la gente pega sin mirar.
 */
export function sinSecretos(url: string): string {
  const limpia = url.trim();
  if (!limpia) return "";
  try {
    const u = new URL(limpia);
    u.search = "";
    u.hash = "";
    u.username = "";
    u.password = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    // Una ruta relativa («/api/mock-llm») o algo que no es URL: se corta por el
    // primer «?» y se queda solo lo de antes, que no puede llevar credenciales.
    return limpia.split(/[?#]/)[0];
  }
}

function siNo(v: boolean): string {
  return v ? "sí" : "no";
}

/** «1 conversación», «2 conversaciones». Un informe con faltas invita a no leerlo. */
function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** El informe, en texto plano listo para pegar. */
export function textoDiagnostico(e: EntradaDiagnostico): string {
  const ahora = e.ahora ?? Date.now();
  const L: string[] = [];

  L.push("=== Diagnóstico de Prism AI ===");
  L.push(`Copia: v${e.version}${e.commit ? ` · ${e.commit}` : ""}${e.built ? ` · compilada ${e.built}` : ""}`);
  L.push(`Navegador: ${e.userAgent}`);
  L.push(`Idioma: ${e.idioma} · Pantalla: ${e.pantalla} · Instalada: ${siNo(e.instalada)} · Conexión: ${e.online ? "sí" : "sin red"}`);
  L.push(`Modelo por defecto: ${e.modeloPorDefecto || "(ninguno)"}`);
  L.push("");

  // Solo los que el usuario ha tocado. El catálogo entero son diecisiete, y
  // dieciséis líneas de «apagado · clave: NO» entierran la que importa.
  const puestos = e.proveedores.filter((p) => p.activo || p.tieneClave);
  const resto = e.proveedores.length - puestos.length;

  L.push(`Proveedores configurados (${puestos.length}${resto ? ` de ${e.proveedores.length}` : ""}):`);
  if (!puestos.length) {
    L.push("  (ninguno configurado)");
  }
  for (const p of puestos) {
    const partes = [
      p.activo ? "activo" : "apagado",
      `clave: ${p.tieneClave ? `sí (${p.largoClave} caracteres)` : "NO"}`,
      `modelos: ${p.modelos}`,
      `proxy: ${siNo(p.porProxy)}`,
    ];
    if (p.baseUrl) partes.push(`url: ${p.baseUrl}`);
    L.push(`  - ${p.nombre} [${p.id}] — ${partes.join(" · ")}`);
  }
  if (resto) L.push(`  (otros ${resto} del catálogo, sin tocar)`);
  L.push("");

  if (e.fallos.length) {
    L.push(`Modelos que están fallando (${e.fallos.length}):`);
    for (const f of e.fallos) {
      const frio =
        f.enfriadoHasta && f.enfriadoHasta > ahora
          ? ` · enfriado ${Math.ceil((f.enfriadoHasta - ahora) / 1000)}s`
          : "";
      L.push(`  - ${f.clave} — HTTP ${f.estado || "sin respuesta"}${f.motivo ? ` (${f.motivo})` : ""}${frio}`);
    }
  } else {
    L.push("Modelos que están fallando: ninguno");
  }
  L.push("");

  L.push(
    `Datos locales: ${plural(e.sesiones, "conversación", "conversaciones")} · ${plural(e.mensajes, "mensaje", "mensajes")}`
  );
  L.push("");
  L.push("Sin claves ni texto de conversaciones: este informe se puede pegar en cualquier sitio.");

  return L.join("\n");
}
