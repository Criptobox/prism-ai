#!/usr/bin/env node
/** Prism AI — Rellena la carpeta `standalone` después de compilar.
 *
 * `output: "standalone"` deja un servidor autónomo en `.next/standalone`, pero
 * sin los estáticos ni `public`: hay que copiarlos a mano. Eso es lo que hacía
 * el `cp` encadenado del script de build.
 *
 * Ahora va aquí porque en Vercel ese modo está apagado a propósito (ver
 * next.config.ts) y la carpeta no existe: el `cp` fallaba y tumbaba la build
 * entera con un error que no decía nada. Si no hay standalone, no hay nada que
 * copiar y se sale en silencio, que es lo correcto.
 */
import { cpSync, existsSync } from "node:fs";

const destino = ".next/standalone";
if (!existsSync(destino)) process.exit(0);

for (const [origen, dentro] of [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
]) {
  if (existsSync(origen)) cpSync(origen, dentro, { recursive: true });
}
