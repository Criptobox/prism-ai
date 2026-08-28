#!/usr/bin/env node
/**
 * Prism AI — Instalador multiplataforma (Windows / macOS / Linux)
 * Uso: npm run setup   |   node scripts/setup.mjs
 *
 * Qué hace:
 *   1. Comprueba la versión de Node.js (Next.js 16 requiere >= 20.9)
 *   2. Instala las dependencias con npm
 *   3. Crea .env.local desde .env.example (si no existe)
 *   4. Muestra los siguientes pasos
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_NODE = 20; // major mínimo (Next.js 16)
const REQUIRED_MINOR = 9;

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  violet: "\x1b[35m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

/* Resaltado simple para markdown en consola (evita dependencias externas) */
function mdBoldLines(text) {
  return text.replace(/\*\*(.+?)\*\*/g, `${c.bold}$1${c.reset}`);
}

function banner() {
  console.log(`
${c.violet}${c.bold}
    ____  _____ _______  __  ___  ______ ______
   /  _ \\|_   _|\\__   __|/  |/  / /  __  \\__   \\
  /  /_\\  \\| |     | |  /  | /  / |  |  |  |   |
 /    |    \\| |     | | /  |/  /  |  |  |  |   |
 \\____|____/|_|     |_|/__/|__/   |__|__|__|___|
${c.reset}
${c.bold}  Prism AI${c.reset} ${c.dim}· Un prisma, todos tus modelos${c.reset}
${c.dim}  Chat PWA con tus propias APIs · solo modelos gratis${c.reset}
`);
}

function step(n, total, msg) {
  console.log(`\n${c.cyan}[${n}/${total}]${c.reset} ${msg}`);
}

function ok(msg) {
  console.log(`  ${c.green}[ok]${c.reset} ${msg}`);
}

function warn(msg) {
  console.log(`  ${c.yellow}[!]${c.reset} ${msg}`);
}

function fail(msg) {
  console.error(`\n  ${c.red}[X] ${msg}${c.reset}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return res.status === 0;
}

banner();

// ——— 1. Versión de Node ———
step(1, 3, "Comprobando Node.js…");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < REQUIRED_NODE || (major === REQUIRED_NODE && minor < REQUIRED_MINOR)) {
  console.error(`\n  Detectado: Node ${process.versions.node}`);
  fail(
    `Prism AI usa Next.js 16, que requiere Node ${REQUIRED_NODE}.${REQUIRED_MINOR} o superior.\n` +
      `  Descarga la versión LTS desde https://nodejs.org y vuelve a ejecutar este instalador.`
  );
}
ok(`Node ${process.versions.node} (${process.platform})`);

// ——— 2. Dependencias ———
step(2, 3, "Instalando dependencias (puede tardar unos minutos)…");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
if (!run(npmCmd, ["install", "--no-fund", "--no-audit"])) {
  fail("npm install falló. Revisa tu conexión e inténtalo de nuevo con: npm install");
}
ok("Dependencias instaladas");

// ——— 3. .env.local ———
step(3, 3, "Preparando el entorno…");
const envExample = join(ROOT, ".env.example");
const envLocal = join(ROOT, ".env.local");
if (existsSync(envLocal)) {
  warn(".env.local ya existe, no se toca");
} else if (existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  ok(".env.local creado desde .env.example");
} else {
  warn(".env.example no encontrado, se omite (no es obligatorio)");
}

// ——— Resumen ———
const nextSteps = mdBoldLines(`
${c.bold}¡Instalación completada!${c.reset}

  ${c.bold}Arranca la app${c.reset}
    npm run dev            ${c.dim}→ http://localhost:3000${c.reset}

  ${c.bold}Conecta tus modelos gratis (1 minuto)${c.reset}
    Al abrir la app, el **asistente de primera ejecución** te guía para pegar
    tu clave de AiHubMix (https://aihubmix.com/apikey).
    También puedes añadir Gemini (https://aistudio.google.com/app/apikey)
    o Groq (https://console.groq.com/keys) en **Ajustes → Proveedores**.

  ${c.bold}Instálala como app${c.reset}
    Chrome/Edge → icono «Instalar» en la barra de direcciones.

  ${c.dim}Producción local: npm run build && npm start${c.reset}
`);
console.log(nextSteps);
