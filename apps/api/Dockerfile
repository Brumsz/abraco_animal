# syntax=docker/dockerfile:1.7
# Build a partir da raiz do monorepo:  docker build -f apps/api/Dockerfile .
# Build e runtime em Debian 13 (trixie) para a glibc dos módulos nativos bater.

# ── deps: instala dependências com o lockfile congelado ───────────────
FROM node:24.22.2-trixie-slim AS deps
ENV CI=true
RUN npm install -g pnpm@12.18.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ── build: compila e separa só as dependências de produção ────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @abraco/api build \
 && pnpm --filter @abraco/api deploy --prod --legacy /out

# ── runtime: distroless, sem shell nem gerenciador de pacotes ─────────
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER nonroot
EXPOSE 3333
CMD ["dist/main.js"]
