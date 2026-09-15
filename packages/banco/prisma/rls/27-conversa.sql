-- Conversa: e o consentimento que estava sendo pedido pela coisa errada.
--
-- ## O achado
--
-- `conversa_le` exigia `pode_ler_do_aluno("alunoId", 'MENSAGENS')` para
-- QUALQUER conversa. Mas o texto que o aluno lê ao decidir esse escopo é:
--
--   "Permitir que os profissionais que me acompanham troquem mensagens ENTRE
--    SI sobre o meu acompanhamento."
--
-- E o rótulo na tela é "Conversa entre profissionais".
--
-- Ou seja: MENSAGENS autoriza a conversa da EQUIPE CLÍNICA, onde o aluno não
-- participa. Não é a conversa dele com o personal. Um aluno que lesse aquele
-- texto e dissesse "não quero que falem de mim entre si" perderia o próprio
-- chat com quem o treina — tendo consentido coisa nenhuma a respeito disso.
--
-- Consentimento por finalidade que produz um efeito diferente do que o texto
-- promete é exatamente o que a LGPD não admite. Aqui a política passa a
-- separar os dois casos:
--
--   * ALUNO_PROFISSIONAL: quem participa lê. O direito de conversar veio do
--     VÍNCULO — aceitar um profissional já é aceitar falar com ele —, e é o
--     que a API sempre exigiu;
--   * EQUIPE_CLINICA: participar E o consentimento de MENSAGENS, que é
--     exatamente o que aquele texto autoriza.
--
-- Enquanto tudo passava pela API isso não aparecia: ela checava participação e
-- nunca chegava a perguntar o escopo.

/*
  Participar é a chave, e ela é lida de `ParticipanteConversa`.

  A política de `ParticipanteConversa` pergunta pela conversa, e a da conversa
  perguntaria pelo participante: isso recursa. Por isso a função — igual ao que
  `tem_vinculo` resolve em `Vinculo`.
*/
create or replace function public.participo_da_conversa(p_conversa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public."ParticipanteConversa" p
    where p."conversaId" = p_conversa_id
      and p."userId" = public.usuario_atual()
      and p."saiuEm" is null
  )
$$;

drop policy if exists conversa_le on public."Conversa";
create policy conversa_le on public."Conversa" for select using (
  public.participo_da_conversa(id)
  and (
    tipo = 'ALUNO_PROFISSIONAL'
    or public.tem_consentimento("alunoId", 'MENSAGENS')
  )
);

/*
  As filhas continuam perguntando pela conversa — quem não a alcança não
  alcança as mensagens nem a lista de participantes. O que muda é que agora a
  pergunta é sobre participação, e não sobre um consentimento de outra coisa.
*/
drop policy if exists mensagem_le on public."Mensagem";
create policy mensagem_le on public."Mensagem" for select using (
  exists (select 1 from public."Conversa" c where c.id = "conversaId")
);

drop policy if exists participanteconversa_le on public."ParticipanteConversa";
create policy participanteconversa_le on public."ParticipanteConversa" for select using (
  exists (select 1 from public."Conversa" c where c.id = "conversaId")
);

-- --------------------------------------------------------------------------
-- Escrever
-- --------------------------------------------------------------------------
drop policy if exists mensagem_escreve on public."Mensagem";
create policy mensagem_escreve on public."Mensagem" for insert
  with check ("autorId" = public.usuario_atual() and public.participo_da_conversa("conversaId"));

/*
  "Vi até agora" é do próprio participante, e é a única coluna que ele mexe. O
  contador de não lidas é derivado deste carimbo — mexer no do outro faria a
  conversa dele aparecer lida sem ele ter aberto.
*/
drop policy if exists participanteconversa_altera on public."ParticipanteConversa";
create policy participanteconversa_altera on public."ParticipanteConversa" for update
  using ("userId" = public.usuario_atual())
  with check ("userId" = public.usuario_atual());

create or replace function public.governar_participante_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."conversaId" := old."conversaId";
  new."userId" := old."userId";
  new."entrouEm" := old."entrouEm";
  new."saiuEm" := old."saiuEm";

  /*
    A hora de "vi até agora" é do BANCO, não de quem clicou.

    O contador de não lidas compara este carimbo com o `enviadaEm` das
    mensagens, que sai de `CURRENT_TIMESTAMP` — o relógio do servidor. Aceitar
    a hora do aparelho faria um celular atrasado alguns segundos marcar tudo
    como visto e continuar mostrando a bolinha de não lido, ou o contrário:
    um celular adiantado esconderia mensagem que ainda não chegou.
  */
  if new."vistoEm" is distinct from old."vistoEm" and new."vistoEm" is not null then
    new."vistoEm" := now();
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_participante_conversa on public."ParticipanteConversa";
create trigger governar_participante_conversa
  before update on public."ParticipanteConversa"
  for each row execute function public.governar_participante_conversa();

/*
  Mensagem enviada não se edita nem se apaga por fora: ela é o que a outra
  pessoa leu. Remover é carimbar `removidaEm`, e isso ainda não existe no app —
  quando existir, entra como função, com a regra de quem pode.
*/
create or replace function public.governar_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if public.usuario_atual() is not null then
    new."autorId" := public.usuario_atual();
  end if;
  -- A conversa sobe para o topo da lista de quem participa.
  update public."Conversa" set "atualizadoEm" = now() where id = new."conversaId";
  return new;
end;
$funcao$;

drop trigger if exists governar_mensagem on public."Mensagem";
create trigger governar_mensagem
  before insert on public."Mensagem"
  for each row execute function public.governar_mensagem();

grant select on public."Conversa" to authenticated;
grant select, insert on public."Mensagem" to authenticated;
grant select, update on public."ParticipanteConversa" to authenticated;
revoke update, delete on public."Mensagem" from authenticated, anon;
revoke insert, update, delete on public."Conversa" from authenticated, anon;
revoke insert, delete on public."ParticipanteConversa" from authenticated, anon;

/*
  Abrir conversa.

  Não é política porque o que decide não é a linha nova: é o PAR. Quem pode
  falar com quem sai dos papéis dos dois lados e de um vínculo ATIVO entre
  eles, e a conversa é reaproveitada quando já existe — abrir duas vezes não
  pode criar duas caixas de entrada para a mesma dupla.
*/
create or replace function public.abrir_conversa(p_com_usuario_id text)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  meu_papel text := public.papel_atual();
  outro record;
  v_aluno_id text;
  v_profissional_id text;
  v_id text;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  if eu = p_com_usuario_id then
    raise exception 'Não dá para conversar consigo mesmo.' using errcode = '23505';
  end if;

  select u.id, u.papel::text as papel into outro
  from public."User" u where u.id = p_com_usuario_id and u."deletadoEm" is null;
  if outro.id is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  if meu_papel = 'ALUNO' and outro.papel in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO') then
    v_aluno_id := eu;
    v_profissional_id := outro.id;
  elsif meu_papel in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO') and outro.papel = 'ALUNO' then
    v_aluno_id := outro.id;
    v_profissional_id := eu;
  else
    raise exception 'Esta conversa só existe entre aluno e profissional.' using errcode = '42501';
  end if;

  -- O direito de conversar vem do vínculo ATIVO: aceitar um profissional já é
  -- aceitar falar com ele.
  if not exists (
    select 1 from public."Vinculo" v
    where v."alunoId" = v_aluno_id and v."profissionalId" = v_profissional_id
      and v.status = 'ATIVO'
  ) then
    raise exception 'Você não possui vínculo ativo com este aluno.' using errcode = '42501';
  end if;

  /*
    Procura-depois-cria precisa de fila, e era a pendência 24. Duas aberturas
    simultâneas da mesma dupla — dois aparelhos, toque duplo, retry de rede —
    não enxergavam uma à outra e criavam DUAS conversas; o profissional via o
    aluno duas vezes e podia responder na caixa que o aluno não lê.

    Não há chave natural para um índice único (o par mora em
    `ParticipanteConversa`), então a trava é por dupla e dura só a transação:
    a segunda abertura espera a primeira terminar e encontra a conversa pronta.
    Duplas diferentes não esperam umas pelas outras.
  */
  perform pg_advisory_xact_lock(
    hashtextextended('abrir_conversa:' || v_aluno_id || ':' || v_profissional_id, 0)
  );

  select c.id into v_id
  from public."Conversa" c
  where c."alunoId" = v_aluno_id
    and c.tipo = 'ALUNO_PROFISSIONAL'
    and exists (
      select 1 from public."ParticipanteConversa" p
      where p."conversaId" = c.id and p."userId" = v_profissional_id
    );
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid()::text;
  insert into public."Conversa" (id, tipo, "alunoId", "criadoEm", "atualizadoEm")
  values (v_id, 'ALUNO_PROFISSIONAL', v_aluno_id, now(), now());
  insert into public."ParticipanteConversa" ("conversaId", "userId")
  values (v_id, v_aluno_id), (v_id, v_profissional_id);

  return v_id;
end;
$funcao$;

/*
  Os dois números que a lista de conversas mostra e que o PostgREST não sabe
  calcular: "a última mensagem de cada conversa" e "quantas não lidas".

  Não existe `distinct on` nem `group by` no PostgREST, e trazer as mensagens
  para contá-las no cliente significaria baixar o histórico inteiro para
  desenhar uma LISTA. O que ela devolve é agregação sobre o que quem pergunta
  já pode ler — a decisão de mostrar ou não o corpo de uma mensagem removida
  continua do lado de fora.
*/
create or replace function public.minhas_conversas()
returns table (
  "conversaId" text,
  "naoLidas" bigint,
  "ultimaCorpo" text,
  "ultimaEnviadaEm" timestamp,
  "ultimaAutorId" text,
  "ultimaRemovidaEm" timestamp
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p."conversaId",
    (
      select count(*) from public."Mensagem" m
      where m."conversaId" = p."conversaId"
        and m."autorId" <> p."userId"
        and (p."vistoEm" is null or m."enviadaEm" > p."vistoEm")
    ) as "naoLidas",
    u.corpo, u."enviadaEm", u."autorId", u."removidaEm"
  from public."ParticipanteConversa" p
  left join lateral (
    select m.corpo, m."enviadaEm", m."autorId", m."removidaEm"
    from public."Mensagem" m
    where m."conversaId" = p."conversaId"
    order by m."enviadaEm" desc
    limit 1
  ) u on true
  where p."userId" = public.usuario_atual() and p."saiuEm" is null
$$;

grant execute on function public.abrir_conversa(text) to authenticated;
grant execute on function public.minhas_conversas() to authenticated;
grant execute on function public.participo_da_conversa(text) to authenticated;
revoke execute on function public.abrir_conversa(text) from anon;
revoke execute on function public.minhas_conversas() from anon;
revoke execute on function public.participo_da_conversa(text) from anon;
