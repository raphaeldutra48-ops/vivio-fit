-- Meta do aluno: duas divergências entre a API e a política, e o que congela.
--
-- ## O escopo estava errado aqui, não lá
--
-- O controlador declara `@ExigeConsentimento(EscopoDado.EVOLUCAO)` desde que a
-- meta existe — ela fala de peso, cintura, carga e frequência, os mesmos dados
-- do painel de evolução. As políticas foram escritas pedindo TREINO.
--
-- Enquanto tudo passava pela API isso não aparecia: ela barrava antes. Com o
-- SDK falando direto com o Postgres, a meta de um aluno que autorizou treino e
-- **não** autorizou evolução passaria a ser legível. É consentimento a menos
-- do que o titular deu — o tipo de diferença que não quebra nada e muda o
-- significado de tudo.
--
-- ## Quem escreve
--
-- "As metas são definidas pelo profissional", diz o controlador, e ele recusa
-- o ALUNO em criar, concluir, reabrir e remover. A política aceitava qualquer
-- um com vínculo e consentimento — o aluno criaria as próprias metas, e a meta
-- viraria lista de desejos: o profissional deixaria de saber o que combinou.
--
-- ## O que não se reescreve depois
--
-- `valorInicial` é a régua do progresso: sem ele, "faltam 3 kg" não diz se a
-- pessoa andou 10% ou 90% do caminho. Quem o calcula é o cliente, porque a
-- aferição de carga precisa da regra de série de trabalho que já existe testada
-- em `@vivio/contracts` — e reescrevê-la em SQL é como as regras de alerta
-- divergiram da fonte. O que o banco garante é que ele não muda depois:
-- reescrever a régua no meio do caminho faria a barra andar sozinha.

drop policy if exists meta_le on public."Meta";
create policy meta_le on public."Meta" for select using (
  public.pode_ler_do_aluno("alunoId", 'EVOLUCAO')
);

drop policy if exists meta_escreve on public."Meta";
create policy meta_escreve on public."Meta" for insert
  with check (
    public.pode_escrever_do_aluno(
      "alunoId", 'EVOLUCAO', array['PERSONAL', 'NUTRICIONISTA', 'MEDICO']
    )
  );

drop policy if exists meta_altera on public."Meta";
create policy meta_altera on public."Meta" for update
  using (
    public.pode_escrever_do_aluno(
      "alunoId", 'EVOLUCAO', array['PERSONAL', 'NUTRICIONISTA', 'MEDICO']
    )
  )
  with check (
    public.pode_escrever_do_aluno(
      "alunoId", 'EVOLUCAO', array['PERSONAL', 'NUTRICIONISTA', 'MEDICO']
    )
  );

create or replace function public.governar_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  /*
    `atualizadoEm` é NOT NULL e não tem `default`: o `@updatedAt` do Prisma
    é do Prisma, e some quando quem escreve é o PostgREST. Carimbar aqui
    resolve para os dois lados de uma vez — e a coluna passa a dizer a
    verdade sobre quando a linha mudou, em vez de repetir o que o cliente
    mandou.
  */
  new."atualizadoEm" := now();

  if tg_op = 'INSERT' then
    -- Quem criou é quem está pedindo, não quem o corpo do pedido disser.
    new."criadoPorId" := coalesce(public.usuario_atual(), new."criadoPorId");
    return new;
  end if;

  -- A régua, o dono, o tipo e o alvo são do momento em que a meta foi
  -- combinada. Mudá-los depois é trocar a combinação e manter o histórico
  -- dizendo que ela sempre foi assim.
  new."alunoId" := old."alunoId";
  new."criadoPorId" := old."criadoPorId";
  new.tipo := old.tipo;
  new.alvo := old.alvo;
  new."exercicioId" := old."exercicioId";
  new."valorInicial" := old."valorInicial";
  new."criadoEm" := old."criadoEm";

  -- Meta removida não volta: ela pode estar citada num relatório já enviado.
  if old."deletadoEm" is not null then
    new."deletadoEm" := old."deletadoEm";
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_meta on public."Meta";
create trigger governar_meta
  before insert or update on public."Meta"
  for each row execute function public.governar_meta();

grant select, insert, update on public."Meta" to authenticated;
/*
  Apagar de verdade não: a meta pode estar citada num relatório já enviado, e o
  caminho de remover é carimbar `deletadoEm`.
*/
revoke delete on public."Meta" from authenticated, anon;
