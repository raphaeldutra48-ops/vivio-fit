-- Cardio, calorimetria e avaliação física: a escrita.
--
-- Três tabelas de EVOLUCAO cuja leitura já estava no banco. O que faltava é
-- quem escreve — e, nas duas últimas, nem a permissão existia: a tela de
-- avaliação física não conseguia gravar nada.
--
-- Cada uma tem um dono de escrita diferente, e a diferença não é detalhe:
--
-- - **Cardio é autorrelato.** Quem correu foi o aluno; o profissional não sabe
--   se houve corrida. É a mesma regra do check-in e do registro de água.
-- - **Calorimetria vem de laboratório.** O aluno lança com o laudo na mão, e o
--   profissional que pediu o exame também — e quem digitou fica gravado.
-- - **Avaliação física é medida por alguém.** Dobra cutânea e bioimpedância
--   dependem de quem opera o aparelho, e quem opera é o profissional.

/*
  O `id` e o carimbo de hora eram do Prisma, como em todo o resto.

  `AtividadeCardio` e `CalorimetriaIndireta` não têm `atualizadoEm` — só
  `criadoEm`, que já tem default. `AvaliacaoFisica` também não. Então aqui só
  falta o `id`.
*/
do $$
declare t text;
begin
  foreach t in array array['AtividadeCardio', 'CalorimetriaIndireta', 'AvaliacaoFisica'] loop
    execute format(
      'alter table public.%I alter column id set default gen_random_uuid()::text', t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- Cardio
-- --------------------------------------------------------------------------
/*
  A execução citada tem de ser do próprio aluno.

  A API conferia isso antes de gravar, e sem a conferência dava para pendurar
  uma corrida no treino de outra pessoa mandando o id dela — o que soma minutos
  e calorias no resumo alheio.
*/
drop policy if exists cardio_escreve on public."AtividadeCardio";
create policy cardio_escreve on public."AtividadeCardio" for insert
  with check (
    "alunoId" = public.usuario_atual()
    and (
      "execucaoId" is null
      or exists (
        select 1 from public."ExecucaoTreino" e
        where e.id = "AtividadeCardio"."execucaoId"
          and e."alunoId" = public.usuario_atual()
      )
    )
  );

/*
  Apagar é carimbo: a atividade entra no gasto calórico do período, e a
  comparação entre semanas precisa que a semana passada continue sendo a que
  foi. O UPDATE serve só a isso — o gatilho abaixo não deixa mudar mais nada.
*/
drop policy if exists cardio_altera on public."AtividadeCardio";
create policy cardio_altera on public."AtividadeCardio" for update
  using ("alunoId" = public.usuario_atual())
  with check ("alunoId" = public.usuario_atual());

create or replace function public.governar_cardio()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if public.usuario_atual() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    /*
      O dono NÃO é forçado aqui, e é de propósito.

      Forçar `alunoId := usuario_atual()` faria o personal que tentasse lançar
      uma corrida no nome do aluno gravar uma corrida no nome DELE — a política
      aprovaria, porque o valor já teria sido reescrito, e ninguém veria erro
      nenhum. Autorrelato recusado precisa doer: a política confere o que veio,
      e o que veio de outra pessoa é recusado.

      Onde forçar é certo — `Exercicio`, `FotoEvolucao` — o dono do INSERT é
      sempre quem pede, e não há caso legítimo de escrever no nome de outro.
      Aqui há: o pedido existe e a resposta é não.
    */
    return new;
  else
    /*
      Corrigir uma atividade registrada não existe: registra-se outra. O que o
      UPDATE faz aqui é apagar, e por isso tudo menos `deletadoEm` volta ao que
      era — inclusive a duração, que é o que vira caloria.
    */
    new."alunoId" := old."alunoId";
    new."execucaoId" := old."execucaoId";
    new.tipo := old.tipo;
    new.intensidade := old.intensidade;
    new."duracaoMin" := old."duracaoMin";
    new."distanciaKm" := old."distanciaKm";
    new.data := old.data;
    new.observacao := old.observacao;
    new."criadoEm" := old."criadoEm";
    if old."deletadoEm" is not null then
      new."deletadoEm" := old."deletadoEm";
    end if;
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_cardio on public."AtividadeCardio";
create trigger governar_cardio
  before insert or update on public."AtividadeCardio"
  for each row execute function public.governar_cardio();

grant select, insert, update on public."AtividadeCardio" to authenticated;

-- --------------------------------------------------------------------------
-- Calorimetria indireta
-- --------------------------------------------------------------------------
/*
  Lançam o aluno e o profissional que pediu o exame — e só nutricionista ou
  médico, a mesma dupla que a política de leitura já reconhece. O personal não
  vê a calorimetria e por isso também não a lança.

  `pode_escrever_do_aluno` cobre vínculo e consentimento de EVOLUCAO; o
  `usuario_atual() = alunoId` é o caminho do próprio titular, que não depende de
  consentir consigo mesmo.
*/
drop policy if exists calorimetria_escreve on public."CalorimetriaIndireta";
create policy calorimetria_escreve on public."CalorimetriaIndireta" for insert
  with check (
    "registradoPorId" = public.usuario_atual()
    and (
      "alunoId" = public.usuario_atual()
      or public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array['NUTRICIONISTA', 'MEDICO'])
    )
  );

drop policy if exists calorimetria_altera on public."CalorimetriaIndireta";
create policy calorimetria_altera on public."CalorimetriaIndireta" for update
  using (
    "alunoId" = public.usuario_atual()
    or public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array['NUTRICIONISTA', 'MEDICO'])
  )
  with check (
    "alunoId" = public.usuario_atual()
    or public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array['NUTRICIONISTA', 'MEDICO'])
  );

create or replace function public.governar_calorimetria()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if public.usuario_atual() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Quem digitou fica gravado: o dado é de um laboratório, não da percepção
    -- de ninguém, e a tela mostra de quem veio.
    new."registradoPorId" := public.usuario_atual();
  else
    new."alunoId" := old."alunoId";
    new."registradoPorId" := old."registradoPorId";
    new.data := old.data;
    new."tmbMedidaKcal" := old."tmbMedidaKcal";
    new."pesoNoExameKg" := old."pesoNoExameKg";
    new.equipamento := old.equipamento;
    new.observacao := old.observacao;
    new."criadoEm" := old."criadoEm";
    if old."deletadoEm" is not null then
      new."deletadoEm" := old."deletadoEm";
    end if;
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_calorimetria on public."CalorimetriaIndireta";
create trigger governar_calorimetria
  before insert or update on public."CalorimetriaIndireta"
  for each row execute function public.governar_calorimetria();

grant select, insert, update on public."CalorimetriaIndireta" to authenticated;

-- --------------------------------------------------------------------------
-- Avaliação física
-- --------------------------------------------------------------------------
/*
  Quem mede é quem opera o aparelho.

  Dobra cutânea exige adipômetro e mão treinada; bioimpedância exige a balança.
  Nenhum dos dois o aluno faz sozinho em casa, e deixar a porta aberta aqui
  poria números de composição corporal no histórico sem ninguém por trás deles —
  números que depois viram meta, prescrição e conversa sobre o corpo da pessoa.

  Não há UPDATE: avaliação não se corrige, refaz-se. E não há DELETE, porque a
  série histórica é o produto — apagar a medição de março muda a leitura de
  junho.
*/
drop policy if exists avaliacao_escreve on public."AvaliacaoFisica";
create policy avaliacao_escreve on public."AvaliacaoFisica" for insert
  with check (
    "avaliadorId" = public.usuario_atual()
    and public.pode_escrever_do_aluno(
      "alunoId", 'EVOLUCAO', array['PERSONAL', 'NUTRICIONISTA', 'MEDICO']
    )
  );

create or replace function public.governar_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if public.usuario_atual() is not null then
    new."avaliadorId" := public.usuario_atual();
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_avaliacao on public."AvaliacaoFisica";
create trigger governar_avaliacao
  before insert on public."AvaliacaoFisica"
  for each row execute function public.governar_avaliacao();

grant select, insert on public."AvaliacaoFisica" to authenticated;
