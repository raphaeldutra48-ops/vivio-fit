-- Exercício e demonstração: a escrita que estava na API.
--
-- A leitura já estava no banco desde o arquivo 05. O que faltava era o outro
-- lado: criar exercício próprio, corrigir, remover, e gravar a demonstração do
-- profissional. Tudo isso morava em `exercicios.service.ts`, que decidia o
-- escopo, conferia o dono da chave do arquivo e impedia o resto.

/*
  O que o cliente NÃO escolhe, num exercício.

  A API decidia o escopo: ADMIN cria GLOBAL, profissional cria PRIVADO. Sem
  ela, um `insert` com `escopo: 'GLOBAL'` entraria no catálogo de todo mundo —
  e o catálogo é a raiz do histórico de carga, indexado por exercício.

  A procedência da mídia (crédito, origem, player do acervo) também é nossa:
  quem a preenche são as ferramentas de importação, com a chave de serviço.
  Deixá-la aberta ao cliente seria deixar qualquer profissional atribuir o
  vídeo dele ao Prime, ou o contrário.
*/
create or replace function public.governar_exercicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  new."atualizadoEm" := now();

  -- Sem sessão é a chave de serviço (semente, importadores): não mexe.
  if eu is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new."criadoPorId" := eu;
    new.escopo := case when public.papel_atual() = 'ADMIN'
                       then 'GLOBAL'::"EscopoExercicio"
                       else 'PRIVADO'::"EscopoExercicio" end;
    new."imagemCredito" := null;
    new."imagemOrigemUrl" := null;
    new."videoCredito" := null;
    new."videoOrigemUrl" := null;
    new."videoExternoUrl" := null;
    new."imagemChave" := null;
  else
    new."criadoPorId" := old."criadoPorId";
    new.escopo := old.escopo;
    new."criadoEm" := old."criadoEm";
    new."imagemChave" := old."imagemChave";
    new."imagemCredito" := old."imagemCredito";
    new."imagemOrigemUrl" := old."imagemOrigemUrl";
    new."videoCredito" := old."videoCredito";
    new."videoOrigemUrl" := old."videoOrigemUrl";
    new."videoExternoUrl" := old."videoExternoUrl";
    -- Removido não volta: `deletadoEm` só anda para frente.
    if old."deletadoEm" is not null then
      new."deletadoEm" := old."deletadoEm";
    end if;
  end if;

  /*
    O vídeo vinculado tem de ser um arquivo DELE. A API conferia o prefixo da
    chave antes de gravar; sem essa conferência, bastaria apontar a chave de
    outra pessoa para publicá-la no próprio exercício.
  */
  if new."videoChave" is not null
     and new."videoChave" is distinct from coalesce(old."videoChave", '')
     and new."videoChave" not like 'exercicios/' || eu || '/%' then
    raise exception 'Chave de arquivo não pertence a você.' using errcode = '42501';
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_exercicio on public."Exercicio";
create trigger governar_exercicio
  before insert or update on public."Exercicio"
  for each row execute function public.governar_exercicio();

/*
  Remover é carimbo (`deletadoEm`), e por isso a permissão de DELETE continua
  revogada: o exercício aparece no histórico de treinos já executados, e apagar
  a linha levaria junto a carga que o aluno levantou.
*/
/*
  O admin cuida do acervo GLOBAL, e a regra anterior não deixava.

  A política do arquivo 07 dizia `criadoPorId = eu and escopo = 'PRIVADO'` —
  desenhada quando só existia a biblioteca do profissional. Com a edição saindo
  da API, ela virou a regra inteira, e corrigir o nome de um exercício do acervo
  passaria a ser impossível para todo mundo: os exercícios GLOBAIS vieram da
  semente e do importador, sem dono. A API deixava o admin editá-los
  (`exigirPropriedade`), e é isso que volta aqui.

  O escopo em si continua congelado pelo gatilho, então o `with check` não abre
  caminho para transformar um exercício privado em global.
*/
drop policy if exists exercicio_altera on public."Exercicio";
create policy exercicio_altera on public."Exercicio" for update
  using (
    ("criadoPorId" = public.usuario_atual() and escopo = 'PRIVADO')
    or (escopo = 'GLOBAL' and public.papel_atual() = 'ADMIN')
  )
  with check (
    ("criadoPorId" = public.usuario_atual() and escopo = 'PRIVADO')
    or (escopo = 'GLOBAL' and public.papel_atual() = 'ADMIN')
  );

grant select, insert, update on public."Exercicio" to authenticated;

-- --------------------------------------------------------------------------
-- A demonstração gravada pelo profissional
-- --------------------------------------------------------------------------
/*
  Vale para o exercício GLOBAL também, e é esse o ponto: o personal grava o
  supino da academia dele sem criar um "supino do Diego", que quebraria o
  histórico de carga do aluno.

  Três condições, as mesmas que a API exigia: é profissional, o arquivo é dele,
  e o exercício é um que ele alcança.
*/
drop policy if exists demonstracao_escreve on public."DemonstracaoProfissional";
create policy demonstracao_escreve on public."DemonstracaoProfissional" for insert
  with check (
    "profissionalId" = public.usuario_atual()
    and public.papel_atual() in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO', 'ADMIN')
    and "videoChave" like 'exercicios/' || public.usuario_atual() || '/%'
    and exists (
      select 1 from public."Exercicio" e
      where e.id = "DemonstracaoProfissional"."exercicioId"
        and e."deletadoEm" is null
        and (e.escopo = 'GLOBAL' or e."criadoPorId" = public.usuario_atual())
    )
  );

/*
  Regravar substitui a linha que já existe (é `upsert` por profissional +
  exercício), então o UPDATE precisa da mesma regra do INSERT.
*/
drop policy if exists demonstracao_altera on public."DemonstracaoProfissional";
create policy demonstracao_altera on public."DemonstracaoProfissional" for update
  using ("profissionalId" = public.usuario_atual())
  with check (
    "profissionalId" = public.usuario_atual()
    and "videoChave" like 'exercicios/' || public.usuario_atual() || '/%'
  );

drop policy if exists demonstracao_apaga on public."DemonstracaoProfissional";
create policy demonstracao_apaga on public."DemonstracaoProfissional" for delete
  using ("profissionalId" = public.usuario_atual());

/*
  `atualizadoEm` é `@updatedAt` do Prisma: NOT NULL e sem default no banco.
  Pelo PostgREST não há quem o preencha, e a regravação seria recusada por
  violação de nulo.
*/
/*
  O `id` era gerado pelo Prisma, que saiu de cena.

  `@default(cuid())` é do CLIENTE, não do banco: o Prisma sorteia o cuid em
  JavaScript e manda no INSERT. Pelo PostgREST não há quem o sorteie, e a
  regravação da demonstração morria em "null value in column id" — um erro que
  aparece só na primeira gravação de verdade, depois de a tela dizer que ia
  salvar.

  O default fica no banco, onde vale para todo mundo que escrever daqui em
  diante. Formato diferente dos cuid antigos, e isso não importa: id é opaco,
  ninguém o interpreta, e as linhas antigas continuam as mesmas.
*/
alter table public."DemonstracaoProfissional"
  alter column id set default gen_random_uuid()::text;

create or replace function public.governar_demonstracao()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."atualizadoEm" := now();
  if tg_op = 'UPDATE' then
    -- Trocar o dono ou o exercício de uma gravação existente não é correção,
    -- é outra gravação.
    new."profissionalId" := old."profissionalId";
    new."exercicioId" := old."exercicioId";
    new."criadoEm" := old."criadoEm";
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_demonstracao on public."DemonstracaoProfissional";
create trigger governar_demonstracao
  before insert or update on public."DemonstracaoProfissional"
  for each row execute function public.governar_demonstracao();

grant select, insert, update, delete on public."DemonstracaoProfissional" to authenticated;

-- --------------------------------------------------------------------------
-- A fila de gravação
-- --------------------------------------------------------------------------
/*
  Quantas vezes o profissional prescreveu cada exercício.

  É a ordem da fila de gravação: o que ele mais receita é o que mais aluno
  executa sem ninguém olhando, e é onde a falta de referência visual vira risco
  de lesão.

  Existe como função porque pelo PostgREST a alternativa era trazer todos os
  itens de todos os planos dele para contar no celular — e um profissional com
  cem alunos tem milhares de linhas ali.

  `security definer` para atravessar as políticas de `SessaoTreino` e
  `PlanoTreino` com uma consulta só, mas o recorte não afrouxa nada: o `where`
  é `personalId = usuario_atual()`, então cada um conta os próprios planos. Sem
  sessão não há o que contar, e a função devolve vazio em vez do acervo inteiro.
*/
create or replace function public.prescricoes_por_exercicio()
returns table ("exercicioId" text, vezes bigint)
language sql
security definer
set search_path = public
stable
as $funcao$
  select it."exercicioId", count(*)::bigint as vezes
  from public."ItemTreino" it
  join public."SessaoTreino" s on s.id = it."sessaoId"
  join public."PlanoTreino" p on p.id = s."planoId"
  where public.usuario_atual() is not null
    and p."personalId" = public.usuario_atual()
  group by it."exercicioId";
$funcao$;

revoke all on function public.prescricoes_por_exercicio() from public, anon;
grant execute on function public.prescricoes_por_exercicio() to authenticated;
