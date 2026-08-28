#!/usr/bin/env sh
# Prism AI — instalador para macOS / Linux (doble clic o ./setup.sh)
# Requiere Node.js 20.9+: https://nodejs.org
set -e
cd "$(dirname "$0")"
node scripts/setup.mjs
