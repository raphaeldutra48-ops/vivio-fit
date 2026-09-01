#!/usr/bin/env bash
# Escreve apps/api/.env.supabase com as duas conexões da migração.
#
# Existe para as credenciais nunca passarem pelo chat. O que você digitar aqui
# fica neste computador: a entrada não é ecoada na tela e não entra no
# histórico do shell, porque é `read` e não argumento de comando.
#
#   bash apps/api/prisma/configurar-migracao.sh
set -euo pipefail

cd "$(dirname "$0")/../../.."
destino="apps/api/.env.supabase"

echo
echo "Duas conexões, as duas na forma DIRECT (sem '-pooler' no endereço)."
echo "Migração e cópia em transação longa não funcionam pelo pooler."
echo
echo "  ORIGEM  — Neon:     console.neon.tech > projeto > Connection string"
echo "  DESTINO — Supabase: Project Settings > Database > Connection string > URI"
echo
echo "Cole cada uma e tecle Enter. Nada aparece na tela enquanto você cola."
echo

read -r -s -p "1/2  URI DIRECT do Neon (produção): " neon
echo
read -r -s -p "2/2  URI DIRECT do Supabase:        " supabase
echo

erro=0
for par in "Neon:$neon" "Supabase:$supabase"; do
  nome="${par%%:*}"
  uri="${par#*:}"
  if [ -z "$uri" ]; then
    echo "  ✗ $nome: vazio."; erro=1; continue
  fi
  case "$uri" in
    postgresql://*|postgres://*) ;;
    *) echo "  ✗ $nome: não começa com postgresql://"; erro=1; continue ;;
  esac
  # O pooler é o engano provável, e falha só lá na frente, no meio da cópia.
  case "$uri" in
    *-pooler.*) echo "  ✗ $nome: é a string do POOLER. Pegue a 'Direct connection'."; erro=1 ;;
    *) echo "  ✓ $nome: parece direct." ;;
  esac
done
[ "$erro" -eq 0 ] || { echo; echo "Nada foi escrito. Corrija e rode de novo."; exit 1; }

umask 077   # só o dono lê o arquivo
# Aspas simples em volta do valor: a URI traz `?sslmode=require&channel_binding=...`
# e o `&` sem aspas vira separador de comando ao carregar o arquivo com
# `source` — a variável ficava cortada no meio, e o erro só aparecia depois,
# como "sem NEON_PROD_URL".
{
  printf "NEON_PROD_URL='%s'\n" "$neon"
  printf "SUPABASE_DIRECT_URL='%s'\n" "$supabase"
} > "$destino"

echo
echo "Escrito em $destino"
git check-ignore -q "$destino" \
  && echo "Confirmado: está fora do git." \
  || echo "ATENÇÃO: NÃO está sendo ignorado pelo git. Não faça commit."
echo
echo "Pode voltar no chat e dizer 'pronto'."
