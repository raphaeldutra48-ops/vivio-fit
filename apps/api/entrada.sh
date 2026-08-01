#!/bin/sh
# Entrada do contêiner da API.
#
# Existe porque no Railway não há terminal para rodar um script avulso: o que
# se controla é a variável de ambiente e o deploy. Então as duas tarefas de
# instalação (criar o admin e semear o catálogo) são acionadas por variável,
# executam uma vez e somem quando a variável é removida.
#
# Ambas são idempotentes — rodar de novo não duplica nada.

set -e

# Migração NÃO é opcional: o código recém-subido pressupõe o schema novo.
# `deploy` (e não `dev`) só aplica o que já existe; nunca gera nem apaga.
echo "→ aplicando migrações"
node ../../node_modules/prisma/build/index.js migrate deploy

# A partir daqui, falha de tarefa opcional não pode impedir a API de subir:
# derrubar o serviço porque uma tarefa de instalação falhou é pior do que
# subir e mostrar o erro no log.
set +e

if [ -n "$ADMIN_EMAIL" ]; then
  echo "→ ADMIN_EMAIL presente: criando o primeiro administrador"
  npm run --silent criar-admin
  echo "→ pronto. Apague ADMIN_EMAIL e ADMIN_SENHA das variáveis do serviço."
fi

if [ "$SEMEAR_CATALOGO" = "true" ]; then
  echo "→ SEMEAR_CATALOGO=true: populando exercícios e alimentos"
  npm run --silent semear-catalogo
  echo "→ pronto. Pode remover SEMEAR_CATALOGO."
fi

set -e
exec node dist/main.js
