-- O alerta clínico passa a nascer no banco.
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

create or replace function public.derivar_alertas_do_marcador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno_id text;
  v_regra record;
begin
  -- De qual aluno é este resultado. Vem pelo exame, que é o dono.
  select e."alunoId" into v_aluno_id
  from public."Exame" e where e.id = new."exameId";

  if v_aluno_id is null then
    return new;
  end if;

  for v_regra in
    select * from public."RegraDeAlerta" r
    where r.ativa
      and r.origem = 'MARCADOR'
      and r.marcador = new.marcador
      -- A classificação do resultado tem de estar entre as que disparam.
      and new.classificacao = any(r.quando)
  loop
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
      v_aluno_id, v_regra."papelDestino", v_regra.severidade, v_regra.id,
      v_regra.titulo, v_regra.orientacao, new.marcador, new."exameId", now()
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists derivar_alertas on public."ResultadoMarcador";
create trigger derivar_alertas
  after insert on public."ResultadoMarcador"
  for each row execute function public.derivar_alertas_do_marcador();

/*
  Condição de saúde → alerta para o personal.

  Aqui o texto vem do mapa de cuidado por região, porque é o que muda: "evite
  movimento acima da cabeça" para ombro, "evite carga axial" para lombar. O
  personal precisa de movimento e padrão, não de diagnóstico.

  Só condição ATIVA gera alerta — e dar alta não apaga o alerta antigo, que é
  histórico. Quem some da tela é decidido pela leitura, não por delete.
*/
create or replace function public.derivar_alertas_da_condicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regra record;
begin
  if new.regiao is null then
    return new;
  end if;

  for v_regra in
    select * from public."RegraDeAlerta" r
    where r.ativa
      and r.origem = 'CONDICAO'
      and r."tipoCondicao" = new.tipo
      and r.regiao = new.regiao
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
      v_regra.id, v_regra.titulo, v_regra.orientacao, new.id, now()
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists derivar_alertas_condicao on public."CondicaoSaude";
create trigger derivar_alertas_condicao
  after insert on public."CondicaoSaude"
  for each row execute function public.derivar_alertas_da_condicao();

-- --------------------------------------------------------------------------
-- A tabela de regras é leitura para todos e escrita para ninguém pela API.
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
