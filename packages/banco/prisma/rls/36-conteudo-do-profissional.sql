-- O conteúdo que o profissional monta para reusar.
--
-- Receita, refeição salva, modelo de anamnese, modelo de prescrição e item
-- prescritível. Cinco tabelas com a mesma forma: é do autor, tem filhos, apaga
-- por carimbo, e o cliente não escolhe quem é o dono.
--
-- A leitura já estava no banco. O que faltava era escrever — e, nos filhos, nem
-- a permissão existia: dava para criar a receita e não dava para pôr
-- ingrediente nela.

/*
  O gatilho comum das cinco, e por que é um só.

  Escrever oito gatilhos quase iguais é o tipo de duplicação que apodrece: um
  dia alguém corrige o congelamento do dono num deles e não nos outros sete, e
  a diferença só aparece quando alguém a explora. A regra é a mesma em todas,
  então mora num lugar só, e o nome da coluna de dono vem como argumento.

  O caminho por `jsonb` existe porque plpgsql não deixa escrever `new.<coluna>`
  com o nome vindo de variável. `jsonb_populate_record` devolve o registro com
  os tipos de volta — `numeric` atravessa exato (jsonb guarda numérico sem
  virar ponto flutuante), e `text[]` e enums também.

  O que ele garante:

  - INSERT: o dono é quem está pedindo. Mandar `autorId` de outra pessoa não
    cria conteúdo no nome dela.
  - UPDATE: dono, `criadoEm` e o carimbo de remoção não voltam atrás. Conteúdo
    removido que ressuscita é um item reaparecendo na biblioteca de quem já o
    tinha tirado de lá.
  - Sempre: `atualizadoEm`. É `@updatedAt` do Prisma — NOT NULL, sem default no
    banco, e quem o preenchia era o cliente Prisma. Pelo PostgREST não há quem
    o preencha, e o INSERT morreria em violação de nulo na primeira gravação de
    verdade.

  Sem sessão é a chave de serviço (semente, importadores): não mexe em dono
  nenhum, só carimba a hora.
*/
create or replace function public.governar_conteudo()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  coluna text := tg_argv[0];
  novo jsonb := to_jsonb(new);
  antigo jsonb;
begin
  if eu is not null then
    if tg_op = 'INSERT' then
      novo := jsonb_set(novo, array[coluna], to_jsonb(eu));
    else
      antigo := to_jsonb(old);
      novo := jsonb_set(novo, array[coluna], antigo -> coluna);
      novo := jsonb_set(novo, '{criadoEm}', antigo -> 'criadoEm');
      if (antigo ->> 'deletadoEm') is not null then
        novo := jsonb_set(novo, '{deletadoEm}', antigo -> 'deletadoEm');
      end if;
    end if;
  end if;

  novo := jsonb_set(novo, '{atualizadoEm}', to_jsonb(now()));
  return jsonb_populate_record(new, novo);
end;
$funcao$;

/*
  Quem prescreve o quê — a competência profissional, no banco.

  Não é escolha de produto. No Brasil a prescrição de medicamento é privativa do
  médico (CRM); o nutricionista prescreve suplemento e fitoterápico dentro da
  área dele (CFN). Permitir o contrário seria facilitar exercício ilegal da
  profissão, e a tabela que diz isso vivia só em `@vivio/contracts` — do lado do
  cliente, onde um `insert` pelo console do navegador passa por cima.

  A mesma tabela, nos dois lugares. Se um dia divergirem, quem vale é esta: é a
  que responde a quem escreve no banco, e a outra só decide que botão aparece.
*/
create or replace function public.pode_prescrever(p_papel text, p_tipo text)
returns boolean
language sql
immutable
as $funcao$
  select case p_tipo
    when 'MEDICAMENTO' then p_papel = 'MEDICO'
    when 'SUPLEMENTO' then p_papel in ('MEDICO', 'NUTRICIONISTA')
    when 'FITOTERAPICO' then p_papel in ('MEDICO', 'NUTRICIONISTA')
    when 'ORIENTACAO' then p_papel in ('MEDICO', 'NUTRICIONISTA')
    else false
  end;
$funcao$;

revoke execute on function public.pode_prescrever(text, text) from public, anon;
grant execute on function public.pode_prescrever(text, text) to authenticated;

/*
  O `id` era sorteado pelo Prisma, em JavaScript, e vinha dentro do INSERT.
  Pelo PostgREST não há quem o sorteie — e são nove tabelas, contando os filhos.
*/
do $$
declare t text;
begin
  foreach t in array array[
    'Receita', 'IngredienteReceita',
    'RefeicaoSalva', 'ItemRefeicaoSalva',
    'ModeloAnamnese', 'PerguntaAnamnese',
    'ModeloPrescricao', 'ItemModeloPrescricao',
    'ItemPrescritivel'
  ] loop
    execute format(
      'alter table public.%I alter column id set default gen_random_uuid()::text', t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- Receita
-- --------------------------------------------------------------------------
drop trigger if exists governar_receita on public."Receita";
create trigger governar_receita
  before insert or update on public."Receita"
  for each row execute function public.governar_conteudo('autorId');

/*
  Ingrediente: a regra é a da receita.

  Não há política própria de dono aqui, e não precisa haver — o ingrediente só
  existe dentro de uma receita, e quem pode mexer nela pode mexer nele. O que a
  política faz é amarrar os dois: ingrediente apontando para receita alheia é
  recusado, que é como um cliente adulterado tentaria editar a receita de outro
  profissional sem tocar na linha dela.
*/
drop policy if exists ingredientereceita_escreve on public."IngredienteReceita";
create policy ingredientereceita_escreve on public."IngredienteReceita" for all
  using (
    exists (
      select 1 from public."Receita" r
      where r.id = "IngredienteReceita"."receitaId"
        and r."autorId" = public.usuario_atual()
        and r."deletadoEm" is null
    )
  )
  with check (
    exists (
      select 1 from public."Receita" r
      where r.id = "IngredienteReceita"."receitaId"
        and r."autorId" = public.usuario_atual()
        and r."deletadoEm" is null
    )
  );

/*
  Aqui o DELETE é de verdade, e é o certo: salvar a receita reescreve a lista
  de ingredientes inteira (apaga e recria), e carimbar cada ingrediente
  removido encheria a tabela de linhas que ninguém lê. O que não se apaga é a
  RECEITA, porque refeições salvas apontam para ela.
*/
grant select, insert, update, delete on public."IngredienteReceita" to authenticated;

-- --------------------------------------------------------------------------
-- Refeição salva
-- --------------------------------------------------------------------------
drop policy if exists refeicaosalva_escreve on public."RefeicaoSalva";
create policy refeicaosalva_escreve on public."RefeicaoSalva" for insert
  with check ("autorId" = public.usuario_atual());

drop policy if exists refeicaosalva_altera on public."RefeicaoSalva";
create policy refeicaosalva_altera on public."RefeicaoSalva" for update
  using ("autorId" = public.usuario_atual())
  with check ("autorId" = public.usuario_atual());

drop trigger if exists governar_refeicao_salva on public."RefeicaoSalva";
create trigger governar_refeicao_salva
  before insert or update on public."RefeicaoSalva"
  for each row execute function public.governar_conteudo('autorId');

grant select, insert, update on public."RefeicaoSalva" to authenticated;

/*
  O item traz a segunda amarra: a receita citada tem de ser DELE.

  A API conferia isso (`exigirItens`), e não é detalhe — sem a conferência,
  qualquer profissional poria a receita de outro dentro de uma refeição própria
  e leria a composição inteira pela consulta que traz os itens.
*/
drop policy if exists itemrefeicaosalva_escreve on public."ItemRefeicaoSalva";
create policy itemrefeicaosalva_escreve on public."ItemRefeicaoSalva" for all
  using (
    exists (
      select 1 from public."RefeicaoSalva" r
      where r.id = "ItemRefeicaoSalva"."refeicaoId"
        and r."autorId" = public.usuario_atual()
        and r."deletadoEm" is null
    )
  )
  with check (
    exists (
      select 1 from public."RefeicaoSalva" r
      where r.id = "ItemRefeicaoSalva"."refeicaoId"
        and r."autorId" = public.usuario_atual()
        and r."deletadoEm" is null
    )
    and (
      "receitaId" is null
      or exists (
        select 1 from public."Receita" rc
        where rc.id = "ItemRefeicaoSalva"."receitaId"
          and rc."autorId" = public.usuario_atual()
          and rc."deletadoEm" is null
      )
    )
  );

grant select, insert, update, delete on public."ItemRefeicaoSalva" to authenticated;

-- --------------------------------------------------------------------------
-- Modelo de anamnese
-- --------------------------------------------------------------------------
drop policy if exists modeloanamnese_escreve on public."ModeloAnamnese";
create policy modeloanamnese_escreve on public."ModeloAnamnese" for insert
  with check ("profissionalId" = public.usuario_atual());

drop policy if exists modeloanamnese_altera on public."ModeloAnamnese";
create policy modeloanamnese_altera on public."ModeloAnamnese" for update
  using ("profissionalId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual());

drop trigger if exists governar_modelo_anamnese on public."ModeloAnamnese";
create trigger governar_modelo_anamnese
  before insert or update on public."ModeloAnamnese"
  for each row execute function public.governar_conteudo('profissionalId');

grant select, insert, update on public."ModeloAnamnese" to authenticated;

drop policy if exists perguntaanamnese_escreve on public."PerguntaAnamnese";
create policy perguntaanamnese_escreve on public."PerguntaAnamnese" for all
  using (
    exists (
      select 1 from public."ModeloAnamnese" m
      where m.id = "PerguntaAnamnese"."modeloId"
        and m."profissionalId" = public.usuario_atual()
        and m."deletadoEm" is null
    )
  )
  with check (
    exists (
      select 1 from public."ModeloAnamnese" m
      where m.id = "PerguntaAnamnese"."modeloId"
        and m."profissionalId" = public.usuario_atual()
        and m."deletadoEm" is null
    )
  );

grant select, insert, update, delete on public."PerguntaAnamnese" to authenticated;

/*
  A leitura da pergunta estava sem política nenhuma — e sem ela o modelo vinha
  com a lista vazia, que na tela é um formulário sem perguntas.

  Quem lê: o dono do modelo, e quem responde uma anamnese montada a partir
  dele. A segunda metade importa tanto quanto a primeira — sem ela o aluno
  abriria a anamnese e não veria o que responder.
*/
alter table public."PerguntaAnamnese" enable row level security;
alter table public."PerguntaAnamnese" force row level security;
drop policy if exists perguntaanamnese_le on public."PerguntaAnamnese";
create policy perguntaanamnese_le on public."PerguntaAnamnese" for select using (
  exists (
    select 1 from public."ModeloAnamnese" m
    where m.id = "PerguntaAnamnese"."modeloId"
      and m."profissionalId" = public.usuario_atual()
  )
  or exists (
    select 1 from public."Anamnese" a
    where a."modeloId" = "PerguntaAnamnese"."modeloId"
      and (a."alunoId" = public.usuario_atual() or a."profissionalId" = public.usuario_atual())
  )
);

-- --------------------------------------------------------------------------
-- Modelo de prescrição
-- --------------------------------------------------------------------------
drop policy if exists modeloprescricao_escreve on public."ModeloPrescricao";
create policy modeloprescricao_escreve on public."ModeloPrescricao" for insert
  with check ("prescritorId" = public.usuario_atual());

drop policy if exists modeloprescricao_altera on public."ModeloPrescricao";
create policy modeloprescricao_altera on public."ModeloPrescricao" for update
  using ("prescritorId" = public.usuario_atual())
  with check ("prescritorId" = public.usuario_atual());

drop trigger if exists governar_modelo_prescricao on public."ModeloPrescricao";
create trigger governar_modelo_prescricao
  before insert or update on public."ModeloPrescricao"
  for each row execute function public.governar_conteudo('prescritorId');

grant select, insert, update on public."ModeloPrescricao" to authenticated;

drop policy if exists itemmodeloprescricao_escreve on public."ItemModeloPrescricao";
create policy itemmodeloprescricao_escreve on public."ItemModeloPrescricao" for all
  using (
    exists (
      select 1 from public."ModeloPrescricao" m
      where m.id = "ItemModeloPrescricao"."modeloId"
        and m."prescritorId" = public.usuario_atual()
        and m."deletadoEm" is null
    )
  )
  with check (
    exists (
      select 1 from public."ModeloPrescricao" m
      where m.id = "ItemModeloPrescricao"."modeloId"
        and m."prescritorId" = public.usuario_atual()
        and m."deletadoEm" is null
    )
    /*
      O item prescritível citado tem de ser um que ele alcança: o catálogo
      GLOBAL ou a lista dele. Sem isso, o modelo apontaria para o medicamento
      cadastrado por outro prescritor e a consulta o traria junto.
    */
    and exists (
      select 1 from public."ItemPrescritivel" p
      where p.id = "ItemModeloPrescricao"."prescritivelId"
        and p."deletadoEm" is null
        and (p.escopo = 'GLOBAL' or p."criadoPorId" = public.usuario_atual())
        /*
          E a competência de novo: o catálogo global tem medicamento, e um
          modelo é uma prescrição pronta esperando um nome. Sem esta linha, o
          nutricionista montaria o modelo com medicamento e o emitiria depois.
        */
        and public.pode_prescrever(public.papel_atual(), p.tipo::text)
    )
  );

grant select, insert, update, delete on public."ItemModeloPrescricao" to authenticated;

-- --------------------------------------------------------------------------
-- Item prescritível
-- --------------------------------------------------------------------------
/*
  Mesma forma do exercício: o catálogo é GLOBAL e do admin, a lista de cada
  prescritor é PRIVADA. Quem decide o escopo é o papel no token, não o corpo do
  pedido — um `insert` com `escopo: 'GLOBAL'` entraria no catálogo de todos os
  prescritores do app, e num catálogo de medicamento isso é conduta clínica.
*/
create or replace function public.governar_prescritivel()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  new."atualizadoEm" := now();
  if eu is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new."criadoPorId" := eu;
    new.escopo := case when public.papel_atual() = 'ADMIN'
                       then 'GLOBAL'::"EscopoPrescritivel"
                       else 'PRIVADO'::"EscopoPrescritivel" end;
  else
    new."criadoPorId" := old."criadoPorId";
    new.escopo := old.escopo;
    new."criadoEm" := old."criadoEm";
    if old."deletadoEm" is not null then
      new."deletadoEm" := old."deletadoEm";
    end if;
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_prescritivel on public."ItemPrescritivel";
create trigger governar_prescritivel
  before insert or update on public."ItemPrescritivel"
  for each row execute function public.governar_prescritivel();

/*
  Só quem prescreve cadastra, e só o que ele prescreve. O personal não receita
  nada, e o nutricionista não cadastra medicamento — a lista de prescritíveis é
  o que alimenta a receita, e deixar a porta aberta aqui seria deixar a conduta
  clínica entrar pela lateral.

  O ADMIN cura o catálogo global e não prescreve a ninguém, por isso ele passa
  por fora da competência.
*/
drop policy if exists itemprescritivel_escreve on public."ItemPrescritivel";
create policy itemprescritivel_escreve on public."ItemPrescritivel" for insert
  with check (
    "criadoPorId" = public.usuario_atual()
    and (
      public.papel_atual() = 'ADMIN'
      or public.pode_prescrever(public.papel_atual(), tipo::text)
    )
  );

drop policy if exists itemprescritivel_altera on public."ItemPrescritivel";
create policy itemprescritivel_altera on public."ItemPrescritivel" for update
  using (
    ("criadoPorId" = public.usuario_atual() and escopo = 'PRIVADO')
    or (escopo = 'GLOBAL' and public.papel_atual() = 'ADMIN')
  )
  with check (
    ("criadoPorId" = public.usuario_atual() and escopo = 'PRIVADO')
    or (escopo = 'GLOBAL' and public.papel_atual() = 'ADMIN')
  );

/*
  Remover é carimbo: o item aparece em prescrições já emitidas, e apagar a linha
  deixaria a receita do aluno com um medicamento sem nome.
*/
grant select, insert, update on public."ItemPrescritivel" to authenticated;
