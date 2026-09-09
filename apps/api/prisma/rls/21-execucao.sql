-- Treino realizado: o envio da fila offline.
--
-- ## Por que função
--
-- Este é o caminho mais quente do app: o aluno aperta "concluir" com o celular
-- na mão, no meio da academia, muitas vezes com rede ruim — e o envio pode
-- chegar duas vezes, porque a fila local reenvia o que não teve resposta.
--
-- Três coisas não cabem numa política:
--
--   * **idempotência por `clienteUuid`.** Reenviar não pode criar um segundo
--     treino. E não pode ser erro: erro faria o app manter o item na fila para
--     sempre. Tem de devolver o que já está gravado, dizendo que já estava.
--   * **execução, séries e feedback nascem juntos.** Metade de um treino
--     gravado é pior que nenhum: o volume da sessão sai errado e o recorde
--     nasce de dado incompleto.
--   * **o exercício da série é congelado a partir do item do plano.** Ele é a
--     chave estável do histórico — cada versão nova do plano cria itens novos,
--     e o gráfico de carga se perderia a cada ajuste do personal. Se viesse do
--     cliente, um envio adulterado contaminaria o histórico de um exercício
--     com séries de outro.
--
-- A conta do que se MOSTRA — coluna ANTERIOR, sugestão de carga, medalha de
-- recorde — não está aqui: mora em `@vivio/contracts`, sobre dados que quem
-- pergunta já pode ler. Aqui fica só o que precisa ser indiscutível.

-- --------------------------------------------------------------------------
-- Gravar treino é só pela função.
-- --------------------------------------------------------------------------
drop policy if exists execucao_escreve on public."ExecucaoTreino";
drop policy if exists serie_escreve on public."SerieExecutada";
drop policy if exists feedback_escreve on public."FeedbackTreino";
revoke insert, update, delete on public."ExecucaoTreino" from authenticated, anon;
revoke insert, update, delete on public."SerieExecutada" from authenticated, anon;
revoke insert, update, delete on public."FeedbackTreino" from authenticated, anon;
grant select on public."ExecucaoTreino" to authenticated;
grant select on public."SerieExecutada" to authenticated;
grant select on public."FeedbackTreino" to authenticated;

create or replace function public.registrar_execucao(p_aluno_id text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  v_uuid text := p_dados->>'clienteUuid';
  v_sessao_id text := p_dados->>'sessaoId';
  v_dono_da_sessao text;
  ja record;
  v_id text := gen_random_uuid()::text;
  v_inicio timestamp;
  v_fim timestamp;
  v_fora text[];
  v_fb jsonb := p_dados->'feedback';
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  /*
    Sem lista de papel, como a política que havia aqui: quem treina é o aluno e
    é ele quem grava, mas o personal também registra quando acompanha o treino
    presencial. O que barra é o consentimento de TREINO.
  */
  if not public.pode_escrever_do_aluno(p_aluno_id, 'TREINO', array[]::text[]) then
    raise exception 'Sem permissão para gravar treino deste aluno.' using errcode = '42501';
  end if;

  /*
    Já chegou antes? Devolve o que está gravado.

    É o que permite o celular reenviar a fila sem medo — e é exatamente o caso
    que duplicaria treino se fosse tratado como erro.
  */
  select id, "alunoId" into ja from public."ExecucaoTreino" where "clienteUuid" = v_uuid;
  if ja.id is not null then
    if ja."alunoId" <> p_aluno_id then
      raise exception 'Execução de outro aluno.' using errcode = '23505';
    end if;
    return jsonb_build_object('id', ja.id, 'jaRegistrada', true);
  end if;

  select p."alunoId" into v_dono_da_sessao
  from public."SessaoTreino" s
  join public."PlanoTreino" p on p.id = s."planoId"
  where s.id = v_sessao_id;
  if v_dono_da_sessao is null or v_dono_da_sessao <> p_aluno_id then
    raise exception 'Sessão de treino não encontrado.' using errcode = 'P0002';
  end if;

  /*
    Série tem de pertencer à sessão executada. Sem isto, o histórico de carga
    de um exercício poderia ser contaminado por outro plano.
  */
  select array_agg(distinct x.item) into v_fora
  from (
    select se->>'itemTreinoId' as item from jsonb_array_elements(p_dados->'series') se
  ) x
  where not exists (
    select 1 from public."ItemTreino" i where i.id = x.item and i."sessaoId" = v_sessao_id
  );
  if v_fora is not null then
    raise exception 'Há séries que não pertencem a esta sessão.' using errcode = '23505';
  end if;

  -- As colunas são `timestamp` sem fuso, e o que chega é ISO com `Z`: sem o
  -- `at time zone 'UTC'` o instante entraria deslocado pelo fuso do servidor.
  v_inicio := (p_dados->>'iniciadoEm')::timestamptz at time zone 'UTC';
  v_fim := nullif(p_dados->>'finalizadoEm', '')::timestamptz at time zone 'UTC';

  begin
    insert into public."ExecucaoTreino" (
      id, "alunoId", "sessaoId", "clienteUuid", "iniciadoEm", "finalizadoEm", "duracaoSeg"
    ) values (
      v_id, p_aluno_id, v_sessao_id, v_uuid, v_inicio, v_fim,
      case when v_fim is null then null
           else greatest(0, round(extract(epoch from (v_fim - v_inicio))))::int end
    );

    /*
      `exercicioId` sai do ITEM, e não do que o cliente mandou. É o campo
      desnormalizado que sustenta "anterior" e progressão de carga.
    */
    insert into public."SerieExecutada" (
      id, "execucaoId", "itemTreinoId", "exercicioId", "serieNum", "repsFeitas",
      "cargaKg", tipo, rpe
    )
    select gen_random_uuid()::text, v_id, i.id, i."exercicioId",
           (se->>'serieNum')::int, (se->>'repsFeitas')::int, (se->>'cargaKg')::numeric,
           coalesce(nullif(se->>'tipo', ''), 'NORMAL')::"TipoSerie",
           nullif(se->>'rpe', '')::int
    from jsonb_array_elements(p_dados->'series') se
    join public."ItemTreino" i on i.id = se->>'itemTreinoId';

    if v_fb is not null and jsonb_typeof(v_fb) = 'object' then
      insert into public."FeedbackTreino" (
        id, "execucaoId", dificuldade, "teveDor", "localDor", sensacao, comentario,
        "dorTipo", "dorMomento", "dorExercicioId"
      ) values (
        gen_random_uuid()::text, v_id, (v_fb->>'dificuldade')::int,
        coalesce((v_fb->>'teveDor')::boolean, false),
        nullif(v_fb->>'localDor', ''), nullif(v_fb->>'sensacao', ''),
        nullif(v_fb->>'comentario', ''), nullif(v_fb->>'dorTipo', ''),
        nullif(v_fb->>'dorMomento', ''), nullif(v_fb->>'dorExercicioId', '')
      );
    end if;
  exception when unique_violation then
    /*
      Corrida: dois envios do mesmo uuid ao mesmo tempo. O segundo lê o do
      primeiro em vez de falhar — do lado do aparelho os dois são a mesma
      tentativa, e um erro aqui deixaria o treino preso na fila.
    */
    select id into ja from public."ExecucaoTreino" where "clienteUuid" = v_uuid;
    if ja.id is null then raise; end if;
    return jsonb_build_object('id', ja.id, 'jaRegistrada', true);
  end;

  return jsonb_build_object('id', v_id, 'jaRegistrada', false);
end;
$funcao$;

grant execute on function public.registrar_execucao(text, jsonb) to authenticated;
revoke execute on function public.registrar_execucao(text, jsonb) from anon;
