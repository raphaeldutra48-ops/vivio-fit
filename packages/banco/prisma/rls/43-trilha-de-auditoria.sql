-- A trilha de auditoria volta a ser escrita.
--
-- A tela "quem viu meus dados" é direito do titular (LGPD), e o que ela mostra
-- era gravado pela API: um interceptor anotava cada acesso bem-sucedido a rota
-- marcada com `@Auditar`, e os guards anotavam as recusas. Quando o SDK passou
-- a ler direto do banco, nada tomou o lugar — a última linha de `LogAuditoria`
-- é de 11/09/2026. A tela continuou abrindo, mostrando um passado que parou.
--
-- ## Duas metades, com garantias diferentes, e isso fica dito
--
-- ESCRITA é gatilho: criar, alterar ou apagar dado do aluno em uma das tabelas
-- abaixo grava a linha dentro da mesma transação. Não depende do app — nem de
-- ele estar certo, nem de estar sendo usado.
--
-- LEITURA não tem gatilho no Postgres. Ela é anotada por `registrar_leitura`,
-- que o SDK chama quando alguém abre dado de um aluno. O app de verdade sempre
-- chama; quem monta consultas à mão pelo console do navegador não chamaria. A
-- política continua decidindo O QUE essa pessoa lê — a trilha de leitura é o
-- registro do uso normal, não uma barreira.

-- --------------------------------------------------------------------------
-- De onde veio o pedido
-- --------------------------------------------------------------------------
/*
  O PostgREST põe os cabeçalhos da requisição em `request.headers`. O IP é o
  primeiro do `x-forwarded-for` (a borda do Supabase acrescenta os saltos
  depois). Fora de uma requisição — gatilho disparado pelo agendador, script
  com a chave de serviço — a variável não existe e os dois ficam nulos.
*/
create or replace function public.origem_do_pedido(out ip text, out agente text)
language plpgsql
stable
set search_path = public
as $funcao$
declare
  cabecalhos jsonb;
begin
  begin
    cabecalhos := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    cabecalhos := null;
  end;
  ip := nullif(trim(split_part(coalesce(cabecalhos->>'x-forwarded-for', ''), ',', 1)), '');
  agente := left(cabecalhos->>'user-agent', 300);
end;
$funcao$;

revoke execute on function public.origem_do_pedido() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Escrita: gatilho
-- --------------------------------------------------------------------------
/*
  `tg_argv[0]` é o nome do recurso, o mesmo que o `@Auditar` da API usava —
  a tela já sabe exibi-los. `tg_argv[1]` é o escopo de consentimento que o
  recurso exige.

  Não anota:
  - o titular mexendo no que é dele (a tela é sobre OUTRAS pessoas);
  - escrita sem sessão (agendador, script de manutenção): não há "quem".

  Nunca derruba a escrita. Falhar ao auditar é grave e vai para o log do banco
  como aviso, mas recusar o treino que o aluno acabou de registrar por causa
  disso seria punir a pessoa errada.
*/
create or replace function public.auditar_escrita()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  ator text := public.usuario_atual();
  linha jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  aluno text := linha->>'alunoId';
  v_acao "AcaoAuditoria";
  origem record;
begin
  if ator is null or aluno is null or ator = aluno then
    return null;
  end if;

  v_acao := case tg_op
    when 'INSERT' then 'CRIAR'
    when 'DELETE' then 'REMOVER'
    else 'ATUALIZAR'
  end;
  /*
    Apagar por carimbo é remover, e é assim que a pessoa entende o que houve.
    Pelo JSON, e não por `old."deletadoEm"`: a função serve tabelas sem essa
    coluna, e ler campo que o registro não tem é erro em tempo de execução.
  */
  if tg_op = 'UPDATE'
     and to_jsonb(old) ? 'deletadoEm'
     and to_jsonb(old)->>'deletadoEm' is null
     and to_jsonb(new)->>'deletadoEm' is not null then
    v_acao := 'REMOVER';
  end if;

  begin
    select * into origem from public.origem_do_pedido();
    insert into public."LogAuditoria"
      (id, "atorId", acao, "recursoTipo", "recursoId", "alunoId", escopo, ip, "userAgent", metadata)
    values (
      gen_random_uuid()::text, ator, v_acao, tg_argv[0], linha->>'id', aluno,
      tg_argv[1]::"EscopoDado", origem.ip, origem.agente,
      jsonb_build_object('origem', 'gatilho', 'tabela', tg_table_name)
    );
  exception when others then
    raise warning 'auditoria de escrita falhou (% em %): %', tg_op, tg_table_name, sqlerrm;
  end;

  return null;
end;
$funcao$;

revoke execute on function public.auditar_escrita() from public, anon, authenticated;

do $gatilhos$
declare
  t record;
begin
  for t in
    select * from (values
      ('AlertaClinico',        'ALERTA_CLINICO',   'CLINICO'),
      ('Anamnese',             'ANAMNESE',         'CLINICO'),
      ('CondicaoSaude',        'CONDICAO_SAUDE',   'CLINICO'),
      ('Exame',                'EXAME',            'CLINICO'),
      ('Prescricao',           'PRESCRICAO',       'CLINICO'),
      ('AvaliacaoFisica',      'AVALIACAO_FISICA', 'EVOLUCAO'),
      ('CalorimetriaIndireta', 'CALORIMETRIA',     'EVOLUCAO'),
      ('CheckinDiario',        'CHECKIN',          'EVOLUCAO'),
      ('FotoEvolucao',         'FOTO_EVOLUCAO',    'EVOLUCAO'),
      ('Medida',               'MEDIDA',           'EVOLUCAO'),
      ('Meta',                 'META',             'EVOLUCAO'),
      ('PlanoDieta',           'PLANO_DIETA',      'NUTRICAO'),
      ('AtividadeCardio',      'CARDIO',           'TREINO'),
      ('ExecucaoTreino',       'EXECUCAO_TREINO',  'TREINO'),
      ('PlanoTreino',          'PLANO_TREINO',     'TREINO')
    ) as v(tabela, recurso, escopo)
  loop
    execute format('drop trigger if exists auditar_escrita on public.%I', t.tabela);
    execute format(
      'create trigger auditar_escrita after insert or update or delete on public.%I '
      'for each row execute function public.auditar_escrita(%L, %L)',
      t.tabela, t.recurso, t.escopo
    );
  end loop;
end;
$gatilhos$;

-- --------------------------------------------------------------------------
-- Leitura: função que o SDK chama
-- --------------------------------------------------------------------------
/*
  Quem é o ator não vem de parâmetro: é a sessão. Assim ninguém escreve na
  trilha em nome de outra pessoa — o máximo que alguém consegue é anotar a si
  mesmo lendo, o que já é verdade no instante em que chama.

  O que se anota depende de a pessoa poder ler: pode → LER; não pode →
  NEGADO, que é a linha que mais importa (tentativa de acesso indevido).

  ## Uma linha por janela de dez minutos

  A API anotava cada requisição. Pelo cliente isso vira uma enxurrada: a tela
  do aluno carrega medidas, checkins e metas de uma vez, e os painéis
  consultam de novo a cada poucos segundos. Uma lista com quarenta "Diego leu
  suas medidas" no mesmo minuto esconde a informação em vez de mostrá-la.
  Repetir o mesmo (ator, aluno, recurso, ação) dentro de dez minutos não grava
  de novo; a trava por quádrupla impede que duas chamadas simultâneas passem
  as duas pela conferência.
*/
create or replace function public.registrar_leitura(
  p_aluno_id text,
  p_recurso_tipo text,
  p_escopo text
)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  ator text := public.usuario_atual();
  v_acao "AcaoAuditoria";
  origem record;
begin
  if ator is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or ator = p_aluno_id then
    return;
  end if;
  if p_recurso_tipo not in (
    'ALERTA_CLINICO', 'ANAMNESE', 'CONDICAO_SAUDE', 'EXAME', 'PRESCRICAO',
    'AVALIACAO_FISICA', 'CALORIMETRIA', 'CHECKIN', 'FOTO_EVOLUCAO', 'MEDIDA',
    'META', 'PROGRESSO', 'COMPARATIVO', 'PLANO_DIETA', 'CARDIO',
    'EXECUCAO_TREINO', 'PLANO_TREINO'
  ) then
    raise exception 'Recurso de auditoria desconhecido: %', p_recurso_tipo using errcode = '22023';
  end if;
  if p_escopo not in ('TREINO', 'NUTRICAO', 'CLINICO', 'EVOLUCAO') then
    raise exception 'Escopo desconhecido: %', p_escopo using errcode = '22023';
  end if;
  -- Aluno que não existe não ganha linha: a chave estrangeira recusaria, e o
  -- erro diria ao chamador que o id não existe.
  if not exists (select 1 from public."User" u where u.id = p_aluno_id and u.papel = 'ALUNO') then
    return;
  end if;

  v_acao := case when public.pode_ler_do_aluno(p_aluno_id, p_escopo) then 'LER' else 'NEGADO' end;

  perform pg_advisory_xact_lock(
    hashtextextended('registrar_leitura:' || ator || ':' || p_aluno_id || ':' || p_recurso_tipo || ':' || v_acao, 0)
  );
  if exists (
    select 1 from public."LogAuditoria" l
     where l."atorId" = ator
       and l."alunoId" = p_aluno_id
       and l."recursoTipo" = p_recurso_tipo
       and l.acao = v_acao
       and l."criadoEm" > (now() at time zone 'UTC') - interval '10 minutes'
  ) then
    return;
  end if;

  select * into origem from public.origem_do_pedido();
  insert into public."LogAuditoria"
    (id, "atorId", acao, "recursoTipo", "alunoId", escopo, ip, "userAgent", metadata)
  values (
    gen_random_uuid()::text, ator, v_acao, p_recurso_tipo, p_aluno_id,
    p_escopo::"EscopoDado", origem.ip, origem.agente,
    jsonb_build_object('origem', 'leitura')
  );
end;
$funcao$;

revoke execute on function public.registrar_leitura(text, text, text) from public, anon;
grant execute on function public.registrar_leitura(text, text, text) to authenticated;
