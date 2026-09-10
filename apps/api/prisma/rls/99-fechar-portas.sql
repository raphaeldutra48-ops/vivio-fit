-- Fecha as portas que ninguém abriu de propósito.
--
-- Este arquivo não descreve um grupo do produto. Ele apaga permissões que o
-- Supabase concede sozinho: todo projeto novo vem com
-- `grant all on all tables in schema public to anon, authenticated`, e esse
-- `all` vale também para as tabelas que a gente criou depois, uma a uma, sem
-- nunca ter escrito um `grant` para elas.
--
-- Enquanto não existe política, a permissão sobrando não faz nada: RLS ligado
-- e nenhuma regra significa que ninguém passa. O problema é o dia seguinte —
-- alguém acrescenta uma política de leitura numa tabela dessas e ganha de
-- brinde o INSERT, o UPDATE e o DELETE que estavam parados ali desde o início.
-- A regra escrita diria "só leitura"; o banco faria outra coisa.
--
-- É `99` e não `31` de propósito: a varredura do fim precisa rodar DEPOIS de
-- todo arquivo de grupo, inclusive os que ainda não existem. Numerado em
-- sequência, o próximo grupo a ser migrado viria depois dele e escaparia da
-- conferência — que é justamente quando ela seria mais útil.

-- --------------------------------------------------------------------------
-- _prisma_migrations
-- --------------------------------------------------------------------------
/*
  Esta era a porta aberta de verdade, e não uma que só abriria depois.

  A tabela foi criada pelo Prisma, não por nós, e por isso escapou de todos os
  arquivos anteriores: é a ÚNICA da schema sem RLS. Sem RLS, o `grant` do
  Supabase vale inteiro — e a chave anônima, que viaja no pacote do site e
  dentro do app, tinha `select`, `update`, `delete` e `truncate` aqui.

  Ler já é ruim: é o mapa do que o banco guarda, migração por migração, pelo
  nome. Apagar é pior. Nenhum dado de aluno se perde, mas o Prisma passa a
  achar que o banco está zerado, e o `migrate deploy` seguinte tenta recriar
  tudo por cima de uma base cheia. O estrago não aparece na hora: aparece no
  próximo deploy.
*/
alter table public."_prisma_migrations" enable row level security;
revoke all on public."_prisma_migrations" from anon, authenticated;

-- --------------------------------------------------------------------------
-- As tabelas de autenticação
-- --------------------------------------------------------------------------
/*
  Token de redefinição de senha, token de verificação de e-mail e sessão de
  refresh: são segredos de identidade, e nenhuma delas tem — nem deve ter —
  política. Quem lida com elas é a API, que entra como `postgres`.

  Hoje elas já falham fechadas. O `revoke` é para que continuem falhando
  fechadas por decisão, e não por ainda ninguém ter escrito a política que as
  abriria sem querer.

*/
revoke all on public."TokenRedefinicaoSenha" from anon, authenticated;
revoke all on public."TokenVerificacaoEmail" from anon, authenticated;
revoke all on public."SessaoRefresh" from anon, authenticated;

/*
  `LogAuditoria` é o caso invertido, e por pouco não virou um bug meu: registro
  de acesso que o próprio acessado pudesse apagar não é registro de acesso —
  mas ELE PRECISA SER LIDO. `logauditoria_le` existe desde o arquivo 05 para
  sustentar a tela de "quem viu meus dados", que é direito do aluno e não
  cortesia.

  Um `revoke all` aqui derrubaria a tela junto com a escrita: a política
  continuaria no lugar, dizendo que o aluno pode ler, e o banco devolveria
  vazio para sempre. Só as escritas saem; quem grava a auditoria é a API.
*/
revoke insert, update, delete on public."LogAuditoria" from anon, authenticated;

-- --------------------------------------------------------------------------
-- A varredura
-- --------------------------------------------------------------------------
/*
  O resto é a regra dita de uma vez, em vez de uma lista que envelhece: onde
  existe permissão de escrita e NÃO existe política para aquele comando, a
  permissão sai.

  Só remove o que já não decidia nada — se não há política, a escrita não
  passava mesmo. Por isso é seguro rodar de novo, e por isso roda por último:
  cada arquivo de grupo concede o que precisa junto com a regra que governa o
  que concedeu, e nada disso é tocado aqui.

  O efeito prático é inverter o padrão. Uma tabela nova passa a nascer fechada,
  e abrir vira um ato explícito de quem escreve a política — em vez de uma
  herança silenciosa do dia em que o projeto foi criado.
*/
do $varredura$
declare
  r record;
begin
  for r in
    select g.table_name as tabela, g.privilege_type as privilegio
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated')
      and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and not exists (
        select 1
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = g.table_name
          and p.polcmd in ('*', case g.privilege_type
                                  when 'INSERT' then 'a'
                                  when 'UPDATE' then 'w'
                                  else 'd'
                                end)
      )
  loop
    execute format('revoke %s on public.%I from anon, authenticated', r.privilegio, r.tabela);
  end loop;
end;
$varredura$;

/*
  `TRUNCATE`, `REFERENCES` e `TRIGGER` saem de todas, sem exceção e sem
  depender de política — RLS não olha para nenhum dos três.

  `truncate` esvazia a tabela inteira passando por cima de toda regra de linha,
  que é justamente o que as políticas existem para impedir. `references` deixa
  apontar uma chave estrangeira para lá: quem aponta descobre, pelo erro de
  violação, se uma linha existe — e passa a poder travar a exclusão dela. E
  `trigger` deixa pendurar código próprio na tabela, que roda com as políticas
  do dono; é o caminho mais curto para transformar uma escrita permitida em
  qualquer outra coisa.

  Nenhuma das três chegou a ser usada por aqui: são herança do `grant all` de
  nascença, e ficam de fora por não haver motivo para estarem dentro.
*/
do $enxuga$
declare
  r record;
begin
  for r in
    select distinct table_name as tabela
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.tabela);
  end loop;
end;
$enxuga$;

-- --------------------------------------------------------------------------
-- A política que nenhum arquivo criou
-- --------------------------------------------------------------------------
/*
  `notificacao_escreve` estava no banco e em nenhum arquivo — sobra de uma
  tentativa feita à mão, antes de este diretório existir. E o que ela dizia era
  `with check (true)`: qualquer um insere qualquer notificação para qualquer
  pessoa.

  Não fazia efeito, porque `Notificacao` nunca teve `grant insert` — é a regra
  do grupo, e o teste de lembretes a defende: quem cria aviso é quem dispara.
  Mas as duas metades protegiam por motivos DIFERENTES, e só uma estava escrita
  onde alguém fosse ler. Bastaria um `grant insert` bem-intencionado, um dia,
  para que a caixa de avisos de qualquer pessoa aceitasse texto de qualquer
  outra.

  Comparar o banco com os arquivos foi o que a achou. Vale como hábito: uma
  política que ninguém declarou é uma decisão que ninguém revisa.
*/
drop policy if exists notificacao_escreve on public."Notificacao";
