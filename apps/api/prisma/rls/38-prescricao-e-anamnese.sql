-- Prescrição emitida e anamnese aplicada: o que chega ao aluno.
--
-- As duas são **registro clínico**, e é isso que decide a forma deste arquivo:
-- ambas se gravam em mais de um passo (a linha e os itens; a versão nova e a
-- anterior marcada), e um passo que falha no meio deixa um estado que não
-- deveria existir — prescrição sem item nenhum, ou uma conduta substituída sem
-- a sucessora. Por isso são FUNÇÕES, e não uma sequência de `insert` do
-- cliente: dentro da função, ou tudo entra ou nada entra.
--
-- O que elas guardam, e o cliente não escolhe:
--
-- - `nomeNoMomento` (e `perguntaNoMomento`, `tipoNoMomento`) vem do catálogo no
--   instante da emissão. Congelado ali, renomear o item depois não altera o que
--   foi prescrito — e o registro continua dizendo o que o paciente leu.
-- - A competência profissional, de novo: medicamento é privativo do médico. É a
--   terceira vez que ela aparece (catálogo, modelo, e aqui), e é aqui que ela
--   mais importa, porque é a receita que vai para a mão da pessoa.

do $$
declare t text;
begin
  foreach t in array array['Prescricao', 'ItemPrescricao', 'Anamnese', 'RespostaAnamnese'] loop
    execute format(
      'alter table public.%I alter column id set default gen_random_uuid()::text', t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- Prescrição
-- --------------------------------------------------------------------------
/*
  Grava os itens de uma prescrição, conferindo cada um.

  Separada porque emitir e substituir fazem exatamente isto, e a conferência
  não pode existir em duas versões — uma delas aceitaria o que a outra recusa.

  As três conferências, na ordem em que doem:

  1. O item existe e o prescritor o alcança (catálogo GLOBAL ou lista dele).
  2. Ele tem competência para aquele tipo.
  3. O nome gravado é o do catálogo, não o que veio no pedido.
*/
create or replace function public.gravar_itens_da_prescricao(
  p_prescricao_id text,
  p_itens jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  item jsonb;
  ordem int := 0;
  v_nome text;
  v_tipo text;
begin
  for item in select * from jsonb_array_elements(p_itens) loop
    select ip.nome, ip.tipo::text into v_nome, v_tipo
      from public."ItemPrescritivel" ip
     where ip.id = item->>'prescritivelId'
       and ip."deletadoEm" is null
       and (ip.escopo = 'GLOBAL' or ip."criadoPorId" = public.usuario_atual());

    if v_nome is null then
      raise exception 'Item prescritível não encontrado.' using errcode = 'P0002';
    end if;

    if public.papel_atual() <> 'ADMIN'
       and not public.pode_prescrever(public.papel_atual(), v_tipo) then
      raise exception 'Seu conselho não cobre a prescrição deste item.' using errcode = '42501';
    end if;

    insert into public."ItemPrescricao" (
      "prescricaoId", "prescritivelId", "nomeNoMomento", dose, unidade, frequencia,
      horarios, "duracaoDias", via, observacao, ordem
    ) values (
      p_prescricao_id,
      item->>'prescritivelId',
      v_nome,
      (item->>'dose')::numeric,
      item->>'unidade',
      item->>'frequencia',
      coalesce(
        (select array_agg(value) from jsonb_array_elements_text(item->'horarios')),
        array[]::text[]
      ),
      (item->>'duracaoDias')::int,
      item->>'via',
      item->>'observacao',
      ordem
    );
    ordem := ordem + 1;
  end loop;
end;
$funcao$;

create or replace function public.emitir_prescricao(
  p_aluno_id text,
  p_data date,
  p_valida_ate date,
  p_orientacoes text,
  p_itens jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  nova text;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  -- A mesma pergunta que a política `prescricao_escreve` faria.
  if not public.pode_escrever_do_aluno(p_aluno_id, 'CLINICO', array['NUTRICIONISTA', 'MEDICO']) then
    raise exception 'Você não tem acesso a este conteúdo.' using errcode = '42501';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Uma prescrição precisa de ao menos um item.' using errcode = '23514';
  end if;

  insert into public."Prescricao" ("alunoId", "prescritorId", data, "validaAte", orientacoes)
  values (p_aluno_id, eu, p_data, p_valida_ate, p_orientacoes)
  returning id into nova;

  perform public.gravar_itens_da_prescricao(nova, p_itens);
  return nova;
end;
$funcao$;

/*
  Mudar a conduta cria uma VERSÃO NOVA e marca a anterior como substituída.

  Prescrição é registro clínico: editar no lugar apagaria o que estava valendo
  quando o paciente tomou o que tomou. E as duas metades têm de acontecer
  juntas — a anterior marcada sem a nova é um paciente sem prescrição válida,
  do nada.

  Só quem emitiu substitui. Outro profissional que discorde emite a dele, em
  nome dele: a assinatura de uma receita não se transfere.
*/
create or replace function public.substituir_prescricao(
  p_prescricao_id text,
  p_data date,
  p_valida_ate date,
  p_orientacoes text,
  p_itens jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  anterior public."Prescricao";
  nova text;
begin
  select * into anterior from public."Prescricao" where id = p_prescricao_id;
  if anterior.id is null then
    raise exception 'Prescrição não encontrada.' using errcode = 'P0002';
  end if;
  if anterior."prescritorId" <> eu then
    raise exception 'Só quem emitiu a prescrição pode substituí-la. Emita uma nova em seu nome.'
      using errcode = '42501';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Uma prescrição precisa de ao menos um item.' using errcode = '23514';
  end if;

  update public."Prescricao" set status = 'SUBSTITUIDA' where id = p_prescricao_id;

  insert into public."Prescricao" (
    "alunoId", "prescritorId", data, "validaAte", orientacoes, versao, "raizId"
  ) values (
    anterior."alunoId", eu, p_data, p_valida_ate, p_orientacoes,
    anterior.versao + 1,
    -- A raiz é sempre a PRIMEIRA da linhagem: encadear raiz na raiz faria a
    -- terceira versão apontar para a segunda, e o histórico se partiria em dois.
    coalesce(anterior."raizId", anterior.id)
  )
  returning id into nova;

  perform public.gravar_itens_da_prescricao(nova, p_itens);
  return nova;
end;
$funcao$;

/*
  Suspender e encerrar: do emissor, e nunca depois de substituída.

  Uma prescrição substituída já não vale — mexer no status dela reescreveria o
  que ficou registrado como a conduta daquele período.
*/
create or replace function public.mudar_status_da_prescricao(
  p_prescricao_id text,
  p_status text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  atual public."Prescricao";
begin
  select * into atual from public."Prescricao" where id = p_prescricao_id;
  if atual.id is null then
    raise exception 'Prescrição não encontrada.' using errcode = 'P0002';
  end if;
  if atual."prescritorId" <> eu then
    raise exception 'Só quem emitiu pode alterar o status.' using errcode = '42501';
  end if;
  if atual.status = 'SUBSTITUIDA' then
    raise exception 'Prescrição já substituída por uma versão mais nova.' using errcode = '23514';
  end if;

  update public."Prescricao"
     set status = p_status::"StatusPrescricao",
         "encerradaEm" = case when p_status = 'ENCERRADA' then now() else "encerradaEm" end,
         "motivoEncerramento" = case when p_status = 'ENCERRADA' then p_motivo else "motivoEncerramento" end
   where id = p_prescricao_id;
end;
$funcao$;

revoke execute on function public.gravar_itens_da_prescricao(text, jsonb) from public, anon, authenticated;
revoke execute on function public.emitir_prescricao(text, date, date, text, jsonb) from public, anon;
revoke execute on function public.substituir_prescricao(text, date, date, text, jsonb) from public, anon;
revoke execute on function public.mudar_status_da_prescricao(text, text, text) from public, anon;
grant execute on function public.emitir_prescricao(text, date, date, text, jsonb) to authenticated;
grant execute on function public.substituir_prescricao(text, date, date, text, jsonb) to authenticated;
grant execute on function public.mudar_status_da_prescricao(text, text, text) to authenticated;

/*
  A escrita direta continua fechada.

  O cliente não escreve em `Prescricao` nem em `ItemPrescricao` — só pelas
  funções acima, que é onde a conferência mora. `prescricao_escreve`, do arquivo
  07, ficaria sem permissão para exercer; some daqui para não fazer quem lê
  acreditar que ela decide alguma coisa.
*/
drop policy if exists prescricao_escreve on public."Prescricao";
revoke insert, update, delete on public."Prescricao" from authenticated, anon;
revoke insert, update, delete on public."ItemPrescricao" from authenticated, anon;

-- --------------------------------------------------------------------------
-- Anamnese aplicada
-- --------------------------------------------------------------------------
/*
  Aplica o questionário e congela as perguntas junto.

  `perguntaNoMomento` e `tipoNoMomento` são o que torna o modelo editável: a
  anamnese respondida em março continua legível depois de o profissional
  reescrever o modelo em junho. Sem o congelamento, editar o modelo reescreveria
  o passado — e é sobre esse passado que se decide conduta.

  A conferência de obrigatórias fica aqui também, e não só na tela: a frase diz
  QUAL pergunta falta, que é o que faz o formulário ser corrigível.
*/
create or replace function public.aplicar_anamnese(
  p_aluno_id text,
  p_modelo_id text,
  p_respondida_em timestamp,
  p_observacao text,
  p_respostas jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  v_modelo public."ModeloAnamnese";
  nova text;
  faltando text;
  pergunta record;
  resposta jsonb;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  select * into v_modelo from public."ModeloAnamnese"
   where id = p_modelo_id and "deletadoEm" is null and "profissionalId" = eu;
  if v_modelo.id is null then
    raise exception 'Modelo de anamnese não encontrado.' using errcode = 'P0002';
  end if;

  if not public.pode_escrever_do_aluno(
    p_aluno_id, 'CLINICO', array['PERSONAL', 'NUTRICIONISTA', 'MEDICO']
  ) then
    raise exception 'Você não tem acesso a este conteúdo.' using errcode = '42501';
  end if;

  /*
    Obrigatória sem resposta é erro do formulário, não do banco. Junta TODAS as
    que faltam numa frase só: devolver a primeira faria a pessoa corrigir uma,
    salvar, e descobrir a próxima.
  */
  select string_agg(p.texto, '; ' order by p.ordem) into faltando
    from public."PerguntaAnamnese" p
   where p."modeloId" = p_modelo_id
     and p.obrigatoria
     and not exists (
       select 1 from jsonb_array_elements(p_respostas) r
       where r->>'perguntaId' = p.id
         and case
               when p.tipo = 'ESCOLHA_MULTIPLA'
                 then jsonb_array_length(coalesce(r->'valores', '[]'::jsonb)) > 0
               else coalesce(btrim(r->>'valor'), '') <> ''
             end
     );
  if faltando is not null then
    raise exception 'Responda as perguntas obrigatórias: %', faltando using errcode = '23514';
  end if;

  insert into public."Anamnese" (
    "alunoId", "profissionalId", "modeloId", "nomeNoMomento", observacao, "respondidaEm",
    -- `@updatedAt` do Prisma: NOT NULL e sem default no banco. Quem o preenchia
    -- era o cliente Prisma, que saiu de cena.
    "atualizadoEm"
  ) values (
    p_aluno_id, eu, p_modelo_id, v_modelo.nome, p_observacao, p_respondida_em, now()
  )
  returning id into nova;

  /*
    Uma linha por PERGUNTA do modelo, e não por resposta enviada: a pergunta não
    respondida também fica registrada, em branco. É a diferença entre "não
    perguntamos" e "perguntamos e a pessoa não quis responder", e a segunda é
    informação clínica.
  */
  for pergunta in
    select * from public."PerguntaAnamnese" where "modeloId" = p_modelo_id order by ordem
  loop
    select r into resposta from jsonb_array_elements(p_respostas) r
     where r->>'perguntaId' = pergunta.id limit 1;

    insert into public."RespostaAnamnese" (
      "anamneseId", "perguntaId", "perguntaNoMomento", "tipoNoMomento", valor, valores, ordem
    ) values (
      nova,
      pergunta.id,
      pergunta.texto,
      pergunta.tipo,
      nullif(btrim(coalesce(resposta->>'valor', '')), ''),
      coalesce(
        (select array_agg(value) from jsonb_array_elements_text(coalesce(resposta->'valores', '[]'::jsonb))),
        array[]::text[]
      ),
      pergunta.ordem
    );
  end loop;

  return nova;
end;
$funcao$;

/*
  Remover a anamnese apaga de verdade, e só quem a aplicou.

  Diferente da prescrição: um questionário respondido por engano (modelo errado,
  aluno errado) é ruído no prontuário, não histórico. E é DELETE em cascata —
  as respostas vão junto, porque fora da anamnese elas não querem dizer nada.
*/
drop policy if exists anamnese_apaga on public."Anamnese";
create policy anamnese_apaga on public."Anamnese" for delete
  using ("profissionalId" = public.usuario_atual());

drop policy if exists anamnese_escreve on public."Anamnese";
revoke insert, update on public."Anamnese" from authenticated, anon;
grant delete on public."Anamnese" to authenticated;
revoke insert, update, delete on public."RespostaAnamnese" from authenticated, anon;

revoke execute on function
  public.aplicar_anamnese(text, text, timestamp, text, jsonb) from public, anon;
grant execute on function
  public.aplicar_anamnese(text, text, timestamp, text, jsonb) to authenticated;
