/** Prism AI — Catálogo de skills.
 *
 * Instalar desde URL ya funcionaba —y con la puerta de permisos delante—, pero
 * había que **conocer la URL de memoria**. Lo que faltaba no era el mecanismo:
 * era el índice.
 *
 * El índice es un JSON estático. No hay backend, ni cuentas, ni moderación que
 * mantener: se sirve como cualquier otro archivo. Y cada entrada se instala por
 * el camino que ya existía, así que **la puerta de permisos sigue en medio**.
 * Eso es lo que permite que un catálogo abierto no sea un agujero.
 *
 * Aquí solo se valida y se busca, sin red y sin React.
 */
import type { TaskKind } from "./task-router";

/** De dónde se lee. Sale del propio despliegue para que funcione sin depender
 *  de nadie; apuntarlo a un repo público es cambiar esta constante. */
export const URL_CATALOGO = "/skills/index.json";

export interface EntradaCatalogo {
  id: string;
  name: string;
  description: string;
  icon: string;
  autor?: string;
  kinds?: TaskKind[];
  /** dónde están las instrucciones */
  url: string;
}

const KINDS_VALIDOS = new Set(["web", "code", "write", "reason", "data", "chat"]);

function esEntrada(x: unknown): x is EntradaCatalogo {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    !!e.id &&
    typeof e.name === "string" &&
    !!e.name &&
    typeof e.url === "string" &&
    !!e.url
  );
}

/**
 * Valida el índice descargado.
 *
 * Se descartan las entradas mal formadas en vez de rechazar el índice entero:
 * un catálogo con una entrada rota sigue sirviendo para las demás. Lo que NO
 * se hace es rellenar huecos —una entrada sin `url` no se puede instalar, así
 * que fuera.
 */
export function parseCatalogo(json: unknown): EntradaCatalogo[] {
  if (!json || typeof json !== "object") return [];
  const lista = (json as { skills?: unknown }).skills;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: EntradaCatalogo[] = [];
  for (const x of lista) {
    if (!esEntrada(x)) continue;
    if (vistos.has(x.id)) continue;
    vistos.add(x.id);
    const kinds = Array.isArray(x.kinds)
      ? (x.kinds.filter((k) => typeof k === "string" && KINDS_VALIDOS.has(k)) as TaskKind[])
      : undefined;
    out.push({
      id: x.id,
      name: String(x.name).slice(0, 60),
      description: String(x.description ?? "").slice(0, 200),
      icon: String(x.icon ?? "⚡").slice(0, 4),
      autor: x.autor ? String(x.autor).slice(0, 60) : undefined,
      kinds: kinds?.length ? kinds : undefined,
      url: x.url,
    });
  }
  return out;
}

/** Búsqueda por texto y por tipo de encargo. Sin puntuaciones raras: coincide
 *  o no coincide, que con un catálogo de este tamaño es lo honesto. */
export function buscarEnCatalogo(
  entradas: EntradaCatalogo[],
  texto: string,
  kind?: TaskKind | null
): EntradaCatalogo[] {
  const q = texto.trim().toLowerCase();
  return entradas.filter((e) => {
    if (kind && !(e.kinds ?? []).includes(kind)) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.autor ?? "").toLowerCase().includes(q)
    );
  });
}

/** ¿Ya está instalada? Se compara por nombre porque el id del catálogo no
 *  sobrevive a la instalación (el store genera el suyo). */
export function yaInstalada(e: EntradaCatalogo, nombresInstalados: string[]): boolean {
  const n = e.name.trim().toLowerCase();
  return nombresInstalados.some((x) => x.trim().toLowerCase() === n);
}
