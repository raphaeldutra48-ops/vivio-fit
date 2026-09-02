-- O alerta clínico nasce no banco.
--
-- ## Por que isto é o coração da migração
--
-- É o cruzamento que justifica o app ter médico dentro: o médico lança um
-- exame, uma regra deriva orientação, e o **personal recebe a conduta sem ver
-- o marcador**. Nenhum dos concorrentes faz isso.
--
-- Enquanto havia API, quem derivava era ela. Sem API, o alerta precisava ou
-- virar responsabilidade do cliente — o que seria péssimo, porque um cliente
-- que não roda deixa o alerta de nascer — ou nascer no banco, junto do dado
-- que o origina. É o segundo.
--
-- Gatilho e não função chamada pelo app, pela mesma razão: alerta que depende
-- de alguém lembrar de chamar é alerta que um dia não chega. Aqui ele é
-- consequência de gravar o resultado, e não há caminho que escape.
--
-- ## O que este arquivo aprendeu convivendo com a API
--
-- A primeira versão gravava a severidade da REGRA e ignorava `lado`. As duas
-- coisas estavam erradas, e só apareceram quando a API parou de derivar em
-- paralelo:
--
--   * a severidade vem da CLASSIFICAÇÃO do resultado, não da regra — o mesmo
--     achado pesa diferente vindo ATENCAO ou CRITICO;
--   * sem `lado`, a regra de "ferritina baixa" disparava também com ferritina
--     alta, porque as duas são "fora da faixa" e só o limite as separa.

create or replace function public.derivar_alertas_do_marcador()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_aluno_id text;
  v_sexo text;
  v_regra record;
  v_limite numeric;
  v_severidade text;
begin
  -- De qual aluno é este resultado, e de que sexo: a faixa funcional de vários
  -- marcadores é diferente para homem e mulher.
  select e."alunoId", e.sexo into v_aluno_id, v_sexo
  from public."Exame" e where e.id = new."exameId";

  if v_aluno_id is null then
    return new;
  end if;

  -- A mesma conta que `severidadeDe` fazia no TypeScript.
  v_severidade := case when new.classificacao = 'CRITICO' then 'ALTA' else 'MEDIA' end;

  for v_regra in
    select * from public."RegraDeAlerta" r
    where r.ativa
      and r.origem = 'MARCADOR'
      and r.marcador = new.marcador
      -- A classificação do resultado tem de estar entre as que disparam.
      and new.classificacao = any(r.quando)
  loop
    /*
      `lado` separa "baixo demais" de "alto demais" no mesmo marcador.

      O limite vem da regra, por sexo, com `*` quando a faixa é única. Regra
      com `lado` e sem limite para este sexo não dispara: é melhor não avisar
      do que avisar o contrário do que o exame diz.
    */
    if v_regra.lado is not null then
      v_limite := coalesce(
        (v_regra.limites ->> v_sexo)::numeric,
        (v_regra.limites ->> '*')::numeric
      );
      continue when v_limite is null;
      continue when v_regra.lado = 'ABAIXO' and new.valor >= v_limite;
      continue when v_regra.lado = 'ACIMA' and new.valor <= v_limite;
    end if;

    /*
      `on conflict do nothing` sustenta a deduplicação que a tabela já
      declarava: reprocessar o mesmo exame não enche a tela do profissional com
      o mesmo aviso. A chave é (aluno, papel, regra, exame).
    */
    insert into public."AlertaClinico" (
      id, "alunoId", "papelDestino", severidade, regra, titulo, orientacao,
      "marcadorOrigem", "exameId", "criadoEm"
    ) values (
      -- Determinístico de propósito: o mesmo achado gera sempre o mesmo id, e
      -- o conflito abaixo tem o que reconhecer.
      encode(sha256((v_aluno_id || v_regra.id || new."exameId")::bytea), 'hex'),
      v_aluno_id, v_regra."papelDestino", v_severidade,
      /*
        Só a parte antes dos dois-pontos.

        O id da regra é `slug:PAPEL` porque uma regra do TypeScript se abre em
        várias linhas — uma por destino — e cada linha precisa de id próprio.
        Mas a coluna `regra` do alerta guarda o SLUG desde sempre, e é ela que
        entra na unique (aluno, papel, regra, exame).

        Gravar o id inteiro aqui fez alerta nascer em dobro por um dia: o
        gatilho escrevia `ferro-baixo:NUTRICIONISTA`, a API escrevia
        `ferro-baixo`, a unique não reconhecia os dois como o mesmo aviso, e a
        tela do nutricionista mostrava a mesma orientação duas vezes.
      */
      split_part(v_regra.id, ':', 1),
      v_regra.titulo, v_regra.orientacao, new.marcador, new."exameId", now()
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$funcao$;

drop trigger if exists derivar_alertas on public."ResultadoMarcador";
create trigger derivar_alertas
  after insert on public."ResultadoMarcador"
  for each row execute function public.derivar_alertas_do_marcador();

/*
  Condição de saúde → alerta para quem precisa saber.

  O personal precisa de movimento e padrão, não de diagnóstico: "evite
  movimento acima da cabeça" para ombro, "não indique suplemento sem conferir a
  composição" para alergia. O texto vem da regra; a parte que só existe na hora
  — o que o profissional escreveu sobre o caso — entra no lugar de
  `{descricao}`.

  Dar alta não apaga o alerta: quem faz isso é o gatilho de resolução, abaixo.
*/
create or replace function public.derivar_alertas_da_condicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_regra record;
begin
  for v_regra in
    select * from public."RegraDeAlerta" r
    where r.ativa
      and r.origem = 'CONDICAO'
      and r."tipoCondicao" = new.tipo
      /*
        Região só filtra quando a REGRA tem uma.

        A versão anterior saía cedo quando a condição vinha sem região, e com
        isso alergia alimentar, gestação, medicação contínua, restrição e
        doença crônica nunca geraram alerta nenhum — nenhuma delas tem região.
        Lesão e cirurgia têm, e para essas o casamento continua exato.
      */
      and (r.regiao is null or r.regiao = new.regiao)
  loop
    insert into public."AlertaClinico" (
      id, "alunoId", "papelDestino", severidade, regra, titulo, orientacao,
      "condicaoId", "criadoEm"
    ) values (
      encode(sha256((new."alunoId" || v_regra.id || new.id)::bytea), 'hex'),
      new."alunoId", v_regra."papelDestino",
      -- A severidade vem da gravidade da condição, não da regra: a mesma lesão
      -- de joelho pesa diferente se for leve ou incapacitante.
      case new.gravidade
        when 'GRAVE' then 'ALTA'
        when 'MODERADA' then 'MEDIA'
        else 'BAIXA'
      end,
      -- Mesma razão do exame: a coluna guarda o slug.
      split_part(v_regra.id, ':', 1),
      v_regra.titulo,
      replace(v_regra.orientacao, '{descricao}', coalesce(new.descricao, '')),
      new.id, now()
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$funcao$;

drop trigger if exists derivar_alertas_condicao on public."CondicaoSaude";
create trigger derivar_alertas_condicao
  after insert on public."CondicaoSaude"
  for each row execute function public.derivar_alertas_da_condicao();

/*
  Alta na condição tira o aviso da frente.

  Apagar, e não marcar como reconhecido: o alerta existia porque a condição
  valia. Deixá-lo pendente faria o personal continuar evitando agachamento por
  uma lesão que já teve alta.

  Era um método do serviço, chamado logo depois de resolver. Vira gatilho pela
  mesma razão de todo o resto: assim não existe caminho que resolva a condição
  e esqueça o alerta.
*/
create or replace function public.limpar_alertas_da_condicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if old."resolvidaEm" is null and new."resolvidaEm" is not null then
    delete from public."AlertaClinico" where "condicaoId" = new.id;
  end if;
  return new;
end;
$funcao$;

drop trigger if exists limpar_alertas_condicao on public."CondicaoSaude";
create trigger limpar_alertas_condicao
  after update of "resolvidaEm" on public."CondicaoSaude"
  for each row execute function public.limpar_alertas_da_condicao();

-- --------------------------------------------------------------------------
-- A tabela de regras é leitura para todos e escrita para ninguém pelo app.
--
-- Todo profissional precisa ler para a tela explicar de onde veio o alerta.
-- Editar regra clínica é ato de curadoria, não de uso do app: passa pelo
-- painel do banco, com quem responde por isso.
-- --------------------------------------------------------------------------
alter table public."RegraDeAlerta" enable row level security;
alter table public."RegraDeAlerta" force row level security;
drop policy if exists regradealerta_le on public."RegraDeAlerta";
create policy regradealerta_le on public."RegraDeAlerta" for select using (
  public.usuario_atual() is not null
);
