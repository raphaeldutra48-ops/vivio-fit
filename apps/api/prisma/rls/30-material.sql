-- Material: a biblioteca do profissional, e o que ele entrega a cada aluno.
--
-- O material é conteúdo DELE — um PDF de orientação, um vídeo, um link. Não é
-- dado de aluno, e por isso não passa por consentimento. O que passa por
-- vínculo é a ENTREGA: mandar arquivo para quem não é seu aluno é abuso da
-- lista, e é a única regra dura deste grupo.
--
-- Continua na API o `abrir`: o link do arquivo é assinado, e assinar depende
-- do armazenamento, que ainda vive fora do Supabase. É a mesma pendência do
-- laudo de exame e da foto de evolução.

/*
  Duas funções antes das políticas, e a razão é uma recursão que só apareceu
  quando alguém finalmente leu estas tabelas pelo PostgREST.

  `material_le` pergunta a `MaterialCompartilhado` "isto foi compartilhado
  comigo?", e `materialcompartilhado_le` pergunta a `Material` "sou o autor?".
  Uma política chama a outra, que chama a primeira: o Postgres devolve
  "infinite recursion detected in policy". É o mesmo nó que `tem_vinculo`
  desata em `Vinculo` e `participo_da_conversa` em `Conversa` — `security
  definer` lê a tabela sem passar pela política, e o círculo se abre.
*/
create or replace function public.material_e_meu(p_material_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select exists (
    select 1 from public."Material" m
    where m.id = p_material_id and m."autorId" = public.usuario_atual()
  )
$funcao$;

create or replace function public.recebi_o_material(p_material_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select exists (
    select 1 from public."MaterialCompartilhado" mc
    where mc."materialId" = p_material_id and mc."alunoId" = public.usuario_atual()
  )
$funcao$;

drop policy if exists material_le on public."Material";
create policy material_le on public."Material" for select using (
  "autorId" = public.usuario_atual() or public.recebi_o_material(id)
);

drop policy if exists materialcompartilhado_le on public."MaterialCompartilhado";
create policy materialcompartilhado_le on public."MaterialCompartilhado" for select using (
  "alunoId" = public.usuario_atual() or public.material_e_meu("materialId")
);

revoke execute on function public.material_e_meu(text) from anon;
revoke execute on function public.recebi_o_material(text) from anon;
grant execute on function public.material_e_meu(text) to authenticated;
grant execute on function public.recebi_o_material(text) to authenticated;

/*
  INSERT, UPDATE e DELETE separados, e não um `for all`.

  `for all` também concede SELECT, e aqui isso apagaria metade da regra de
  leitura: `material_le` é o que deixa o ALUNO ver o que recebeu. Com o `for
  all` do autor por cima, a política do aluno continuaria valendo (elas se
  somam), mas quem lesse o arquivo não saberia dizer qual das duas decide o quê.
*/
drop policy if exists material_escreve on public."Material";
create policy material_escreve on public."Material" for insert
  with check ("autorId" = public.usuario_atual());

drop policy if exists material_altera on public."Material";
create policy material_altera on public."Material" for update
  using ("autorId" = public.usuario_atual())
  with check ("autorId" = public.usuario_atual());

create or replace function public.governar_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."atualizadoEm" := now();
  /*
    Etiqueta é para achar depois: minúscula e sem espaço nas pontas, senão
    "Ombro " e "ombro" viram duas gavetas para a mesma coisa.

    A ORDEM em que o profissional escreveu é preservada. A primeira versão
    usava `array_agg(distinct ...)`, que ordena alfabeticamente de brinde — e
    a suíte da API pegou: a lista voltava reordenada, e a tela mostrava as
    etiquetas em ordem que ninguém escolheu.
  */
  new.etiquetas := (
    select coalesce(array_agg(x.e order by x.ord), '{}')
    from (
      select distinct on (lower(btrim(t.e))) lower(btrim(t.e)) as e, t.ord
      from unnest(coalesce(new.etiquetas, '{}')) with ordinality as t(e, ord)
      where btrim(t.e) <> ''
      order by lower(btrim(t.e)), t.ord
    ) x
  );

  if tg_op = 'INSERT' then
    if public.usuario_atual() is not null then
      new."autorId" := public.usuario_atual();
    end if;
    return new;
  end if;

  new."autorId" := old."autorId";
  new."criadoEm" := old."criadoEm";
  -- Material removido não volta.
  if old."deletadoEm" is not null then
    new."deletadoEm" := old."deletadoEm";
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_material on public."Material";
create trigger governar_material
  before insert or update on public."Material"
  for each row execute function public.governar_material();

grant select, insert, update on public."Material" to authenticated;
/*
  Remover é carimbo. O arquivo em si sai do armazenamento pela API, e enquanto
  o armazenamento não migrar apagar a linha deixaria o objeto órfão lá dentro —
  material "excluído" que continua baixável por um link antigo é só aparência
  de exclusão.
*/
revoke delete on public."Material" from authenticated, anon;

-- --------------------------------------------------------------------------
-- A entrega
-- --------------------------------------------------------------------------
drop policy if exists materialcompartilhado_escreve on public."MaterialCompartilhado";
create policy materialcompartilhado_escreve on public."MaterialCompartilhado" for insert
  with check (
    public.material_e_meu("materialId")
    -- Vínculo ATIVO com quem recebe. É a regra dura do grupo.
    and exists (
      select 1 from public."Vinculo" v
      where v."alunoId" = "MaterialCompartilhado"."alunoId"
        and v."profissionalId" = public.usuario_atual()
        and v.status = 'ATIVO'
    )
  );

/*
  Descompartilhar apaga de verdade: a entrega não é histórico clínico, é uma
  permissão. Deixá-la carimbada faria o aluno continuar aparecendo na lista de
  quem recebeu — e a tela do profissional é justamente essa lista.
*/
drop policy if exists materialcompartilhado_apaga on public."MaterialCompartilhado";
create policy materialcompartilhado_apaga on public."MaterialCompartilhado" for delete
  using (public.material_e_meu("materialId"));

/*
  "Vi" é do aluno que recebeu, e só dele. O autor enxerga o carimbo — é o que
  diz se o material chegou a ser aberto —, mas quem o cria é quem abriu.
*/
drop policy if exists materialcompartilhado_altera on public."MaterialCompartilhado";
create policy materialcompartilhado_altera on public."MaterialCompartilhado" for update
  using ("alunoId" = public.usuario_atual())
  with check ("alunoId" = public.usuario_atual());

create or replace function public.governar_material_compartilhado()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."materialId" := old."materialId";
  new."alunoId" := old."alunoId";
  new."compartilhadoEm" := old."compartilhadoEm";
  -- Visto uma vez, visto para sempre: a hora é a da primeira abertura.
  if old."vistoEm" is not null then
    new."vistoEm" := old."vistoEm";
  elsif new."vistoEm" is not null then
    new."vistoEm" := now();
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_material_compartilhado on public."MaterialCompartilhado";
create trigger governar_material_compartilhado
  before update on public."MaterialCompartilhado"
  for each row execute function public.governar_material_compartilhado();

grant select, insert, update, delete on public."MaterialCompartilhado" to authenticated;
