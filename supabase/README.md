# Funções de borda

O que precisa de uma chave de API e de uma chamada à internet — duas coisas que
não cabem no navegador nem dentro do Postgres.

Hoje há uma só: **`ler-dieta`**, que transforma o PDF ou a foto de um plano
alimentar em texto estruturado. É a última peça que morava na API NestJS; todo o
resto do app fala direto com o banco.

## Implantar

Precisa da CLI do Supabase (`npm i -g supabase`) e de estar logado na conta do
projeto (`supabase login`).

```bash
supabase link --project-ref ywjcixyrckqrwknrxrfh
supabase functions deploy ler-dieta
supabase secrets set ANTHROPIC_API_KEY=<a chave>
```

A chave da Anthropic é sua e não passa por aqui: `supabase secrets set` a envia
direto da sua máquina para o projeto, e ela nunca entra no repositório.

## Enquanto não estiver implantada

A tela de importação de dieta responde com "a leitura automática não está
configurada" — e o resto do app segue inteiro. É o mesmo comportamento que a API
tinha sem `ANTHROPIC_API_KEY`: derrubar o que funciona por causa de um recurso
opcional que ninguém configurou seria a troca errada.

## O que a função NÃO decide

Nada sobre acesso. Antes de mandar qualquer byte para fora ela pergunta ao banco
(`falta_para_ler_dieta`), e o banco responde o que falta:

- **vínculo** com o aluno,
- consentimento de **NUTRICAO** — quem pode ver a dieta dele,
- consentimento de **LEITURA_AUTOMATICA** — se o documento de saúde dele pode
  ser enviado a um serviço de terceiro, fora do país, para ser lido por máquina.

São dois consentimentos porque são duas perguntas. Quem autoriza o profissional
a **ver** não autorizou, com isso, uma empresa estrangeira a **processar**; a
LGPD pede consentimento específico e destacado por finalidade, e reaproveitar o
de nutrição aqui seria usar um "sim" dado para outra pergunta.

A função também confere que a chave do arquivo começa com `materiais/<quem
chamou>/`. Sem isso, bastava saber a chave alheia para mandar ler o arquivo de
outra pessoa — inclusive um laudo de exame.

## O que ela devolve

O que o modelo leu, cru. Quem valida contra o contrato é o SDK, com o mesmo
`zod` que a tela usa: a saída estruturada garante o **formato**, não os limites
do domínio, e nada impede o modelo de devolver 9000 g num item.

O casamento com o catálogo de alimentos acontece no SDK, com
`montarLeituraDeDieta` de `@vivio/contracts` — a mesma função que a API usa,
para que as duas não sugiram alimentos diferentes para o mesmo documento.
