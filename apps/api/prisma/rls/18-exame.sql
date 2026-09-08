-- Exame: a classificação é do banco, não de quem lança.
--
-- ## Por que isto não pode ficar no cliente
--
-- A classificação de um resultado — OTIMO, ATENCAO, CRITICO — é o que dispara
-- o alerta clínico. Se ela viesse pronta do app, um cliente adulterado
-- gravaria "OTIMO" numa glicemia de 300 e o aviso nunca nasceria: o médico
-- veria o número, e o personal não receberia conduta nenhuma.
--
-- Enquanto havia API, era ela que calculava. Sem API, o cálculo desce para
-- onde o cliente não alcança. O que ele manda é ignorado e reescrito.
--
-- A regra é a mesma de `classificarMarcador`, em `@vivio/contracts`, ao pé da
-- letra: nada vira CRITICO pela faixa funcional — só sair da faixa do
-- LABORATÓRIO carimba vermelho. A funcional só distingue ATENCAO de OTIMO
-- dentro do que o laudo já considera normal.
--
-- As faixas não estão escritas aqui: vêm da tabela `FaixaMarcador`, alimentada
-- de `REFERENCIAS` pelo `exportar-regras.ts`. Escrever vinte marcadores à mão
-- dentro do SQL é exatamente como as regras de alerta divergiram da fonte.

create or replace function public.classificar_marcador(
  p_marcador text,
  p_valor numeric,
  p_sexo text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $funcao$
declare
  f record;
begin
  select * into f from public."FaixaMarcador"
  where marcador = p_marcador and sexo = p_sexo;

  /*
    Marcador sem faixa cadastrada vira ATENCAO, e não OTIMO.

    É o lado seguro de errar: um resultado que ninguém sabe ler merece um
    olhar, não um carimbo de normal. Só acontece se o exportador ficar para
    trás do TypeScript.
  */
  if f.marcador is null then
    return 'ATENCAO';
  end if;

  -- Fora da faixa do laboratório: vermelho.
  if (f."labMin" is not null and p_valor < f."labMin")
     or (f."labMax" is not null and p_valor > f."labMax") then
    return 'CRITICO';
  end if;

  -- Dentro da funcional: ótimo. Fora dela, mas dentro do laudo: atenção.
  if (f."funcMin" is null or p_valor >= f."funcMin")
     and (f."funcMax" is null or p_valor <= f."funcMax") then
    return 'OTIMO';
  end if;

  return 'ATENCAO';
end;
$funcao$;

/*
  Quem lança só pode lançar o que pode ver.

  Sem isto o nutricionista digitaria um TSH e o receberia de volta filtrado —
  dado gravado que o próprio autor não pode reler é pior que a recusa. Era uma
  checagem no serviço; passa a ser do banco pelo mesmo motivo da classificação.
*/
create or replace function public.governar_resultado()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_sexo text;
  eu_papel text := public.papel_atual();
begin
  select e.sexo into v_sexo from public."Exame" e where e.id = new."exameId";
  if v_sexo is null then
    raise exception 'Resultado sem exame.' using errcode = '23503';
  end if;

  -- Sem sessão é o operador com a chave de serviço, que já ignora política.
  if eu_papel is not null and not public.pode_ver_marcador(eu_papel, new.marcador) then
    raise exception 'Este marcador exige avaliação médica: %', new.marcador
      using errcode = '42501';
  end if;

  -- O que o cliente mandou em `classificacao` é ignorado, sempre.
  -- Sem cast de enum: a coluna e `text`. O Prisma so gera tipo enum no Postgres
  -- quando o campo e enum no schema, e este e String.
  new.classificacao := public.classificar_marcador(new.marcador, new.valor, v_sexo);
  return new;
end;
$funcao$;

drop trigger if exists governar_resultado on public."ResultadoMarcador";
create trigger governar_resultado
  before insert on public."ResultadoMarcador"
  for each row execute function public.governar_resultado();

/*
  O resultado escreve junto do exame, e é a política do EXAME que decide.

  `ResultadoMarcador` não tem `alunoId` — ele existe pelo exame. A política de
  INSERT confere que o exame alcançado é um que a pessoa poderia ter criado.
*/
drop policy if exists resultadomarcador_escreve on public."ResultadoMarcador";
create policy resultadomarcador_escreve on public."ResultadoMarcador" for insert
  with check (
    exists (
      select 1 from public."Exame" e
      where e.id = "exameId"
        and public.pode_escrever_do_aluno(e."alunoId", 'CLINICO', array['NUTRICIONISTA', 'MEDICO'])
    )
  );

grant select, insert on public."ResultadoMarcador" to authenticated;
grant execute on function public.classificar_marcador(text, numeric, text) to authenticated;
/*
  Um resultado lançado não se edita nem se apaga: ele é o que o laudo dizia, e
  o alerta que nasceu dele aponta para trás. Errou? Lança outro exame.
*/
revoke update, delete on public."ResultadoMarcador" from authenticated, anon;

-- A tabela de faixas é leitura para todo mundo autenticado: a tela mostra a
-- faixa ao lado do valor, e é isso que separa "fora do laudo" de "fora do
-- ideal". Escrever nela é curadoria, e passa pelo painel do banco.
alter table public."FaixaMarcador" enable row level security;
alter table public."FaixaMarcador" force row level security;
drop policy if exists faixamarcador_le on public."FaixaMarcador";
create policy faixamarcador_le on public."FaixaMarcador" for select using (
  public.usuario_atual() is not null
);

alter table public."MarcadorEscopo" enable row level security;
alter table public."MarcadorEscopo" force row level security;
drop policy if exists marcadorescopo_le on public."MarcadorEscopo";
create policy marcadorescopo_le on public."MarcadorEscopo" for select using (
  public.usuario_atual() is not null
);
