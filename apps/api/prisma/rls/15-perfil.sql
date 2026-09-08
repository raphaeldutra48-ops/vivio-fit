-- Cada um edita o próprio cadastro, e não mais que isso.
--
-- Três invariantes que não podem morar no cliente, porque o cliente é
-- justamente quem tenta contorná-las:
--
--   1. Trocar o registro no conselho REVOGA a verificação. Sem isso bastaria
--      informar um número válido, ser aprovado pelo admin e substituir depois
--      — a checagem viraria enfeite.
--   2. Ninguém se verifica. `verificadoEm`, `verificadoPorId`, `recusadoEm` e
--      `motivoRecusa` são do admin; do lado do profissional só se apagam, e
--      só pela regra 1.
--   3. Ninguém troca o próprio papel nem o próprio status. Papel é o que as
--      políticas leem para decidir tudo; status é o que o admin usa para
--      suspender uma conta.

-- --------------------------------------------------------------------------
-- User: nome e telefone, do próprio dono.
-- --------------------------------------------------------------------------
drop policy if exists user_altera on public."User";
create policy user_altera on public."User" for update
  using (id = public.usuario_atual())
  with check (id = public.usuario_atual());

create or replace function public.governar_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if public.usuario_atual() is null then
    return new;
  end if;

  /*
    Papel e status ficam onde estão.

    Papel é o que TODA política lê para decidir. Um `update` que o trocasse
    seria escalonamento de privilégio pela porta da frente — o mesmo buraco que
    o gatilho de cadastro fecha do outro lado, ao recusar `papel` vindo do
    metadado do navegador.

    E-mail idem: ele é a ponte com o Supabase Auth enquanto os ids antigos
    forem cuid. Trocá-lo aqui, e não lá, quebraria o login em silêncio.
  */
  if new.papel is distinct from old.papel
     or new.status is distinct from old.status
     or new.email is distinct from old.email
     or new."emailVerifEm" is distinct from old."emailVerifEm"
     or new."senhaHash" is distinct from old."senhaHash"
     or new."deletadoEm" is distinct from old."deletadoEm" then
    raise exception 'Este campo do cadastro não se edita por aqui.' using errcode = '42501';
  end if;

  new."atualizadoEm" := now();
  return new;
end;
$funcao$;

drop trigger if exists governar_cadastro on public."User";
create trigger governar_cadastro
  before update on public."User"
  for each row execute function public.governar_cadastro();

-- --------------------------------------------------------------------------
-- PerfilAluno: altura e sexo biológico, do próprio aluno.
--
-- Os dois existem para a taxa metabólica — altura entra na Mifflin-St Jeor, e
-- o sexo é o atalho que ela usa para composição corporal.
-- --------------------------------------------------------------------------
drop policy if exists perfilaluno_altera on public."PerfilAluno";
create policy perfilaluno_altera on public."PerfilAluno" for update
  using ("userId" = public.usuario_atual())
  with check ("userId" = public.usuario_atual());

create or replace function public.tocar_perfil_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  -- `@updatedAt` é do Prisma, não do Postgres: pelo PostgREST não há quem o
  -- preencha, e a coluna é NOT NULL.
  new."atualizadoEm" := now();
  return new;
end;
$funcao$;

drop trigger if exists tocar_perfil_aluno on public."PerfilAluno";
create trigger tocar_perfil_aluno
  before update on public."PerfilAluno"
  for each row execute function public.tocar_perfil_aluno();

-- --------------------------------------------------------------------------
-- PerfilProfissional: bio, especialidades e registro — e o preço de mexer no
-- registro.
-- --------------------------------------------------------------------------
drop policy if exists perfilprofissional_altera on public."PerfilProfissional";
create policy perfilprofissional_altera on public."PerfilProfissional" for update
  using ("userId" = public.usuario_atual())
  with check ("userId" = public.usuario_atual());

create or replace function public.governar_perfil_profissional()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  mudou_registro boolean;
begin
  new."atualizadoEm" := now();

  -- Sem sessão é o admin pelo painel, ou o operador: é justamente quem PODE
  -- carimbar a verificação.
  if eu is null then
    return new;
  end if;

  if new.tipo is distinct from old.tipo then
    raise exception 'O tipo de profissional não se edita.' using errcode = '42501';
  end if;

  mudou_registro :=
    new."registroConselho" is distinct from old."registroConselho"
    or new."ufRegistro" is distinct from old."ufRegistro";

  /*
    Ninguém se verifica.

    Estes quatro campos são do admin. Do lado do profissional eles só podem ir
    para nulo, e só como CONSEQUÊNCIA de trocar o registro — nunca como
    escolha.
  */
  if not mudou_registro and (
       new."verificadoEm" is distinct from old."verificadoEm"
    or new."verificadoPorId" is distinct from old."verificadoPorId"
    or new."recusadoEm" is distinct from old."recusadoEm"
    or new."motivoRecusa" is distinct from old."motivoRecusa"
  ) then
    raise exception 'A verificação do conselho é do administrador.' using errcode = '42501';
  end if;

  /*
    Trocar o registro derruba a verificação, mesmo que o cliente tente
    preservá-la. É imposto aqui, e não pedido ao cliente, porque quem quer
    burlar é exatamente quem escreve o pedido.
  */
  if mudou_registro then
    new."verificadoEm" := null;
    new."verificadoPorId" := null;
    new."recusadoEm" := null;
    new."motivoRecusa" := null;
  end if;

  -- Nota e total de avaliações vêm de quem avaliou, não de quem é avaliado.
  if new."notaMedia" is distinct from old."notaMedia"
     or new."totalAvaliacoes" is distinct from old."totalAvaliacoes" then
    raise exception 'A nota vem das avaliações, não do perfil.' using errcode = '42501';
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_perfil_profissional on public."PerfilProfissional";
create trigger governar_perfil_profissional
  before update on public."PerfilProfissional"
  for each row execute function public.governar_perfil_profissional();

grant update on public."PerfilAluno" to authenticated;
grant update on public."PerfilProfissional" to authenticated;
-- Criar perfil é do gatilho de cadastro; apagar, de ninguém.
revoke insert, delete on public."PerfilAluno" from authenticated, anon;
revoke insert, delete on public."PerfilProfissional" from authenticated, anon;
revoke delete on public."User" from authenticated, anon;
