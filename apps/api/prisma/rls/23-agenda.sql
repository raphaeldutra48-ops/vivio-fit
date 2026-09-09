-- Agenda: quem marca, quem confirma e quem cancela.
--
-- ## O que o banco já resolvia sozinho
--
-- A sobreposição de horário é uma restrição `EXCLUDE` desde a migração da
-- agenda: o Postgres recusa qualquer compromisso que cruze outro do mesmo
-- profissional, e só entre os vivos — cancelado e realizado liberam a vaga.
-- Isso não muda com a saída da API; muda quem recebe a mensagem, e por isso o
-- SDK traduz `23P01` na frase que o profissional já lia.
--
-- ## O que era do controlador e passa a ser do banco
--
-- A regra mais fina da agenda não é de linha, é de TRANSIÇÃO: o aluno pode
-- confirmar presença e cancelar, e só. Marcar como realizado ou como falta é
-- registro do atendimento — quem faz é quem atendeu. Uma política enxerga a
-- linha nova; ela não sabe dizer "este campo mudou e quem mudou foi o aluno".
-- Então isso vira gatilho.
--
-- Também vira gatilho o que o `@Papeis` dizia: marcar é do profissional, e o
-- compromisso é dele — `profissionalId` e `criadoPorId` não vêm do corpo do
-- pedido, vêm de quem está pedindo.

-- --------------------------------------------------------------------------
-- Compromisso
-- --------------------------------------------------------------------------
drop policy if exists compromisso_escreve on public."Compromisso";
create policy compromisso_escreve on public."Compromisso" for insert
  with check (
    "profissionalId" = public.usuario_atual()
    and public.papel_atual() in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO')
    -- Vínculo ATIVO, e não qualquer vínculo: convite pendente não é relação de
    -- atendimento, e marcar consulta com quem ainda não aceitou é agendar na
    -- agenda de alguém que não te conhece.
    and exists (
      select 1 from public."Vinculo" v
      where v."alunoId" = "Compromisso"."alunoId"
        and v."profissionalId" = public.usuario_atual()
        and v.status = 'ATIVO'
    )
  );

/*
  Alterar: o dono da agenda, ou o aluno do compromisso.

  O que cada um pode MUDAR é o gatilho que decide. Aqui só se diz quem chega
  perto da linha.
*/
drop policy if exists compromisso_altera on public."Compromisso";
create policy compromisso_altera on public."Compromisso" for update
  using ("profissionalId" = public.usuario_atual() or "alunoId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual() or "alunoId" = public.usuario_atual());

create or replace function public.governar_compromisso()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  -- `@updatedAt` é do Prisma e some quando quem escreve é o PostgREST.
  new."atualizadoEm" := now();

  if tg_op = 'INSERT' then
    if eu is not null then
      new."profissionalId" := eu;
      new."criadoPorId" := eu;
    end if;
    if new."fimEm" <= new."inicioEm" then
      raise exception 'O fim precisa ser depois do início.' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Trocar o dono ou o aluno de um compromisso é criar outro compromisso por
  -- cima do histórico de alguém.
  new."profissionalId" := old."profissionalId";
  new."alunoId" := old."alunoId";
  new."criadoPorId" := old."criadoPorId";
  new."criadoEm" := old."criadoEm";

  if eu is not null and eu = old."alunoId" and eu <> old."profissionalId" then
    /*
      O aluno confirma ou cancela, e nada mais.

      Deixá-lo marcar REALIZADO faria o registro de atendimento ser escrito por
      quem foi atendido — e o profissional descobriria depois, numa lista que
      diz que ele atendeu alguém que não apareceu.
    */
    if new.status is distinct from old.status
       and new.status not in ('CONFIRMADO', 'CANCELADO') then
      raise exception 'Você pode confirmar ou cancelar; o restante é o profissional que registra.'
        using errcode = '42501';
    end if;
    new."inicioEm" := old."inicioEm";
    new."fimEm" := old."fimEm";
    new.tipo := old.tipo;
    new.titulo := old.titulo;
    new.local := old.local;
    new.observacao := old.observacao;
  end if;

  /*
    Compromisso já realizado não se remarca: ele é o registro de um
    atendimento que aconteceu naquela hora.
  */
  if old.status = 'REALIZADO'
     and (new."inicioEm" <> old."inicioEm" or new."fimEm" <> old."fimEm") then
    raise exception 'Compromisso já realizado não pode ser remarcado.' using errcode = '23505';
  end if;

  if new."fimEm" <= new."inicioEm" then
    raise exception 'O fim precisa ser depois do início.' using errcode = '23514';
  end if;

  -- Cancelar carimba quando e por quê; sair do cancelamento limpa os dois.
  if new.status = 'CANCELADO' and old.status <> 'CANCELADO' then
    new."canceladoEm" := now();
  elsif new.status <> 'CANCELADO' then
    new."canceladoEm" := null;
    new."motivoCancelamento" := null;
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_compromisso on public."Compromisso";
create trigger governar_compromisso
  before insert or update on public."Compromisso"
  for each row execute function public.governar_compromisso();

grant select, insert, update on public."Compromisso" to authenticated;
/*
  Compromisso não se apaga: cancelado continua na agenda como histórico, e é
  o que permite ver que alguém desmarcou três vezes seguidas.
*/
revoke delete on public."Compromisso" from authenticated, anon;

-- --------------------------------------------------------------------------
-- Disponibilidade e bloqueios: do dono da agenda, e só dele.
-- --------------------------------------------------------------------------
drop policy if exists disponibilidade_escreve on public."DisponibilidadeSlot";
create policy disponibilidade_escreve on public."DisponibilidadeSlot" for all
  using ("profissionalId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual());

drop policy if exists bloqueio_escreve on public."BloqueioAgenda";
create policy bloqueio_escreve on public."BloqueioAgenda" for all
  using ("profissionalId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual());

grant select, insert, update, delete on public."DisponibilidadeSlot" to authenticated;
grant select, insert, update, delete on public."BloqueioAgenda" to authenticated;

/*
  Definir a semana de atendimento substitui a semana INTEIRA.

  É mais previsível para quem edita do que casar janela por janela — e por isso
  precisa ser atômico: apagar as janelas e falhar na hora de gravar as novas
  deixaria o profissional sem agenda nenhuma, e o app dele mostraria "nenhum
  horário disponível" para todos os alunos.
*/
create or replace function public.definir_disponibilidade(p_janelas jsonb)
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
  if public.papel_atual() not in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO') then
    raise exception 'Apenas profissionais têm agenda de atendimento.' using errcode = '42501';
  end if;

  delete from public."DisponibilidadeSlot" where "profissionalId" = eu;

  insert into public."DisponibilidadeSlot" (
    id, "profissionalId", "diaSemana", "horaInicio", "horaFim", "duracaoMin"
  )
  select gen_random_uuid()::text, eu, (j->>'diaSemana')::int,
         j->>'horaInicio', j->>'horaFim',
         coalesce((j->>'duracaoMin')::int, 60)
  from jsonb_array_elements(coalesce(p_janelas, '[]'::jsonb)) j;
end;
$funcao$;

grant execute on function public.definir_disponibilidade(jsonb) to authenticated;
revoke execute on function public.definir_disponibilidade(jsonb) from anon;
