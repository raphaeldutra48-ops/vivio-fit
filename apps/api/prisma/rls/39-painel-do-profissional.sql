-- O que o painel do profissional pergunta, e o PostgREST não sabe responder.
--
-- Duas perguntas de agregação. Ambas existem como função pelo mesmo motivo: a
-- alternativa é trazer as linhas todas e agregar no celular — e com sessenta
-- alunos isso é um megabyte de execuções de treino para descobrir uma data por
-- pessoa.

/*
  A última vez que cada aluno da minha carteira treinou.

  Alimenta a lista de sumidos. Só entra quem autorizou TREINO — de quem não
  autorizou, o app **não sabe** se sumiu, e listar como sumido seria afirmar o
  que não se mediu. Esse aluno aparece na lista de autorizações pendentes, que é
  a informação verdadeira e a que leva a uma ação possível.

  `security definer` para atravessar a política de `ExecucaoTreino` com um
  `group by` só, mas o recorte não afrouxa nada: a mesma pergunta de sempre
  (`consentimento_de`) decide quem entra, e ela é a função que as políticas já
  usam. Sem sessão, devolve vazio.
*/
create or replace function public.ultimo_treino_da_carteira()
returns table ("alunoId" text, "ultimoEm" timestamp)
language sql
security definer
set search_path = public
stable
as $funcao$
  select v."alunoId", max(e."iniciadoEm")
    from public."Vinculo" v
    left join public."ExecucaoTreino" e on e."alunoId" = v."alunoId"
   where public.usuario_atual() is not null
     and v."profissionalId" = public.usuario_atual()
     and v.status = 'ATIVO'
     and public.consentimento_de(public.usuario_atual(), v."alunoId", 'TREINO')
   group by v."alunoId";
$funcao$;

/*
  Os escopos que cada aluno da carteira autorizou a mim.

  A tela precisa saber o que FALTA autorizar, e não só o que pode ler — é a
  diferença entre "o botão está desligado" e "o aluno ainda não autorizou o
  clínico". Sem isso, o profissional descobre o bloqueio ao abrir a ficha e a
  conclusão natural é "o app está quebrado".

  A regra de "vigente" mora numa função só (`consentimento_de`) porque já
  divergiu uma vez: um relatório filtrava apenas por `profissionalId` e ignorava
  o consentimento concedido à equipe inteira (`profissionalId` nulo), que é o
  caso mais comum. O efeito era o pior possível — aluno que autorizou tudo
  aparecia como se não tivesse autorizado nada.
*/
create or replace function public.escopos_da_carteira()
returns table ("alunoId" text, escopo text)
language sql
security definer
set search_path = public
stable
as $funcao$
  select distinct c."alunoId", c.escopo::text
    from public."Consentimento" c
    join public."Vinculo" v
      on v."alunoId" = c."alunoId"
     and v."profissionalId" = public.usuario_atual()
     and v.status = 'ATIVO'
   where public.usuario_atual() is not null
     and c."revogadoEm" is null
     and (c."profissionalId" is null or c."profissionalId" = public.usuario_atual());
$funcao$;

revoke execute on function public.ultimo_treino_da_carteira() from public, anon;
revoke execute on function public.escopos_da_carteira() from public, anon;
grant execute on function public.ultimo_treino_da_carteira() to authenticated;
grant execute on function public.escopos_da_carteira() to authenticated;

/*
  O relatório da carteira, uma linha por aluno.

  Cruza treino, evolução e nutrição — e cada um tem escopo de consentimento
  próprio. Um aluno pode autorizar treino e não autorizar evolução; nesse caso a
  coluna de peso vem **nula**, e não zero. Zero seria mentira, e mostrar o dado
  seria vazamento.

  Por isso a condição de escopo está em CADA agregado, e não uma só no `where`:
  a linha do aluno aparece de qualquer jeito — ele é da carteira, e a tela
  precisa dizer o que falta autorizar — com as colunas que ele não liberou em
  branco. `autorizou` viaja junto para a tela poder explicar o branco.

  O último check-in é procurado SEM recorte de período, diferente das execuções:
  aqui o que importa é há quanto tempo a pessoa sumiu, e limitar aos últimos 30
  dias transformaria "parou há 90 dias" em "nunca registrou" — o contrário do
  alerta que se quer dar.
*/
create or replace function public.relatorio_da_carteira(p_dias int)
returns table (
  "alunoId" text,
  nome text,
  "veTreino" boolean,
  "veEvolucao" boolean,
  "veNutricao" boolean,
  "treinosNoPeriodo" bigint,
  "ultimoTreinoEm" timestamp,
  "pesoInicialKg" numeric,
  "pesoAtualKg" numeric,
  "medidasNoPeriodo" bigint,
  "refeicoesNoPeriodo" bigint,
  "refeicoesFeitas" bigint,
  "ultimoCheckinEm" date
)
language sql
security definer
set search_path = public
stable
as $funcao$
  with eu as (select public.usuario_atual() as id),
  desde as (select (now() - make_interval(days => p_dias)) as inicio),
  carteira as (
    select
      v."alunoId",
      u.nome,
      public.consentimento_de((select id from eu), v."alunoId", 'TREINO') as ve_treino,
      public.consentimento_de((select id from eu), v."alunoId", 'EVOLUCAO') as ve_evolucao,
      public.consentimento_de((select id from eu), v."alunoId", 'NUTRICAO') as ve_nutricao
    from public."Vinculo" v
    join public."User" u on u.id = v."alunoId" and u."deletadoEm" is null
    where (select id from eu) is not null
      and v."profissionalId" = (select id from eu)
      and v.status = 'ATIVO'
  )
  select
    c."alunoId",
    c.nome,
    c.ve_treino,
    c.ve_evolucao,
    c.ve_nutricao,
    (select count(*) from public."ExecucaoTreino" e, desde d
      where c.ve_treino and e."alunoId" = c."alunoId" and e."iniciadoEm" >= d.inicio),
    (select max(e."iniciadoEm") from public."ExecucaoTreino" e
      where c.ve_treino and e."alunoId" = c."alunoId"),
    (select m."pesoKg" from public."Medida" m, desde d
      where c.ve_evolucao and m."alunoId" = c."alunoId" and m."deletadoEm" is null
        and m."pesoKg" is not null and m.data >= d.inicio::date
      order by m.data asc limit 1),
    (select m."pesoKg" from public."Medida" m, desde d
      where c.ve_evolucao and m."alunoId" = c."alunoId" and m."deletadoEm" is null
        and m."pesoKg" is not null and m.data >= d.inicio::date
      order by m.data desc limit 1),
    (select count(*) from public."Medida" m, desde d
      where c.ve_evolucao and m."alunoId" = c."alunoId" and m."deletadoEm" is null
        and m."pesoKg" is not null and m.data >= d.inicio::date),
    (select count(*) from public."RegistroRefeicao" r, desde d
      where c.ve_nutricao and r."alunoId" = c."alunoId" and r.data >= d.inicio::date),
    (select count(*) from public."RegistroRefeicao" r, desde d
      where c.ve_nutricao and r."alunoId" = c."alunoId" and r.data >= d.inicio::date
        and r.status = 'FEITA'),
    (select max(k.data) from public."CheckinDiario" k
      where c.ve_evolucao and k."alunoId" = c."alunoId")
  from carteira c
  order by c.nome;
$funcao$;

revoke execute on function public.relatorio_da_carteira(int) from public, anon;
grant execute on function public.relatorio_da_carteira(int) to authenticated;
