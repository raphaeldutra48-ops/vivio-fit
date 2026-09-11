-- Os arquivos no Supabase Storage, com as mesmas regras das linhas.
--
-- Hoje o arquivo passa pela API: ela confere quem pede e devolve um link
-- assinado. Sem API, quem confere é o próprio Storage — e a regra tem de ser a
-- mesma, escrita aqui.
--
-- ## Os endereços não mudam
--
-- A chave guardada no banco é `evolucao/<aluno>/<arquivo>.jpg`. O primeiro
-- pedaço vira o COMPARTIMENTO e o resto vira o caminho dentro dele. Por isso
-- cada compartimento tem o nome de uma pasta de hoje: nenhuma linha do banco
-- precisa ser reescrita, e o dia da virada não tem migração de dados.
--
-- ## Um compartimento por tipo, e não um só
--
-- O limite de tamanho e a lista de formatos são propriedade do compartimento,
-- não da pasta. Laudo de exame e vídeo de treino no mesmo balde significaria um
-- limite só para os dois — e o limite existe para impedir que alguém suba um
-- exame de imagem inteiro onde cabia um PDF.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  /*
    O catálogo é o único PÚBLICO, e é uma decisão, não descuido: são
    demonstrações genéricas de exercício, iguais para todo mundo, já
    creditadas na tela (CC-BY). Link assinado aqui só acrescentaria latência a
    cada uma das ~50 figuras de uma página de biblioteca, e expiraria no meio
    de uma aba aberta.
  */
  ('catalogo', 'catalogo', true, 52428800,
   array['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm']),

  -- Foto de evolução: o dado mais íntimo do app.
  ('evolucao', 'evolucao', false, 15728640,
   array['image/jpeg','image/png','image/webp','image/heic']),

  -- Vídeo do exercício e demonstração gravada pelo profissional.
  ('exercicios', 'exercicios', false, 104857600,
   array['video/mp4','video/quicktime','video/webm']),

  -- Biblioteca do profissional: PDF, planilha, vídeo de apoio.
  ('materiais', 'materiais', false, 209715200,
   array['application/pdf','image/jpeg','image/png','image/webp','video/mp4','audio/mpeg',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/csv']),

  -- Laudo laboratorial: o arquivo mais restrito do app.
  ('exames', 'exames', false, 26214400,
   array['application/pdf','image/jpeg','image/png','image/webp','image/heic']),

  ('avatares', 'avatares', false, 5242880,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  O dono do arquivo é a primeira pasta do caminho.

  `exercicios/<userId>/<aleatorio>.mp4` — quem escreve só escreve dentro da
  própria pasta, e é isso que substitui a chave sorteada no servidor: antes o
  cliente não escolhia onde gravava porque não gerava a chave; agora ele gera,
  mas não alcança a pasta de outra pessoa.
*/
create or replace function public.dono_do_arquivo(p_name text)
returns text
language sql
immutable
as $funcao$
  select (string_to_array(p_name, '/'))[1]
$funcao$;

/*
  A chave como está gravada no banco: compartimento + caminho.

  O Storage guarda os dois separados; as colunas do banco (`chaveArquivo`,
  `videoChave`, `chave`) guardam juntos. É essa a junta entre os dois mundos.
*/
create or replace function public.chave_de_midia(p_bucket text, p_name text)
returns text
language sql
immutable
as $funcao$
  select p_bucket || '/' || p_name
$funcao$;

/*
  Duas pessoas do mesmo cuidado — em qualquer das duas direções.

  `tem_vinculo` responde "sou profissional deste aluno?". Para a foto de
  perfil a pergunta é simétrica: o aluno também vê a foto de quem o acompanha.
*/
create or replace function public.somos_do_mesmo_cuidado(p_outro text)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select exists (
    select 1 from public."Vinculo" v
    where v.status = 'ATIVO'
      and (
        (v."alunoId" = p_outro and v."profissionalId" = public.usuario_atual())
        or (v."profissionalId" = p_outro and v."alunoId" = public.usuario_atual())
      )
  )
$funcao$;

revoke execute on function public.somos_do_mesmo_cuidado(text) from anon;
grant execute on function public.somos_do_mesmo_cuidado(text) to authenticated;

/*
  ## O que a revogação NÃO desfaz — medido, não suposto

  Revogar o consentimento fecha o acesso na hora para: qualquer arquivo que a
  pessoa ainda não tenha aberto, qualquer sessão nova, e todo mundo mais. O que
  continua funcionando por um tempo é o par SESSÃO + ARQUIVO já baixado: o
  Storage guarda a resposta por token, e `cacheControl: 0` no envio não muda
  isso (testado).

  A janela é a do token, 15 minutos. E não é regressão: o link assinado que a
  API entregava também sobrevivia à revogação, por 5 minutos. Revogar nunca
  apagou o que já está na mão de alguém — nem aqui, nem antes.
*/

-- --------------------------------------------------------------------------
-- Escrita: cada um na sua pasta
-- --------------------------------------------------------------------------
/*
  Vale para todos os compartimentos privados, e é a regra que impede o abuso
  mais óbvio: gravar um arquivo dentro da pasta de outra pessoa para que ela
  apareça como dona dele.
*/
drop policy if exists midia_escreve on storage.objects;
create policy midia_escreve on storage.objects for insert
  with check (
    bucket_id in ('evolucao', 'exercicios', 'materiais', 'exames', 'avatares')
    and public.dono_do_arquivo(name) = public.usuario_atual()
  );

drop policy if exists midia_altera on storage.objects;
create policy midia_altera on storage.objects for update
  using (
    bucket_id in ('evolucao', 'exercicios', 'materiais', 'exames', 'avatares')
    and public.dono_do_arquivo(name) = public.usuario_atual()
  )
  with check (public.dono_do_arquivo(name) = public.usuario_atual());

/*
  Apagar é do dono, e só dele — inclusive do laudo: trocar o arquivo do exame
  remove o anterior, senão cada correção deixa um laudo órfão no armazenamento.
*/
drop policy if exists midia_apaga on storage.objects;
create policy midia_apaga on storage.objects for delete
  using (
    bucket_id in ('evolucao', 'exercicios', 'materiais', 'exames', 'avatares')
    and public.dono_do_arquivo(name) = public.usuario_atual()
  );

-- --------------------------------------------------------------------------
-- Leitura: uma regra por compartimento, igual à da linha que aponta para ele
-- --------------------------------------------------------------------------
/*
  Foto de evolução: o titular sempre; o profissional só com vínculo ativo E
  consentimento de EVOLUCAO — a mesma função que `FotoEvolucao` usa.
*/
drop policy if exists evolucao_le on storage.objects;
create policy evolucao_le on storage.objects for select
  using (
    bucket_id = 'evolucao'
    and (
      public.dono_do_arquivo(name) = public.usuario_atual()
      or public.pode_ler_do_aluno(public.dono_do_arquivo(name), 'EVOLUCAO')
    )
  );

/*
  Vídeo de exercício. Três caminhos, e todos passam pela linha que aponta para
  o arquivo — quem gravou, o exercício que o usa, ou a demonstração entregue a
  um aluno. Sem isso, bastaria adivinhar o caminho para assistir à gravação de
  qualquer profissional.
*/
drop policy if exists exercicios_le on storage.objects;
create policy exercicios_le on storage.objects for select
  using (
    bucket_id = 'exercicios'
    and (
      public.dono_do_arquivo(name) = public.usuario_atual()
      or exists (
        select 1 from public."Exercicio" e
        where e."videoChave" = public.chave_de_midia(bucket_id, name)
          and (e.escopo = 'GLOBAL' or e."criadoPorId" = public.usuario_atual())
      )
      or exists (
        select 1
        from public."DemonstracaoProfissional" d
        join public."Vinculo" v on v."profissionalId" = d."profissionalId"
        where d."videoChave" = public.chave_de_midia(bucket_id, name)
          and v."alunoId" = public.usuario_atual()
          and v.status = 'ATIVO'
      )
    )
  );

/*
  Material: o autor e quem recebeu. Descompartilhar tira o acesso ao arquivo no
  mesmo ato — é a linha de `MaterialCompartilhado` que manda, como na tela.
*/
drop policy if exists materiais_le on storage.objects;
create policy materiais_le on storage.objects for select
  using (
    bucket_id = 'materiais'
    and (
      public.dono_do_arquivo(name) = public.usuario_atual()
      or exists (
        select 1
        from public."Material" m
        join public."MaterialCompartilhado" mc on mc."materialId" = m.id
        where m.chave = public.chave_de_midia(bucket_id, name)
          and mc."alunoId" = public.usuario_atual()
          and m."deletadoEm" is null
      )
    )
  );

/*
  Laudo: só o aluno e o MÉDICO que o acompanha.

  O nutricionista e o personal leem os marcadores do exame e nunca o arquivo —
  é a regra mais restrita do app, e aqui ela não depende de quem subiu: depende
  da linha do exame. Um médico que perdeu o vínculo perde o laudo junto.
*/
/*
  A regra do laudo mora numa função, e o motivo é a própria proteção do laudo.

  `Exame` não tem permissão de SELECT na tabela: tem em colunas escolhidas a
  dedo, e `chaveArquivo` ficou de fora justamente para o endereço do arquivo
  não sair para quem lê o exame. Uma política que consultasse a coluna direto
  falharia com "permission denied for table Exame" — e não só ao abrir um
  laudo: o Postgres avalia TODAS as políticas de leitura de `storage.objects`,
  então o erro aparecia ao baixar uma foto de evolução. Foi assim que
  apareceu.

  `security definer` consulta sem depender da permissão de coluna, e devolve
  só sim ou não.
*/
create or replace function public.posso_ler_laudo(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select exists (
    select 1 from public."Exame" e
    where e."chaveArquivo" = p_chave
      and (
        e."alunoId" = public.usuario_atual()
        or (
          public.papel_atual() = 'MEDICO'
          and public.pode_ler_do_aluno(e."alunoId", 'CLINICO')
        )
      )
  )
$funcao$;

revoke execute on function public.posso_ler_laudo(text) from anon;
grant execute on function public.posso_ler_laudo(text) to authenticated;

drop policy if exists exames_le on storage.objects;
create policy exames_le on storage.objects for select
  using (
    bucket_id = 'exames'
    and public.posso_ler_laudo(public.chave_de_midia(bucket_id, name))
  );

/*
  Foto de perfil: quem é do mesmo cuidado. O profissional vê a do aluno na
  lista, e o aluno vê a de quem o acompanha no chat.
*/
drop policy if exists avatares_le on storage.objects;
create policy avatares_le on storage.objects for select
  using (
    bucket_id = 'avatares'
    and (
      public.dono_do_arquivo(name) = public.usuario_atual()
      or public.somos_do_mesmo_cuidado(public.dono_do_arquivo(name))
    )
  );

/*
  O catálogo é público na leitura e fechado na escrita: não há política de
  INSERT para ele, e sem política ninguém entra. Quem grava ali é a ferramenta
  de importação, com a chave de serviço.
*/

-- --------------------------------------------------------------------------
-- O que o Supabase abre de nascença, e aqui não serve
-- --------------------------------------------------------------------------
/*
  Mesma herança do `grant all` das tabelas: `storage.objects` vem com tudo
  liberado para `anon` e `authenticated`, e `storage.buckets` também. RLS
  segura a linha, mas `truncate` esvazia a tabela inteira por cima de qualquer
  política, e criar compartimento não é coisa de quem usa o app.
*/
revoke truncate, references, trigger on storage.objects from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on storage.buckets from anon, authenticated;
revoke all on storage.objects from anon;
