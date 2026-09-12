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

    O `nullif` de DENTRO existe por um defeito que so aparece na segunda
    consulta da mesma conexao: `current_setting(x, true)` devolve nulo enquanto
    a variavel nunca foi definida, mas depois que UMA transacao fez `set local`
    nela, ela passa a existir na sessao e volta para STRING VAZIA quando a
    transacao termina. E `''::jsonb` nao devolve nulo — lanca erro. Com o
    coalesce so depois do cast, qualquer conexao de manutencao que encostasse
    numa tabela com politica caia com "invalid input syntax for type json".
  */
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'vivio_id',
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

  Em duas camadas por necessidade nova: o compartilhamento entre profissionais
  precisa perguntar "o DETENTOR ainda tem vínculo?", e não só "eu tenho?". A
  pergunta genérica mora em `vinculo_de`; `tem_vinculo` é ela aplicada a quem
  está pedindo agora.

  O próprio aluno sempre passa. ADMIN **não** passa: administrar a plataforma
  não dá direito a ler prontuário, e é exatamente esse o acesso que a LGPD
  trata como indevido. A regra vem do CareLinkGuard e é mantida ao pé da letra.
*/
create or replace function public.vinculo_de(p_profissional_id text, p_aluno_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profissional_id is not null
    and (
      p_profissional_id = p_aluno_id
      or exists (
        select 1 from public."Vinculo" v
        where v."alunoId" = p_aluno_id
          and v."profissionalId" = p_profissional_id
          and v.status = 'ATIVO'
      )
    )
$$;

create or replace function public.tem_vinculo(p_aluno_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and public.vinculo_de(public.usuario_atual(), p_aluno_id)
$$;

/*
  Condição 3 — consentimento vigente para o escopo.

  `profissionalId` nulo significa "vale para a equipe de cuidado inteira", e é
  o caso mais comum. Esquecer essa metade da condição já causou um defeito
  antes: um relatório filtrava só por `profissionalId` e mostrava aluno que
  autorizou tudo como se não tivesse autorizado nada.

  A guarda `p_profissional_id is not null` na versão genérica é a MESMA que
  custou um teste na versão de sessão: `profissionalId is null` casa com
  qualquer um, inclusive com ninguém. Passar nulo aqui devolveria TRUE.
*/
create or replace function public.consentimento_de(
  p_profissional_id text,
  p_aluno_id text,
  p_escopo text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profissional_id is not null
    and (
      p_profissional_id = p_aluno_id
      or exists (
        select 1 from public."Consentimento" c
        where c."alunoId" = p_aluno_id
          and c.escopo::text = p_escopo
          and c."revogadoEm" is null
          and (c."profissionalId" is null or c."profissionalId" = p_profissional_id)
      )
    )
$$;

create or replace function public.tem_consentimento(p_aluno_id text, p_escopo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and public.consentimento_de(public.usuario_atual(), p_aluno_id, p_escopo)
$$;

/*
  Condição 3 por outro caminho — autorização de um colega.

  O aluno pode ter consentido a UM profissional e não à equipe. Quando a
  nutricionista precisa do exame que só o médico enxerga, ela pede, e ele
  autoriza. A tabela `SolicitacaoDeAcesso` guarda esse acordo.

  ## A permissão é derivada, e é isso que a mantém honesta

  Quem autoriza não é o dono do dado — o dono é o aluno. Então a autorização
  não pode valer mais do que o acesso de quem a concedeu: cada leitura confere
  se o DETENTOR ainda tem vínculo e consentimento agora. Se a Ana revogar o
  consentimento do médico hoje, tudo que ele compartilhou fecha no mesmo
  instante, sem rotina de limpeza e sem ninguém precisar lembrar.

  Guardar um `permitido = true` na linha seria mais rápido e estaria errado
  algumas horas por mês — que são exatamente as horas que importam.
*/
create or replace function public.tem_acesso_compartilhado(p_aluno_id text, p_escopo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_atual() is not null
    and exists (
      select 1 from public."SolicitacaoDeAcesso" s
      where s."alunoId" = p_aluno_id
        and s."solicitanteId" = public.usuario_atual()
        and s.escopo::text = p_escopo
        and s.status = 'APROVADA'
        and s."revogadoEm" is null
        and (s."expiraEm" is null or s."expiraEm" > now())
        and public.vinculo_de(s."detentorId", p_aluno_id)
        and public.consentimento_de(s."detentorId", p_aluno_id, p_escopo)
    )
$$;

/*
  As três juntas — o que cada política de tabela de dado de aluno vai chamar.

  O compartilhamento entra em OU com o consentimento e em E com o vínculo, e a
  posição é a regra inteira: um colega pode suprir a autorização do aluno para
  um escopo, e ninguém pode suprir o fato de você atender aquela pessoa.
*/
/*
  Sou admin?

  Um ajudante de uma linha, e vale a pena ter: `papel_atual() = 'ADMIN'` escrito
  em cada lugar que precisa dele é a duplicação que um dia perde uma cópia — e
  as cópias aqui guardam o cadastro inteiro de profissionais e o acervo global.
*/
create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel_atual() = 'ADMIN';
$$;

create or replace function public.pode_ler_do_aluno(p_aluno_id text, p_escopo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and public.tem_vinculo(p_aluno_id)
     and (
       public.tem_consentimento(p_aluno_id, p_escopo)
       or public.tem_acesso_compartilhado(p_aluno_id, p_escopo)
     )
$$;
