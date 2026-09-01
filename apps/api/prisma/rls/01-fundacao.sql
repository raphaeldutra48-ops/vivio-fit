-- Fundação do acesso por RLS: as três condições, em SQL.
--
-- Traduz o que hoje são três guards do NestJS:
--   1. JwtAuthGuard   -> auth.uid() não nulo
--   2. CareLinkGuard  -> vínculo ATIVO entre profissional e aluno
--   3. ConsentGuard   -> consentimento vigente para o ESCOPO pedido
--
-- As funções ficam em `SECURITY DEFINER` porque precisam ler `Vinculo` e
-- `Consentimento` ignorando as políticas dessas próprias tabelas — sem isso a
-- checagem entraria em recursão infinita ao consultar a tabela que ela protege.
--
-- `search_path` fixo em cada função: sem isso, um schema plantado pelo chamador
-- poderia sequestrar o nome `public."Vinculo"` e a checagem passaria a olhar
-- uma tabela falsa.
--
-- ## Cada função tem de ser segura SOZINHA
--
-- No NestJS os três guards rodavam em ordem, e o de consentimento podia
-- assumir que o de vínculo já tinha passado. Em RLS não há ordem: uma política
-- pode chamar só `tem_consentimento`, e ela precisa se defender inteira.
--
-- Custou um teste descobrir: sem sessão, `tem_consentimento` devolvia TRUE. O
-- consentimento concedido à equipe é gravado com `profissionalId IS NULL`, e
-- essa condição casa com qualquer um — inclusive com ninguém. Daí o
-- `public.usuario_atual() is not null` explícito em todas, e o `and (...)` em vez de `or`
-- solto, que também impede o resultado NULL.
--
-- Parâmetros com prefixo `p_` por necessidade, não por estilo: um parâmetro
-- chamado `escopo` é sombreado pela COLUNA `escopo` na consulta, e o Postgres
-- resolve para a coluna. A condição virava `c.escopo = c.escopo` — sempre
-- verdadeira, o que abriria o consentimento para qualquer escopo.

-- Quem é o usuário da requisição, na nossa tabela.
-- O id do Supabase Auth e o nosso são o mesmo texto por decisão de migração.
create or replace function public.usuario_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  /*
    Da claim `vivio_id`, e nao de `auth.uid()`.

    `auth.uid()` faz `::uuid` no `sub` do token, e os nossos ids sao cuid — a
    conversao lanca erro em vez de devolver falso, derrubando a consulta. O
    hook `token_com_id_vivio` poe o nosso id no token a cada login, e e ele que
    todas as politicas leem.

    Claim ausente devolve nulo, e nulo em condicao de politica e falso: sem
    token valido, nada e visivel.
  */
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'vivio_id',
      ''
    ), '')
$$;

-- Papel de quem está pedindo. Nulo quando não há sessão.
create or replace function public.papel_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.papel from public."User" u
  where u.id = public.usuario_atual() and u."deletadoEm" is null
$$;

/*
  Condição 2 — vínculo ATIVO.

  O próprio aluno sempre passa. ADMIN **não** passa: administrar a plataforma
  não dá direito a ler prontuário, e é exatamente esse o acesso que a LGPD
  trata como indevido. A regra vem do CareLinkGuard e é mantida ao pé da letra.
*/
create or replace function public.tem_vinculo(p_aluno_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_atual() is not null
    and (
      public.usuario_atual() = p_aluno_id
      or exists (
        select 1 from public."Vinculo" v
      where v."alunoId" = p_aluno_id
        and v."profissionalId" = public.usuario_atual()
          and v.status = 'ATIVO'
      )
    )
$$;

/*
  Condição 3 — consentimento vigente para o escopo.

  `profissionalId` nulo significa "vale para a equipe de cuidado inteira", e é
  o caso mais comum. Esquecer essa metade da condição já causou um defeito
  antes: um relatório filtrava só por `profissionalId` e mostrava aluno que
  autorizou tudo como se não tivesse autorizado nada.
*/
create or replace function public.tem_consentimento(p_aluno_id text, p_escopo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_atual() is not null
    and (
      public.usuario_atual() = p_aluno_id
      or exists (
        select 1 from public."Consentimento" c
      where c."alunoId" = p_aluno_id
        and c.escopo::text = p_escopo
        and c."revogadoEm" is null
          and (c."profissionalId" is null or c."profissionalId" = public.usuario_atual())
      )
    )
$$;

/*
  As três juntas — o que cada política de tabela de dado de aluno vai chamar.
*/
create or replace function public.pode_ler_do_aluno(p_aluno_id text, p_escopo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and public.tem_vinculo(p_aluno_id)
     and public.tem_consentimento(p_aluno_id, p_escopo)
$$;
