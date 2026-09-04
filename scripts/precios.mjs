#!/usr/bin/env node
/** Prism AI — Regenerar la tabla de precios desde un catálogo público.
 *
 * Ningún precio de esta app está escrito a mano. Todos salen de aquí, y este
 * script los baja de un catálogo mantenido por terceros: el
 * `model_prices_and_context_window.json` de LiteLLM (BerriAI), que es el que
 * usan sus propios cálculos de coste, lleva 3.500+ modelos y se actualiza a
 * diario. Licencia MIT, igual que Prism.
 *
 * ——— Por qué generado y no tecleado ———
 *
 * Un precio escrito a mano envejece en silencio y nadie se entera hasta que la
 * factura no cuadra. Generado, se ve la fecha, se ve la fuente y se puede
 * volver a ejecutar. Si alguna vez un número de la app no cuadra, la pregunta
 * no es «quién lo puso» sino «de qué día es la instantánea».
 *
 *   npm run precios          → baja el catálogo y regenera la tabla
 *
 * Lo que se guarda es un SUBCONJUNTO: solo los proveedores que Prism ofrece y
 * solo los campos que se usan. El catálogo entero son 2 MB y no tiene sentido
 * meterlos en el navegador para enseñar el gasto de cuatro modelos.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FUENTE =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** De cómo llama LiteLLM al proveedor, a cómo lo llama Prism. Lo que no esté
 * aquí no se guarda: son proveedores que Prism no ofrece. */
const PROVEEDORES = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "gemini",
  groq: "groq",
  mistral: "mistral",
  deepseek: "deepseek",
  xai: "xai",
  nvidia_nim: "nvidia",
  cerebras: "cerebras",
  moonshot: "kimi",
  openrouter: "openrouter",
  zai: "zai",
};

const CAMPOS = [
  ["input_cost_per_token", "in"],
  ["output_cost_per_token", "out"],
  ["cache_read_input_token_cost", "cr"],
  ["cache_creation_input_token_cost", "cw"],
];

async function main() {
  process.stdout.write(`Bajando ${FUENTE}\n`);
  const res = await fetch(FUENTE, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    console.error(`No se pudo bajar el catálogo: HTTP ${res.status}`);
    process.exit(1);
  }
  const crudo = await res.json();

  const tabla = {};
  for (const [clave, v] of Object.entries(crudo)) {
    if (!v || typeof v !== "object") continue;
    const proveedor = PROVEEDORES[v.litellm_provider];
    if (!proveedor) continue;
    // solo modelos de chat: los de embeddings, imagen o audio no entran en el
    // gasto que este panel explica
    if (v.mode != null && v.mode !== "chat") continue;
    const ent = {};
    for (const [origen, destino] of CAMPOS) {
      const val = v[origen];
      // el 0 se descarta a propósito: un «gratis» del catálogo no es un dato
      // que queramos afirmar, y `isFreeModel` ya decide eso por su cuenta
      if (typeof val === "number" && Number.isFinite(val) && val > 0) ent[destino] = val;
    }
    if (ent.in == null) continue; // sin precio de entrada no hay nada que calcular
    ent.p = proveedor;
    tabla[clave] = ent;
  }

  const claves = Object.keys(tabla).sort();
  const ordenada = {};
  for (const k of claves) ordenada[k] = tabla[k];

  const hoy = new Date().toISOString().slice(0, 10);
  const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "prism", "precios-datos.ts");
  const cuerpo = `/** GENERADO POR \`npm run precios\` — NO EDITAR A MANO.
 *
 * Precios por token, en dólares, de ${claves.length} modelos.
 *
 *  · Fuente: ${FUENTE}
 *    (LiteLLM, BerriAI — licencia MIT, la misma que Prism)
 *  · Instantánea del ${hoy}
 *
 * Los precios cambian sin avisar. Lo que la app enseña siempre lleva esta
 * fecha al lado, y cuando la instantánea se queda vieja lo dice en vez de
 * seguir enseñando un número con cara de actual.
 *
 * Campos: \`in\` entrada · \`out\` salida · \`cr\` lectura de caché ·
 * \`cw\` escritura de caché · \`p\` proveedor en Prism. Todos por TOKEN.
 */
export const PRECIOS_FECHA = "${hoy}";
export const PRECIOS_FUENTE = "${FUENTE}";
export const PRECIOS_FUENTE_NOMBRE = "LiteLLM (BerriAI), MIT";

export interface PrecioToken {
  /** dólares por token de entrada */
  in: number;
  /** dólares por token de salida */
  out?: number;
  /** dólares por token leído de la caché del prompt */
  cr?: number;
  /** dólares por token escrito a la caché */
  cw?: number;
  /** proveedor, con el id que usa Prism */
  p: string;
}

export const PRECIOS: Record<string, PrecioToken> = ${JSON.stringify(ordenada, null, 0)};
`;
  writeFileSync(salida, cuerpo);
  const kb = (Buffer.byteLength(cuerpo) / 1024).toFixed(1);
  process.stdout.write(`Escritos ${claves.length} modelos en ${salida} (${kb} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
