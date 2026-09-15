-- Plano alimentar: mesma forma do plano de treino, e pelo mesmo motivo.
--
-- Dieta, refeições e itens nascem juntos, e o que rege o conjunto são
-- invariantes entre linhas: um aluno tem no máximo UMA dieta ativa, e ajustar
-- cria uma versão nova em vez de sobrescrever. Um cardápio com metade das
-- refeições gravadas é pior que nenhum — o aluno abre o almoço e não encontra
-- o jantar, sem nada avisando que faltou.
--
-- A diferença para o treino é quem prescreve: aqui é o NUTRICIONISTA, e o
-- escopo é NUTRICAO. O aluno continua escrevendo o que comeu — `RegistroRefeicao`
-- não passa por aqui.

drop policy if exists planodieta_escreve on public."PlanoDieta";
drop policy if exists planodieta_altera on public."PlanoDieta";
revoke insert, update, delete on public."PlanoDieta" from authenticated, anon;
revoke insert, update, delete on public."Refeicao" from authenticated, anon;
revoke insert, update, delete on public."ItemRefeicao" from authenticated, anon;
grant select on public."PlanoDieta" to authenticated;
grant select on public."Refeicao" to authenticated;
grant select on public."ItemRefeicao" to authenticated;

/*
  Alimento inexistente no cardápio vira item sem nome na tela do aluno.

  A checagem é aqui e não numa `foreign key` porque a mensagem importa: dizer
  QUAL alimento não existe é a diferença entre o nutricionista corrigir a linha
  e ele refazer o cardápio inteiro.
*/
create or replace function public.exigir_alimentos_existentes(p_plano jsonb)
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
    select it->>'alimentoId' as id
    from jsonb_array_elements(p_plano->'refeicoes') r,
         jsonb_array_elements(r->'itens') it
  ) x
  where not exists (select 1 from public."Alimento" a where a.id = x.id);

  if v_faltando is not null then
    raise exception 'Alimento (%) não encontrado.', array_to_string(v_faltando, ', ')
      using errcode = 'P0002';
  end if;
end;
$funcao$;

/** Um aluno, uma dieta valendo. Ativar arquiva a anterior e carimba o fim. */
create or replace function public.assumir_o_lugar_da_dieta(p_plano_id text, p_aluno_id text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  update public."PlanoDieta"
     set status = 'ARQUIVADO', "fimEm" = now(), "atualizadoEm" = now()
   where "alunoId" = p_aluno_id and status = 'ATIVO' and id <> p_plano_id;

  update public."PlanoDieta"
     set status = 'ATIVO', "inicioEm" = now(), "atualizadoEm" = now()
   where id = p_plano_id;
end;
$funcao$;

create or replace function public.criar_plano_dieta(
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
  v_refeicao_id text;
  r record;
  it record;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  if not public.pode_escrever_do_aluno(p_aluno_id, 'NUTRICAO', array['NUTRICIONISTA']) then
    raise exception 'Seu perfil não tem permissão para esta ação.' using errcode = '42501';
  end if;

  if coalesce(jsonb_array_length(p_plano->'refeicoes'), 0) = 0 then
    raise exception 'O plano precisa de pelo menos uma refeição.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_plano->'refeicoes') r2
    where coalesce(jsonb_array_length(r2->'itens'), 0) = 0
  ) then
    raise exception 'Cada refeição precisa de pelo menos um alimento.' using errcode = '23514';
  end if;

  perform public.exigir_alimentos_existentes(p_plano);

  if p_versao_de is not null then
    select * into v_anterior from public."PlanoDieta" where id = p_versao_de;
    if v_anterior.id is null or v_anterior."alunoId" <> p_aluno_id then
      raise exception 'Plano alimentar não encontrado.' using errcode = 'P0002';
    end if;
    v_versao := v_anterior.versao + 1;
    v_raiz := coalesce(v_anterior."raizId", v_anterior.id);
    v_era_ativo := v_anterior.status = 'ATIVO';
  end if;

  insert into public."PlanoDieta" (
    id, "alunoId", "nutricionistaId", nome, observacao, "kcalAlvo", "proteinaAlvoG",
    "carboAlvoG", "gorduraAlvoG", versao, "raizId", status, "criadoEm", "atualizadoEm"
  ) values (
    v_id, p_aluno_id, eu,
    btrim(p_plano->>'nome'), nullif(p_plano->>'observacao', ''),
    (p_plano->>'kcalAlvo')::int, (p_plano->>'proteinaAlvoG')::int,
    (p_plano->>'carboAlvoG')::int, (p_plano->>'gorduraAlvoG')::int,
    v_versao, v_raiz, 'RASCUNHO', now(), now()
  );

  for r in
    select valor, ordem - 1 as ordem
    from jsonb_array_elements(p_plano->'refeicoes') with ordinality as t(valor, ordem)
  loop
    v_refeicao_id := gen_random_uuid()::text;
    insert into public."Refeicao" (id, "planoDietaId", nome, "horarioSugerido", ordem)
    values (
      v_refeicao_id, v_id, r.valor->>'nome',
      nullif(r.valor->>'horarioSugerido', ''), r.ordem
    );

    for it in
      select valor, ordem - 1 as ordem
      from jsonb_array_elements(r.valor->'itens') with ordinality as t(valor, ordem)
    loop
      insert into public."ItemRefeicao" (
        id, "refeicaoId", "alimentoId", "quantidadeG", observacao, ordem
      ) values (
        gen_random_uuid()::text, v_refeicao_id, it.valor->>'alimentoId',
        (it.valor->>'quantidadeG')::numeric, nullif(it.valor->>'observacao', ''), it.ordem
      );
    end loop;
  end loop;

  if v_era_ativo or coalesce((p_plano->>'ativar')::boolean, false) then
    perform public.assumir_o_lugar_da_dieta(v_id, p_aluno_id);
  end if;

  return v_id;
end;
$funcao$;

create or replace function public.ativar_plano_dieta(p_plano_id text)
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

  select * into p from public."PlanoDieta" where id = p_plano_id;
  if p.id is null then
    raise exception 'Plano alimentar não encontrado.' using errcode = 'P0002';
  end if;
  if not public.pode_escrever_do_aluno(p."alunoId", 'NUTRICAO', array['NUTRICIONISTA']) then
    raise exception 'Plano alimentar não encontrado.' using errcode = 'P0002';
  end if;
  if p.status = 'ATIVO' then
    raise exception 'Este plano já está ativo.' using errcode = '23505';
  end if;

  perform public.assumir_o_lugar_da_dieta(p_plano_id, p."alunoId");
end;
$funcao$;

grant execute on function public.criar_plano_dieta(text, jsonb, text) to authenticated;
grant execute on function public.ativar_plano_dieta(text) to authenticated;
revoke execute on function public.criar_plano_dieta(text, jsonb, text) from anon;
revoke execute on function public.ativar_plano_dieta(text) from anon;
revoke execute on function public.assumir_o_lugar_da_dieta(text, text) from authenticated, anon, public;
revoke execute on function public.exigir_alimentos_existentes(jsonb) from authenticated, anon, public;

/*
  O que o aluno comeu é dele.

  `RegistroRefeicao` fica de fora das funções acima: marcar a refeição como
  feita é o gesto do aluno, e a política de INSERT já dizia isso. Faltava a de
  UPDATE — marcar a mesma refeição no mesmo dia CORRIGE, e sem a política a
  correção afetava zero linhas respondendo 200: a tela dizia "salvo" e o
  registro continuava dizendo que ele pulou o almoço.
*/
drop policy if exists registrorefeicao_altera on public."RegistroRefeicao";
create policy registrorefeicao_altera on public."RegistroRefeicao" for update
  using (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]))
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]));

grant select, insert, update on public."RegistroRefeicao" to authenticated;
