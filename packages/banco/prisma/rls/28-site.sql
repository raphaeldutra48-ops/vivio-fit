-- Página pública do profissional: a única porta que abre para quem não entrou.
--
-- ## Por que função, e não política para o `anon`
--
-- A página mostra o nome do profissional, o registro no conselho, a UF e as
-- especialidades — dados que moram em `User` e `PerfilProfissional`, duas
-- tabelas que ninguém sem sessão pode ler. Abrir uma política de leitura para
-- o `anon` nessas tabelas para servir uma página seria escancarar duas portas
-- para entregar uma janela.
--
-- A página é uma PROJEÇÃO: um punhado de campos escolhidos para publicação.
-- Uma função devolve exatamente esses campos e nada mais, e nenhuma tabela
-- precisa ficar aberta.
--
-- ## Duas coisas que a política dizia errado
--
-- `perfilpublico_le` era `using (publicado = true)`, sem papel nenhum. Isso
-- produzia dois erros de uma vez:
--
--   1. o profissional NÃO conseguia ler o próprio RASCUNHO — a tela de editar
--      a página abriria vazia para quem ainda não publicou, que é justamente
--      quem está montando;
--   2. faltava a verificação. A API só serve a página de quem teve o registro
--      no conselho conferido pelo admin — "uma página dizendo médico sem
--      verificação seria a plataforma emprestando credibilidade a quem não
--      comprovou nada". A política servia qualquer página publicada.
--
-- Agora a tabela é do dono, e o público entra pela função.

drop policy if exists perfilpublico_le on public."PerfilPublico";
create policy perfilpublico_le on public."PerfilPublico" for select using (
  "profissionalId" = public.usuario_atual()
);

/*
  INSERT e UPDATE separados, e não um `for all`: `for all` também concede
  SELECT, e aí a política de leitura acima nunca decidiria nada — ficaria
  ali parecendo a regra sem ser. Cada uma faz um trabalho.
*/
drop policy if exists perfilpublico_escreve on public."PerfilPublico";
create policy perfilpublico_escreve on public."PerfilPublico" for insert
  with check ("profissionalId" = public.usuario_atual());

drop policy if exists perfilpublico_altera on public."PerfilPublico";
create policy perfilpublico_altera on public."PerfilPublico" for update
  using ("profissionalId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual());

create or replace function public.governar_perfil_publico()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_verificado timestamp;
begin
  new."atualizadoEm" := now();
  new.slug := lower(btrim(new.slug));
  new.uf := upper(nullif(btrim(coalesce(new.uf, '')), ''));
  -- O `@` do Instagram é como a pessoa escreve, e não como o link é montado.
  new.instagram := nullif(regexp_replace(coalesce(new.instagram, ''), '^@', ''), '');

  if tg_op = 'INSERT' then
    if public.usuario_atual() is not null then
      new."profissionalId" := public.usuario_atual();
    end if;
  else
    new."profissionalId" := old."profissionalId";
    new."criadoEm" := old."criadoEm";
  end if;

  /*
    Endereços que a plataforma usa para si. Um profissional com o slug "admin"
    ou "api" tomaria uma rota do produto, e o dono do endereço passaria a ser
    quem chegou primeiro.

    A lista é a de `SLUGS_RESERVADOS`, em `@vivio/contracts`, palavra por
    palavra. Duas listas que precisam concordar é o começo de uma divergência —
    e a prova em `packages/sdk/teste/site.spec.ts` percorre a do contrato
    inteira contra o banco, para que a próxima palavra acrescentada lá quebre
    aqui em vez de virar endereço de alguém.
  */
  if new.slug in (
    'admin', 'api', 'app', 'alunos', 'login', 'cadastrar', 'sobre', 'ajuda',
    'suporte', 'contato', 'termos', 'privacidade', 'vivio', 'viviofit'
  ) then
    raise exception 'Este endereço é reservado. Escolha outro.' using errcode = '23505';
  end if;

  /*
    Publicar exige registro conferido. Salvar rascunho é livre — a pessoa monta
    a página enquanto espera a verificação, e é isso que a mensagem diz.
  */
  if new.publicado then
    select pp."verificadoEm" into v_verificado
    from public."PerfilProfissional" pp
    where pp."userId" = new."profissionalId";

    if v_verificado is null then
      raise exception
        'Só é possível publicar depois que seu registro no conselho for verificado. Você pode salvar como rascunho enquanto isso.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_perfil_publico on public."PerfilPublico";
create trigger governar_perfil_publico
  before insert or update on public."PerfilPublico"
  for each row execute function public.governar_perfil_publico();

grant select, insert, update on public."PerfilPublico" to authenticated;
revoke all on public."PerfilPublico" from anon;
revoke delete on public."PerfilPublico" from authenticated;

/*
  O que qualquer pessoa vê.

  Sem e-mail, sem id, sem `profissionalId` — nada que não foi escolhido para
  publicação. `null` quando a página não está no ar, e o chamador não descobre
  QUAL das razões: despublicada, não verificada e conta removida respondem
  igual.
*/
create or replace function public.pagina_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', pp.slug,
    'titulo', pp.titulo,
    'apresentacao', pp.apresentacao,
    'cidade', pp.cidade,
    'uf', pp.uf,
    'atendeOnline', pp."atendeOnline",
    'atendePresencial', pp."atendePresencial",
    'whatsapp', pp.whatsapp,
    'instagram', pp.instagram,
    'profissional', jsonb_build_object(
      'nome', u.nome,
      'papel', u.papel,
      'registroConselho', prof."registroConselho",
      'ufRegistro', prof."ufRegistro",
      'especialidades', to_jsonb(prof.especialidades)
    )
  )
  from public."PerfilPublico" pp
  join public."User" u on u.id = pp."profissionalId"
  join public."PerfilProfissional" prof on prof."userId" = pp."profissionalId"
  where pp.slug = lower(btrim(p_slug))
    and pp.publicado = true
    and prof."verificadoEm" is not null
    and u."deletadoEm" is null
$$;

/*
  O formulário da página.

  É a única escrita do sistema feita por quem NÃO tem conta, e por isso ela não
  é uma política de INSERT: uma política precisaria que o `anon` lesse
  `PerfilPublico` para conferir se a página existe, e a tabela deixou de ser
  legível para ele. A função confere pelo mesmo caminho da página — fora do
  ar, não recebe pedido.
*/
create or replace function public.enviar_pedido_de_contato(
  p_slug text,
  p_nome text,
  p_email text,
  p_telefone text default null,
  p_mensagem text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_perfil_id text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_na_ultima_hora int;
begin
  if public.pagina_publica(p_slug) is null then
    raise exception 'Página não encontrada.' using errcode = 'P0002';
  end if;

  /*
    Conferência de tamanho AQUI, e não só no formulário.

    Esta é a única escrita do sistema feita por quem não tem conta, e quem chama
    pode ser o formulário da página ou um script apontado para a RPC. O schema do
    cliente limita nome, e-mail e mensagem; do lado de fora nada limitava — e
    `mensagem` sem teto é convite a gravar megabytes na caixa de alguém.
  */
  if length(btrim(coalesce(p_nome, ''))) < 2 or length(btrim(p_nome)) > 120 then
    raise exception 'Nome inválido.' using errcode = '22023';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or length(v_email) > 160 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  if length(coalesce(p_telefone, '')) > 40 or length(coalesce(p_mensagem, '')) > 1000 then
    raise exception 'Mensagem longa demais.' using errcode = '22023';
  end if;

  select pp.id into v_perfil_id
  from public."PerfilPublico" pp where pp.slug = lower(btrim(p_slug));

  /*
    O MESMO e-mail não enfileira duas vezes na mesma página enquanto não for
    atendido.

    Serve para duas coisas: o toque duplo de quem está com internet ruim, que
    geraria dois contatos idênticos, e o script que repete o envio. Não é erro
    para quem está do outro lado — o pedido dela já está lá —, então sai em
    silêncio em vez de explodir na cara de um cliente em potencial.
  */
  if exists (
    select 1 from public."PedidoDeContato" pc
    where pc."perfilId" = v_perfil_id
      and pc.email = v_email
      and pc."atendidoEm" is null
  ) then
    return;
  end if;

  /*
    Teto por página e por hora.

    Sem ele, qualquer um inunda a caixa de um profissional e os pedidos de
    verdade somem no meio — o recurso deixa de servir justamente por estar
    aberto. Vinte por hora é mais do que qualquer página real recebe e menos do
    que um script precisa para atrapalhar.
  */
  select count(*) into v_na_ultima_hora
  from public."PedidoDeContato" pc
  where pc."perfilId" = v_perfil_id
    and pc."criadoEm" > now() - interval '1 hour';

  if v_na_ultima_hora >= 20 then
    raise exception 'Muitos pedidos para esta página agora. Tente mais tarde.'
      using errcode = '53400';
  end if;

  insert into public."PedidoDeContato" (id, "perfilId", nome, email, telefone, mensagem)
  values (
    gen_random_uuid()::text, v_perfil_id, btrim(p_nome), v_email,
    nullif(btrim(coalesce(p_telefone, '')), ''), nullif(btrim(coalesce(p_mensagem, '')), '')
  );
end;
$funcao$;

/*
  Os pedidos são do dono da página, e de mais ninguém: são nome, e-mail e
  telefone de gente que ainda nem é usuária do app.
*/
drop policy if exists pedidocontato_escreve on public."PedidoDeContato";
drop policy if exists pedidocontato_altera on public."PedidoDeContato";
create policy pedidocontato_altera on public."PedidoDeContato" for update
  using (
    exists (
      select 1 from public."PerfilPublico" pp
      where pp.id = "PedidoDeContato"."perfilId"
        and pp."profissionalId" = public.usuario_atual()
    )
  )
  with check (
    exists (
      select 1 from public."PerfilPublico" pp
      where pp.id = "PedidoDeContato"."perfilId"
        and pp."profissionalId" = public.usuario_atual()
    )
  );

create or replace function public.governar_pedido_de_contato()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  -- O pedido é o que a pessoa escreveu. Só o carimbo de atendido se mexe.
  new."perfilId" := old."perfilId";
  new.nome := old.nome;
  new.email := old.email;
  new.telefone := old.telefone;
  new.mensagem := old.mensagem;
  new."criadoEm" := old."criadoEm";
  return new;
end;
$funcao$;

drop trigger if exists governar_pedido_de_contato on public."PedidoDeContato";
create trigger governar_pedido_de_contato
  before update on public."PedidoDeContato"
  for each row execute function public.governar_pedido_de_contato();

grant select, update on public."PedidoDeContato" to authenticated;
revoke insert, delete on public."PedidoDeContato" from authenticated, anon;
revoke all on public."PedidoDeContato" from anon;

grant execute on function public.pagina_publica(text) to anon, authenticated;
grant execute on function public.enviar_pedido_de_contato(text, text, text, text, text)
  to anon, authenticated;
