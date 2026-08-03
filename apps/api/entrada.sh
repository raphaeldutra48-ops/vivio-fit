#!/bin/sh
# Entrada do contêiner da API.
#
# Existe porque no Railway não há terminal para rodar um script avulso: o que
# se controla é a variável de ambiente e o deploy. Então as tarefas de
# instalação (criar o admin, redefinir senha, semear o catálogo) são acionadas
# por variável, executam uma vez e somem quando a variável é removida.
#
# Todas são idempotentes — rodar de novo não duplica nada.
#
# O contêiner começa como ROOT e desce para `node` antes de executar qualquer
# coisa. Isso não é descuido: o volume de mídia é montado pelo Railway com dono
# root, e sem ajustar isso o processo sem privilégio não escreve nele — o envio
# da primeira foto falharia, e só ali alguém descobriria.

set -e

# --- ajuste de privilégio (só quando somos root) -----------------------------

if [ "$(id -u)" = "0" ] && [ -n "$MEDIA_DIR" ]; then
  mkdir -p "$MEDIA_DIR"
  chown -R node:node "$MEDIA_DIR"
fi

# Executa como `node` quando estamos root; direto quando já não somos. Assim o
# script funciona igual no Railway e rodando à mão em desenvolvimento.
como_node() {
  if [ "$(id -u)" = "0" ]; then
    gosu node "$@"
  else
    "$@"
  fi
}

# --- migração ----------------------------------------------------------------

# Migração NÃO é opcional: o código recém-subido pressupõe o schema novo.
# `deploy` (e não `dev`) só aplica o que já existe; nunca gera nem apaga.
echo "→ aplicando migrações"
como_node node ../../node_modules/prisma/build/index.js migrate deploy

# A partir daqui, falha de tarefa opcional não pode impedir a API de subir:
# derrubar o serviço porque uma tarefa de instalação falhou é pior do que
# subir e mostrar o erro no log.
set +e

# --- diagnóstico de mídia ----------------------------------------------------

# Confere a escrita com o MESMO usuário que vai gravar as fotos. Testar como
# root não provaria nada.
if [ -n "$MEDIA_DIR" ]; then
  if como_node sh -c "mkdir -p '$MEDIA_DIR' && touch '$MEDIA_DIR/.escrita-ok'" 2>/dev/null; then
    como_node rm -f "$MEDIA_DIR/.escrita-ok"
    echo "→ mídia gravável em $MEDIA_DIR"
  else
    echo "!! SEM PERMISSÃO DE ESCRITA em $MEDIA_DIR — o envio de foto vai falhar."
  fi
fi

# --- tarefas de instalação ---------------------------------------------------

if [ -n "$ADMIN_EMAIL" ]; then
  echo "→ ADMIN_EMAIL presente: criando o primeiro administrador"
  como_node npm run --silent criar-admin
  echo "→ pronto. Apague ADMIN_EMAIL e ADMIN_SENHA das variáveis do serviço."
fi

# Saída de emergência: admin trancado fora da própria conta. Vem antes do
# catálogo porque, se a conta está inacessível, é o que a pessoa precisa agora.
if [ -n "$REDEFINIR_SENHA_EMAIL" ]; then
  echo "→ REDEFINIR_SENHA_EMAIL presente: redefinindo a senha do admin"
  como_node npm run --silent redefinir-senha
  echo "→ pronto. Apague REDEFINIR_SENHA_EMAIL e REDEFINIR_SENHA_NOVA."
fi

if [ "$SEMEAR_CATALOGO" = "true" ]; then
  echo "→ SEMEAR_CATALOGO=true: populando exercícios e alimentos"
  como_node npm run --silent semear-catalogo
  echo "→ pronto. Pode remover SEMEAR_CATALOGO."
fi

# --- aplicação ---------------------------------------------------------------

set -e

# `exec` para o processo da API virar o PID 1 e receber os sinais de parada do
# Railway direto — sem isso, o desligamento gracioso não acontece.
if [ "$(id -u)" = "0" ]; then
  exec gosu node node dist/main.js
else
  exec node dist/main.js
fi
