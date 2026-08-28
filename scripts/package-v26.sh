#!/usr/bin/env bash
# Prism AI — Empaquetado del código fuente listo para GitHub (v3.1)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$ROOT/.zscripts/stage-v26"
OUT="$ROOT/download/prism-ai-v3.1-codigo-fuente.zip"

rm -rf "$STAGE" && mkdir -p "$STAGE"
cd "$ROOT"

rsync -a \
  --exclude node_modules/ \
  --exclude .next/ \
  --exclude dev.log \
  --exclude 'download/' \
  --exclude 'workspace/' \
  --exclude 'upload/' \
  --exclude 'tool-results/' \
  --exclude '.zscripts/' \
  --exclude 'db/' \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '*.zip' \
  --exclude 'agent-ctx/' \
  --exclude 'skills/' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'worklog.md' \
  --exclude 'Caddyfile' \
  --exclude 'scripts/*.png' \
  --exclude 'scripts/*.log' \
  --exclude 'scripts/*.json' \
  --exclude '__pycache__/' \
  ./ "$STAGE/"

cd "$STAGE"
rm -f "$OUT"
zip -qr "$OUT" .
echo "== Archivos en el paquete:"
unzip -l "$OUT" | tail -1
unzip -l "$OUT" | grep -cE "^\s+[0-9]+\s+[0-9-]+" || true
echo "== Contenido raíz:"
unzip -l "$OUT" | awk '{print $4}' | grep -v "/" | grep -v "^$" | sort | head -20
echo "== Chequeo de ausencias:"
unzip -l "$OUT" | awk '{print $4}' | grep -E "^(node_modules|\.next/|dev\.log|\.env\.local|download/|skills/)" | head -5 && echo "⚠ FILTRADO FALLÓ" || echo "OK: sin basura"
echo "== Tamaño:"
du -h "$OUT" | cut -f1
