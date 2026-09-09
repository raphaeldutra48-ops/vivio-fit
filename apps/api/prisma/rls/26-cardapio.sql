-- Modelo de cardápio: o molde reutilizável do nutricionista.
--
-- Não é dado de aluno: o molde é do profissional, e nenhum paciente aparece
-- nele. Por isso a política de leitura e a de escrita são a mesma pergunta —
-- "é seu?" — e já estavam escritas.
--
-- O que faltava era o INSERT das filhas. `RefeicaoModelo` e `ItemModelo` só
-- tinham política de SELECT, então montar um molde pelo PostgREST parava na
-- primeira refeição. Como no plano de treino e no plano alimentar, molde e
-- refeições nascem juntos — e um molde com metade das refeições é aplicado em
-- vários pacientes antes de alguém notar o que sumiu.

/*
  Nenhuma política de escrita nas filhas, de propósito: quem monta molde é a
  função. Os `drop` existem para que uma política criada à mão — ou por uma
  prova de mutação esquecida — não sobreviva à próxima aplicação.
*/
drop policy if exists refeicaomodelo_escreve on public."RefeicaoModelo";
drop policy if exists itemmodelo_escreve on public."ItemModelo";
drop policy if exists modelocardapio_apaga on public."ModeloCardapio";
revoke insert, update, delete on public."RefeicaoModelo" from authenticated, anon;
revoke insert, update, delete on public."ItemModelo" from authenticated, anon;
grant select on public."RefeicaoModelo" to authenticated;
grant select on public."ItemModelo" to authenticated;
grant select, insert, update on public."ModeloCardapio" to authenticated;
/*
  Molde não se apaga: ele pode ter sido aplicado em dietas que estão valendo, e
  a lista de "de onde veio esta dieta" ficaria sem resposta. Remover é carimbar
  `deletadoEm`.
*/
revoke delete on public."ModeloCardapio" from authenticated, anon;

create or replace function public.governar_modelo_cardapio()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  -- `@updatedAt` é do Prisma e some quando quem escreve é o PostgREST.
  new."atualizadoEm" := now();

  if tg_op = 'INSERT' then
    if public.usuario_atual() is not null then
      new."nutricionistaId" := public.usuario_atual();
    end if;
    return new;
  end if;

  new."nutricionistaId" := old."nutricionistaId";
  new."criadoEm" := old."criadoEm";
  -- Molde removido não volta.
  if old."deletadoEm" is not null then
    new."deletadoEm" := old."deletadoEm";
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_modelo_cardapio on public."ModeloCardapio";
create trigger governar_modelo_cardapio
  before insert or update on public."ModeloCardapio"
  for each row execute function public.governar_modelo_cardapio();

create or replace function public.criar_modelo_cardapio(p_modelo jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  v_id text := gen_random_uuid()::text;
  v_refeicao_id text;
  r record;
  it record;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  if public.papel_atual() <> 'NUTRICIONISTA' then
    raise exception 'Seu perfil não tem permissão para esta ação.' using errcode = '42501';
  end if;

  if coalesce(jsonb_array_length(p_modelo->'refeicoes'), 0) = 0 then
    raise exception 'O molde precisa de pelo menos uma refeição.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_modelo->'refeicoes') r2
    where coalesce(jsonb_array_length(r2->'itens'), 0) = 0
  ) then
    raise exception 'Cada refeição precisa de pelo menos um alimento.' using errcode = '23514';
  end if;

  -- Mesma checagem da dieta, e pelo mesmo motivo: dizer QUAL alimento falta.
  perform public.exigir_alimentos_existentes(p_modelo);

  insert into public."ModeloCardapio" (
    id, "nutricionistaId", nome, descricao, "kcalAlvo", "proteinaAlvoG",
    "carboAlvoG", "gorduraAlvoG", "criadoEm", "atualizadoEm"
  ) values (
    v_id, eu, btrim(p_modelo->>'nome'), nullif(p_modelo->>'descricao', ''),
    (p_modelo->>'kcalAlvo')::int, (p_modelo->>'proteinaAlvoG')::int,
    (p_modelo->>'carboAlvoG')::int, (p_modelo->>'gorduraAlvoG')::int,
    now(), now()
  );

  for r in
    select valor, ordem - 1 as ordem
    from jsonb_array_elements(p_modelo->'refeicoes') with ordinality as t(valor, ordem)
  loop
    v_refeicao_id := gen_random_uuid()::text;
    insert into public."RefeicaoModelo" (id, "modeloId", nome, "horarioSugerido", ordem)
    values (
      v_refeicao_id, v_id, r.valor->>'nome',
      nullif(r.valor->>'horarioSugerido', ''), r.ordem
    );

    for it in
      select valor, ordem - 1 as ordem
      from jsonb_array_elements(r.valor->'itens') with ordinality as t(valor, ordem)
    loop
      insert into public."ItemModelo" (
        id, "refeicaoId", "alimentoId", "quantidadeG", observacao, ordem
      ) values (
        gen_random_uuid()::text, v_refeicao_id, it.valor->>'alimentoId',
        (it.valor->>'quantidadeG')::numeric, nullif(it.valor->>'observacao', ''), it.ordem
      );
    end loop;
  end loop;

  return v_id;
end;
$funcao$;

grant execute on function public.criar_modelo_cardapio(jsonb) to authenticated;
revoke execute on function public.criar_modelo_cardapio(jsonb) from anon;
