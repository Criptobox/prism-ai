# Prism AI — imagen Docker para self-hosting (VPS, NAS, Raspberry…)
#
# Construir:  docker build -t prism-ai .
# Ejecutar:   docker run -p 3000:3000 prism-ai
#
# Si lo publicas en internet, pásale el código de acceso o las rutas propias
# quedan abiertas (ver README, «Si lo publicas en internet»):
#   docker run -p 3000:3000 -e PRISM_ACCESS_CODE=loquesea prism-ai
#
# Aprovecha `output: "standalone"` de next.config.ts: la imagen final lleva
# solo el servidor y sus dependencias, no todo node_modules.

FROM node:22-alpine AS builder
WORKDIR /app

# `npm ci` y no `npm install`: instala EXACTAMENTE el lockfile. Con `install`
# la imagen puede resolver versiones distintas a las probadas, que es el
# desfase que ya rompió un despliegue entero una vez.
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
