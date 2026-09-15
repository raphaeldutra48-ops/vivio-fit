-- A verificação de registro no conselho — a última tela que morava na API.
--
-- É a porta de entrada de todo o resto: sem verificação, o profissional não
-- recebe vínculo, e sem vínculo não alcança dado de saúde de ninguém. Por isso
-- ela é do ADMIN, e de mais ninguém.
--
-- Tudo aqui passa por função, e não por política. O motivo é o alcance: a tela
-- lê o cadastro de profissionais que **não têm relação nenhuma** com quem olha
-- — nem vínculo, nem aluno em comum. Abrir isso numa política de
-- `PerfilProfissional` ou de `User` significaria mexer na regra que protege
-- todo o resto do app para servir uma tela que só o admin abre. A função é o
-- contrário: alcance amplo, dentro de uma porta estreita, com o papel conferido
-- na primeira linha.

-- `sou_admin()` mora em `01-fundacao.sql`, junto dos outros ajudantes de papel.

/*
  A fila de verificação.

  `status` é derivado, e não uma coluna: **verificado vence recusa**, porque
  reaprovar depois de recusar é caminho normal — o profissional corrige o
  registro e reenvia. Guardar um campo `status` exigiria mantê-lo em dia a cada
  transição, e é o tipo de coluna que fica velha em silêncio.

  Mais antigo primeiro: quem espera há mais tempo é atendido antes.
*/
create or replace function public.profissionais_para_verificar(
  p_status text,
  p_busca text,
  p_limite int
)
returns table (
  id text,
  nome text,
  email text,
  telefone text,
  tipo text,
  "registroConselho" text,
  "ufRegistro" text,
  especialidades text[],
  bio text,
  "emailVerificado" boolean,
  status text,
  "criadoEm" timestamp,
  "verificadoEm" timestamp,
  "verificadoPorId" text,
  "verificadoPorNome" text,
  "recusadoEm" timestamp,
  "motivoRecusa" text
)
language sql
security definer
set search_path = public
stable
as $funcao$
  select
    p."userId",
    u.nome,
    u.email,
    u.telefone,
    p.tipo::text,
    p."registroConselho",
    p."ufRegistro",
    p.especialidades,
    p.bio,
    u."emailVerifEm" is not null,
    case
      when p."verificadoEm" is not null then 'VERIFICADO'
      when p."recusadoEm" is not null then 'RECUSADO'
      else 'PENDENTE'
    end,
    p."criadoEm",
    p."verificadoEm",
    p."verificadoPorId",
    a.nome,
    p."recusadoEm",
    p."motivoRecusa"
  from public."PerfilProfissional" p
  join public."User" u on u.id = p."userId" and u."deletadoEm" is null
  left join public."User" a on a.id = p."verificadoPorId"
  where public.sou_admin()
    and (
      p_status is null
      or (p_status = 'PENDENTE' and p."verificadoEm" is null and p."recusadoEm" is null)
      or (p_status = 'VERIFICADO' and p."verificadoEm" is not null)
      or (p_status = 'RECUSADO' and p."verificadoEm" is null and p."recusadoEm" is not null)
    )
    and (
      p_busca is null
      or u.nome ilike '%' || p_busca || '%'
      or u.email ilike '%' || p_busca || '%'
    )
  order by p."criadoEm" asc
  limit coalesce(p_limite, 50);
$funcao$;

create or replace function public.contar_profissionais_pendentes()
returns bigint
language sql
security definer
set search_path = public
stable
as $funcao$
  select count(*)
    from public."PerfilProfissional" p
    join public."User" u on u.id = p."userId" and u."deletadoEm" is null
   where public.sou_admin()
     and p."verificadoEm" is null
     and p."recusadoEm" is null;
$funcao$;

/*
  Aprovar destrava a conta — e são duas tabelas.

  O perfil ganha o carimbo e o `User` sai de PENDENTE_VERIFICACAO. Uma sem a
  outra é o pior dos dois mundos: perfil verificado com conta travada deixa o
  profissional vendo "aprovado" numa tela que não abre, e conta ativa com perfil
  pendente o faz receber vínculo sem ninguém ter conferido o registro dele no
  conselho. Por isso é uma função, e não dois `update` do cliente.

  Confirmar o e-mail continua sendo com ele: aprovar o registro não prova posse
  do endereço, são duas checagens diferentes.
*/
create or replace function public.verificar_profissional(p_profissional_id text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  if not public.sou_admin() then
    raise exception 'Você não tem acesso a este conteúdo.' using errcode = '42501';
  end if;
  if not exists (select 1 from public."PerfilProfissional" where "userId" = p_profissional_id) then
    raise exception 'Profissional não encontrado.' using errcode = 'P0002';
  end if;

  update public."PerfilProfissional"
     set "verificadoEm" = coalesce("verificadoEm", now()),
         "verificadoPorId" = eu,
         -- Aprovar depois de recusar limpa a recusa; o histórico fica na
         -- auditoria, que é onde ele não atrapalha a leitura da tela.
         "recusadoEm" = null,
         "motivoRecusa" = null,
         "atualizadoEm" = now()
   where "userId" = p_profissional_id;

  update public."User" set status = 'ATIVA', "atualizadoEm" = now()
   where id = p_profissional_id;
end;
$funcao$;

/*
  Recusar é decisão registrada, não apagada.

  O motivo é obrigatório: o profissional precisa saber o que corrigir, e quem
  recusou precisa ter dito por quê. A recusa também revoga a verificação
  anterior, se havia — descobrir que o registro não confere depois de aprovar é
  justamente o caso em que a porta tem de fechar.

  A conta NÃO é desativada aqui: ela volta a ser uma conta sem verificação, que
  é o estado de quem acabou de se cadastrar. Desativar seria punir o cadastro
  errado como se fosse fraude.
*/
create or replace function public.recusar_profissional(p_profissional_id text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  if not public.sou_admin() then
    raise exception 'Você não tem acesso a este conteúdo.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'A recusa precisa de um motivo.' using errcode = '23514';
  end if;
  if not exists (select 1 from public."PerfilProfissional" where "userId" = p_profissional_id) then
    raise exception 'Profissional não encontrado.' using errcode = 'P0002';
  end if;

  update public."PerfilProfissional"
     set "verificadoEm" = null,
         "verificadoPorId" = eu,
         "recusadoEm" = now(),
         "motivoRecusa" = btrim(p_motivo),
         "atualizadoEm" = now()
   where "userId" = p_profissional_id;
end;
$funcao$;

revoke execute on function public.profissionais_para_verificar(text, text, int) from public, anon;
revoke execute on function public.contar_profissionais_pendentes() from public, anon;
revoke execute on function public.verificar_profissional(text) from public, anon;
revoke execute on function public.recusar_profissional(text, text) from public, anon;
grant execute on function public.profissionais_para_verificar(text, text, int) to authenticated;
grant execute on function public.contar_profissionais_pendentes() to authenticated;
grant execute on function public.verificar_profissional(text) to authenticated;
grant execute on function public.recusar_profissional(text, text) to authenticated;
