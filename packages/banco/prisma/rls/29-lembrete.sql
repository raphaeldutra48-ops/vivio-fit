-- Lembretes, dispositivos e notificações: tudo do próprio dono.
--
-- Este grupo não tem vínculo nem consentimento no meio. A que horas alguém
-- quer ser cutucado, em que aparelho, e o que já foi avisado a ele — nada
-- disso interessa a quem o acompanha, e as políticas de leitura já diziam
-- isso. Faltava a escrita.
--
-- ## O disparo não mora aqui
--
-- Quem varre o que está na hora e cria o aviso é
-- `42-disparo-de-lembretes.sql`, chamado pelo `pg_cron` a cada minuto (antes
-- era `lembretes.scheduler.ts`, dentro da API). Este arquivo é a metade que o
-- app usa: ler e escrever a configuração, registrar o aparelho e marcar lida.
--
-- Por isso `Notificacao` fica com leitura e UPDATE, e sem INSERT: quem cria
-- notificação é o disparador. O app só marca lida.

-- --------------------------------------------------------------------------
-- Configuração de lembrete
-- --------------------------------------------------------------------------
drop policy if exists configlembrete_escreve on public."ConfiguracaoLembrete";
create policy configlembrete_escreve on public."ConfiguracaoLembrete" for insert
  with check ("alunoId" = public.usuario_atual());

drop policy if exists configlembrete_altera on public."ConfiguracaoLembrete";
create policy configlembrete_altera on public."ConfiguracaoLembrete" for update
  using ("alunoId" = public.usuario_atual())
  with check ("alunoId" = public.usuario_atual());

create or replace function public.governar_configuracao_lembrete()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."atualizadoEm" := now();
  if tg_op = 'INSERT' then
    if public.usuario_atual() is not null then
      new."alunoId" := public.usuario_atual();
    end if;
    return new;
  end if;
  -- Trocar o dono ou o tipo é criar outra configuração por cima da existente,
  -- e a chave é justamente o par (aluno, tipo).
  new."alunoId" := old."alunoId";
  new.tipo := old.tipo;
  new."criadoEm" := old."criadoEm";
  return new;
end;
$funcao$;

drop trigger if exists governar_configuracao_lembrete on public."ConfiguracaoLembrete";
create trigger governar_configuracao_lembrete
  before insert or update on public."ConfiguracaoLembrete"
  for each row execute function public.governar_configuracao_lembrete();

grant select, insert, update on public."ConfiguracaoLembrete" to authenticated;
revoke delete on public."ConfiguracaoLembrete" from authenticated, anon;

-- --------------------------------------------------------------------------
-- Aparelho
--
-- O mesmo token migra de conta — celular emprestado, troca de login —, então
-- registrar REATRIBUI em vez de duplicar. Sem isso o dono anterior continuaria
-- recebendo os lembretes de quem está usando o aparelho agora.
-- --------------------------------------------------------------------------
/*
  Registrar é FUNÇÃO, e a razão apareceu no teste.

  A reatribuição é um `insert ... on conflict do update` sobre a linha de OUTRA
  pessoa, e o Postgres exige poder LER a linha em conflito para resolvê-la. Ou
  seja: para o upsert funcionar, quem chega teria de enxergar o registro de
  quem estava — e "este token pertence a alguém" é justamente o que não se
  conta. A função resolve do lado de dentro, e ninguém precisa ler nada.
*/
drop policy if exists tokendispositivo_escreve on public."TokenDispositivo";
drop policy if exists tokendispositivo_altera on public."TokenDispositivo";
create policy tokendispositivo_altera on public."TokenDispositivo" for update
  using ("userId" = public.usuario_atual())
  with check ("userId" = public.usuario_atual());

create or replace function public.registrar_dispositivo(p_token text, p_plataforma text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  /*
    O mesmo token migra de conta — celular emprestado, troca de login. Sem
    reatribuir, o dono anterior continuaria recebendo os lembretes de quem
    está com o aparelho na mão agora.
  */
  insert into public."TokenDispositivo" (id, "userId", token, plataforma, ativo, "usadoEm")
  values (gen_random_uuid()::text, eu, p_token, p_plataforma, true, now())
  on conflict (token) do update
    set "userId" = eu, plataforma = p_plataforma, ativo = true, "usadoEm" = now();
end;
$funcao$;

grant execute on function public.registrar_dispositivo(text, text) to authenticated;
revoke execute on function public.registrar_dispositivo(text, text) from anon;

create or replace function public.governar_token_dispositivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if public.usuario_atual() is not null then
    new."userId" := public.usuario_atual();
  end if;
  new."usadoEm" := now();
  if tg_op = 'UPDATE' then
    new.token := old.token;
    new."criadoEm" := old."criadoEm";
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_token_dispositivo on public."TokenDispositivo";
create trigger governar_token_dispositivo
  before insert or update on public."TokenDispositivo"
  for each row execute function public.governar_token_dispositivo();

grant select, update on public."TokenDispositivo" to authenticated;
revoke insert on public."TokenDispositivo" from authenticated, anon;
/*
  Sair não apaga o registro: ele carimba `ativo = false`. Apagar perderia a
  informação de que aquele aparelho já esteve nesta conta, que é o que permite
  entender um push que chegou onde não devia.
*/
revoke delete on public."TokenDispositivo" from authenticated, anon;

-- --------------------------------------------------------------------------
-- Notificação
-- --------------------------------------------------------------------------
drop policy if exists notificacao_altera on public."Notificacao";
create policy notificacao_altera on public."Notificacao" for update
  using ("userId" = public.usuario_atual())
  with check ("userId" = public.usuario_atual());

create or replace function public.governar_notificacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  /*
    A notificação é o registro do que foi avisado, e o APP só carimba que leu.
    O texto, a hora de envio e o erro são de quem disparou — reescrevê-los
    apagaria a única trilha de por que um lembrete não chegou.

    "Sem sessão" aqui é o disparador: ele roda com a chave de serviço, sem
    `vivio_id` no token, e é ele quem preenche `enviadaEm`, `falhaEm` e
    `erro`. Congelar as colunas para ele também foi o primeiro jeito de
    escrever isto, e a suíte da API pegou na hora: o lembrete era enviado e
    ficava marcado como nunca enviado.
  */
  if public.usuario_atual() is not null then
    new."userId" := old."userId";
    new.tipo := old.tipo;
    new.titulo := old.titulo;
    new.corpo := old.corpo;
    new.deeplink := old.deeplink;
    new."referenteA" := old."referenteA";
    new."agendadaPara" := old."agendadaPara";
    new."enviadaEm" := old."enviadaEm";
    new."falhaEm" := old."falhaEm";
    new.erro := old.erro;
    new."criadoEm" := old."criadoEm";
  end if;

  -- Lida uma vez, lida para sempre: a hora é a da primeira abertura.
  if old."lidaEm" is not null then
    new."lidaEm" := old."lidaEm";
  elsif new."lidaEm" is not null and public.usuario_atual() is not null then
    new."lidaEm" := now();
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_notificacao on public."Notificacao";
create trigger governar_notificacao
  before update on public."Notificacao"
  for each row execute function public.governar_notificacao();

grant select, update on public."Notificacao" to authenticated;
/*
  Quem cria notificação é quem dispara, com a chave de serviço. Um cliente que
  pudesse inserir escreveria na caixa de avisos de si mesmo — e, pior, a tela
  passaria a mostrar aviso que ninguém enviou.
*/
revoke insert, delete on public."Notificacao" from authenticated, anon;
