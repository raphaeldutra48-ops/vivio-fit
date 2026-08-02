# Imagem da web. Contexto de build = raiz do monorepo.
#
#   docker build -f apps/web/Dockerfile -t vivio-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.seudominio.com.br .
#
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- dependências -----------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY packages/ui-native/package.json packages/ui-native/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# --- build ------------------------------------------------------------------
# `FROM deps` pela mesma razão do Dockerfile da API: o pnpm põe os links entre
# workspaces no `node_modules` de cada pacote, não no da raiz. Copiar só a raiz
# deixa o build sem `@vivio/config`, `@vivio/contracts`, `@vivio/sdk` e
# `@vivio/ui` — e a web depende dos quatro.
FROM deps AS build
COPY . .

# NEXT_PUBLIC_* é embutido no JavaScript durante o build, não lido em runtime.
# Por isso entra como build-arg: mudar a URL da API exige reconstruir a imagem.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# turbo constrói as dependências do workspace na ordem certa (dependsOn ^build),
# então acrescentar um pacote novo não exige mexer aqui.
RUN pnpm exec turbo run build --filter=@vivio/web

# --- produção ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
USER node
WORKDIR /app

# O modo standalone já traz o node_modules mínimo dentro do bundle.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# Nota: quando existir apps/web/public (favicon, imagens), acrescentar aqui:
# COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
