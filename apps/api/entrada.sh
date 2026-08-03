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

# O contêiner roda como `node`, sem privilégio. Volume montado com dono errado
# é o tipo de falha que só apareceria quando alguém subisse a primeira foto — e
# aí o upload quebra na cara do usuário. Melhor descobrir no boot.
if [ -n "$MEDIA_DIR" ]; then
  if mkdir -p "$MEDIA_DIR" 2>/dev/null && touch "$MEDIA_DIR/.escrita-ok" 2>/dev/null; then
    rm -f "$MEDIA_DIR/.escrita-ok"
    echo "→ mídia gravável em $MEDIA_DIR"
  else
    echo "!! SEM PERMISSÃO DE ESCRITA em $MEDIA_DIR — o envio de foto vai falhar."
  fi
fi

if [ -n "$ADMIN_EMAIL" ]; then
  echo "→ ADMIN_EMAIL presente: criando o primeiro administrador"
  npm run --silent criar-admin
  echo "→ pronto. Apague ADMIN_EMAIL e ADMIN_SENHA das variáveis do serviço."
fi

# Saída de emergência: admin trancado fora da própria conta. Vem antes do
# catálogo porque, se a conta está inacessível, é o que a pessoa precisa agora.
if [ -n "$REDEFINIR_SENHA_EMAIL" ]; then
  echo "→ REDEFINIR_SENHA_EMAIL presente: redefinindo a senha do admin"
  npm run --silent redefinir-senha
  echo "→ pronto. Apague REDEFINIR_SENHA_EMAIL e REDEFINIR_SENHA_NOVA."
fi

if [ "$SEMEAR_CATALOGO" = "true" ]; then
  echo "→ SEMEAR_CATALOGO=true: populando exercícios e alimentos"
  npm run --silent semear-catalogo
  echo "→ pronto. Pode remover SEMEAR_CATALOGO."
fi

set -e
exec node dist/main.js
