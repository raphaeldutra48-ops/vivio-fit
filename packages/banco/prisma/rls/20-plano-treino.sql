-- Plano de treino: montar, versionar e ativar.
--
-- ## Por que função, e não política de escrita
--
-- Pelo mesmo motivo de `Vinculo`: o que rege o plano não são permissões de
-- linha, são invariantes entre linhas.
--
--   * um aluno tem no máximo UM plano ATIVO — ativar um arquiva o outro;
--   * ajustar plano cria uma VERSÃO NOVA, nunca sobrescreve: daqui a três
--     meses, ao ver que o aluno fez supino com 60 kg, é preciso saber o que o
--     plano prescrevia NAQUELE dia;
--   * plano, sessões e itens nascem juntos — um plano com metade das sessões
--     gravadas é um treino que manda a pessoa parar no meio;
--   * nenhum item pode apontar para a biblioteca privada de OUTRO
--     profissional: sem essa checagem, bastaria adivinhar um id.
--
-- Nada disso cabe num `with check`, que só enxerga a linha nova e uma de cada
-- vez. Então as políticas de escrita saem, o `grant` sai junto, e sobram duas
-- funções: ou passa por elas, ou não acontece.
--
-- ## Por que `security definer` aqui não afrouxa nada
--
-- A primeira coisa que as duas fazem é perguntar `pode_escrever_do_aluno(...,
-- 'TREINO', array['PERSONAL'])` — as mesmas três condições de sempre, mais o
-- papel, exatamente como o `@Papeis(Papel.PERSONAL)` do controlador dizia. O
-- `definer` existe porque a função escreve em três tabelas cujas políticas de
-- escrita deixaram de existir, não para pular checagem.
--
-- As mensagens são as que a API devolvia, palavra por palavra: as telas já as
-- mostram.

-- --------------------------------------------------------------------------
-- Escrever plano é só pelas funções.
-- --------------------------------------------------------------------------
drop policy if exists planotreino_escreve on public."PlanoTreino";
drop policy if exists planotreino_altera on public."PlanoTreino";
revoke insert, update, delete on public."PlanoTreino" from authenticated, anon;
revoke insert, update, delete on public."SessaoTreino" from authenticated, anon;
revoke insert, update, delete on public."ItemTreino" from authenticated, anon;
grant select on public."PlanoTreino" to authenticated;
grant select on public."SessaoTreino" to authenticated;
grant select on public."ItemTreino" to authenticated;

/*
  Os exercícios que este profissional pode prescrever.

  Biblioteca GLOBAL mais a dele. Fora numa função separada porque vale nas duas
  entradas — criar e versionar — e uma checagem repetida em dois lugares é uma
  checagem que um dia diverge.
*/
create or replace function public.exigir_exercicios_acessiveis(p_plano jsonb, p_dono text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $funcao$
declare
  v_faltando text[];
begin
  select array_agg(distinct x.id) into v_faltando
  from (
    select it->>'exercicioId' as id
    from jsonb_array_elements(p_plano->'sessoes') s,
         jsonb_array_elements(s->'itens') it
  ) x
  where not exists (
    select 1 from public."Exercicio" e
    where e.id = x.id
      and e."deletadoEm" is null
      and (e.escopo = 'GLOBAL' or e."criadoPorId" = p_dono)
  );

  if v_faltando is not null then
    raise exception 'Exercício (%) não encontrado.', array_to_string(v_faltando, ', ')
      using errcode = 'P0002';
  end if;
end;
$funcao$;

/*
  Um aluno, um plano ativo.

  Arquiva os outros e carimba `fimEm` neles — é esse carimbo que faz a lista de
  planos ser lida como histórico, e não como um monte de rascunhos soltos.
*/
create or replace function public.assumir_o_lugar(p_plano_id text, p_aluno_id text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  update public."PlanoTreino"
     set status = 'ARQUIVADO', "fimEm" = now(), "atualizadoEm" = now()
   where "alunoId" = p_aluno_id and status = 'ATIVO' and id <> p_plano_id;

  update public."PlanoTreino"
     set status = 'ATIVO', "inicioEm" = now(), "atualizadoEm" = now()
   where id = p_plano_id;
end;
$funcao$;

/*
  Monta o plano inteiro numa chamada.

  `p_versao_de` nulo cria um plano novo; preenchido, cria a versão seguinte
  daquele — e se a anterior estava em uso, a nova assume o lugar dela sem que
  ninguém precise pedir. É o caso comum do ajuste de treino: o personal mexe na
  prescrição na segunda-feira e o aluno abre o app já com o ajuste.

  Uma chamada e não seis porque o PostgREST não abre transação entre
  requisições, e aqui, ao contrário do exame, o meio do caminho é inaceitável:
  um plano com duas de quatro sessões gravadas manda a pessoa embora da
  academia na metade.
*/
create or replace function public.criar_plano_treino(
  p_aluno_id text,
  p_plano jsonb,
  p_versao_de text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  v_anterior record;
  v_id text := gen_random_uuid()::text;
  v_versao int := 1;
  v_raiz text := null;
  v_era_ativo boolean := false;
  v_sessao_id text;
  s record;
  it record;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  if not public.pode_escrever_do_aluno(p_aluno_id, 'TREINO', array['PERSONAL']) then
    raise exception 'Seu perfil não tem permissão para esta ação.' using errcode = '42501';
  end if;

  /*
    Plano sem sessão, ou sessão sem item, não é rascunho: é uma tela que abre
    vazia e não diz por quê. O contrato em `criarPlanoTreinoSchema` já barra do
    lado de fora; aqui é a mesma regra onde o cliente não alcança.
  */
  if coalesce(jsonb_array_length(p_plano->'sessoes'), 0) = 0 then
    raise exception 'O plano precisa de pelo menos uma sessão.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_plano->'sessoes') s2
    where coalesce(jsonb_array_length(s2->'itens'), 0) = 0
  ) then
    raise exception 'Cada sessão precisa de pelo menos um exercício.' using errcode = '23514';
  end if;

  perform public.exigir_exercicios_acessiveis(p_plano, eu);

  if p_versao_de is not null then
    select * into v_anterior from public."PlanoTreino" where id = p_versao_de;
    if v_anterior.id is null or v_anterior."alunoId" <> p_aluno_id then
      raise exception 'Plano de treino não encontrado.' using errcode = 'P0002';
    end if;
    v_versao := v_anterior.versao + 1;
    /*
      A raiz agrupa todas as versões. Na versão 1 ela é nula — o plano é a
      própria raiz —, então é o id dele que passa adiante.
    */
    v_raiz := coalesce(v_anterior."raizId", v_anterior.id);
    v_era_ativo := v_anterior.status = 'ATIVO';
  end if;

  insert into public."PlanoTreino" (
    id, "alunoId", "personalId", nome, objetivo, versao, "raizId", status,
    "criadoEm", "atualizadoEm"
  ) values (
    v_id, p_aluno_id, eu,
    btrim(p_plano->>'nome'), nullif(p_plano->>'objetivo', ''),
    v_versao, v_raiz, 'RASCUNHO', now(), now()
  );

  for s in
    select valor, ordem - 1 as ordem
    from jsonb_array_elements(p_plano->'sessoes') with ordinality as t(valor, ordem)
  loop
    v_sessao_id := gen_random_uuid()::text;
    insert into public."SessaoTreino" (id, "planoId", nome, ordem, "diaSugerido")
    values (
      v_sessao_id, v_id, s.valor->>'nome', s.ordem,
      (s.valor->>'diaSugerido')::int
    );

    for it in
      select valor, ordem - 1 as ordem
      from jsonb_array_elements(s.valor->'itens') with ordinality as t(valor, ordem)
    loop
      insert into public."ItemTreino" (
        id, "sessaoId", "exercicioId", ordem, series, "repsAlvo",
        "cargaSugeridaKg", "descansoSeg", tecnica, observacao, "supersetGrupo"
      ) values (
        gen_random_uuid()::text, v_sessao_id, it.valor->>'exercicioId', it.ordem,
        (it.valor->>'series')::int, it.valor->>'repsAlvo',
        (it.valor->>'cargaSugeridaKg')::numeric, (it.valor->>'descansoSeg')::int,
        it.valor->>'tecnica', it.valor->>'observacao', it.valor->>'supersetGrupo'
      );
    end loop;
  end loop;

  if v_era_ativo or coalesce((p_plano->>'ativar')::boolean, false) then
    perform public.assumir_o_lugar(v_id, p_aluno_id);
  end if;

  return v_id;
end;
$funcao$;

/*
  Ativar um plano já montado.

  Separado de criar porque é o gesto de quem revisou o rascunho e decidiu que
  ele vale a partir de hoje — o único momento em que o aluno passa a ver treino
  diferente do que via ontem.
*/
create or replace function public.ativar_plano_treino(p_plano_id text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  p record;
begin
  if public.usuario_atual() is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  select * into p from public."PlanoTreino" where id = p_plano_id;
  if p.id is null then
    raise exception 'Plano de treino não encontrado.' using errcode = 'P0002';
  end if;
  if not public.pode_escrever_do_aluno(p."alunoId", 'TREINO', array['PERSONAL']) then
    /*
      Mesma resposta para "não é seu aluno" e "não existe": distinguir contaria
      a quem não cuida da pessoa que ela treina em algum lugar.
    */
    raise exception 'Plano de treino não encontrado.' using errcode = 'P0002';
  end if;
  if p.status = 'ATIVO' then
    raise exception 'Este plano já está ativo.' using errcode = '23505';
  end if;

  perform public.assumir_o_lugar(p_plano_id, p."alunoId");
end;
$funcao$;

grant execute on function public.criar_plano_treino(text, jsonb, text) to authenticated;
grant execute on function public.ativar_plano_treino(text) to authenticated;
revoke execute on function public.criar_plano_treino(text, jsonb, text) from anon;
revoke execute on function public.ativar_plano_treino(text) from anon;

/*
  Estas duas são o miolo, e não a porta: soltas, deixariam qualquer um arquivar
  o plano alheio ou perguntar pela biblioteca privada de terceiros. Quem as
  chama são as funções acima, já depois da checagem — e chamada de dentro de
  outra `definer` não precisa de `execute` para o chamador.
*/
revoke execute on function public.assumir_o_lugar(text, text) from authenticated, anon, public;
revoke execute on function public.exigir_exercicios_acessiveis(jsonb, text) from authenticated, anon, public;
