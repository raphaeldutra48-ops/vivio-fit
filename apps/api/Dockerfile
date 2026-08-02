# Imagem da API. Contexto de build = raiz do monorepo (não esta pasta),
# porque o pnpm precisa do workspace inteiro para resolver as dependências.
#
#   docker build -f apps/api/Dockerfile -t vivio-api .
#
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# corepack usa a versão fixada em "packageManager" do package.json da raiz.
RUN corepack enable
# O engine do Prisma é linkado contra OpenSSL; a imagem slim não traz.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- dependências -----------------------------------------------------------
# Só os manifestos primeiro: enquanto eles não mudarem, o Docker reaproveita
# a camada de instalação inteira.
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
# `FROM deps` e NÃO `FROM base` + copiar o node_modules da raiz.
#
# O pnpm põe os links entre workspaces no `node_modules` de CADA pacote, não no
# da raiz: `apps/api/node_modules/@vivio/{config,contracts}`,
# `packages/contracts/node_modules/@vivio/config`, e assim por diante. A raiz
# nem tem uma pasta `@vivio`. Copiar só ela deixava o contêiner sem nenhum link
# de workspace, e o build morria em `File '@vivio/config/tsconfig.base.json'
# not found` — com um erro de tipo em seguida, que era só consequência de o
# tsconfig base ter sumido.
#
# Herdar o estágio inteiro traz todos eles. O `COPY . .` abaixo não atropela
# nada: `node_modules` está no .dockerignore, então não vem do contexto.
FROM deps AS build
COPY . .
# O client do Prisma é gerado a partir do schema — precisa vir antes do compile.
RUN pnpm --filter @vivio/api exec prisma generate
RUN pnpm exec turbo run build --filter=@vivio/api

# --- produção ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# Usuário sem privilégios: a imagem node já traz "node" (uid 1000).
USER node
WORKDIR /app

# node_modules vem inteiro, com as dependências de desenvolvimento: `tsx` é uma
# delas e é o que executa os scripts de instalação (prisma/criar-admin.ts e
# prisma/semear-catalogo.ts). Trocar por uma instalação `--prod` aqui quebraria
# os dois — e o erro só apareceria no dia de subir.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
# `packages` vem do estágio de build, então traz junto o node_modules de cada
# pacote — é lá que moram os links de workspace que o require() vai seguir.
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=node:node /app/apps/api/entrada.sh ./apps/api/

WORKDIR /app/apps/api
EXPOSE 3333

# Migração, tarefas de instalação acionadas por variável, e então a API.
# Ver apps/api/entrada.sh.
CMD ["sh", "./entrada.sh"]
