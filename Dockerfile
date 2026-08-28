# Prism AI — imagen Docker para self-hosting (VPS, NAS, Raspberry…)
# Construir:  docker build -t prism-ai .
# Ejecutar:   docker run -p 3000:3000 prism-ai

FROM node:22-alpine AS builder
WORKDIR /app

# dependencias
COPY package.json ./
RUN npm install --no-fund --no-audit

# código y cliente Prisma
COPY . .
RUN npx prisma generate || true
ENV DATABASE_URL=file:./db/docker.db
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
