-- Anexar o laudo ao exame.
--
-- Quem pode anexar já está decidido por `exame_altera` (arquivo 07): médico ou
-- nutricionista com vínculo e consentimento de CLINICO. O que faltava é o que
-- a API conferia por fora da política — que a chave seja de um arquivo que ESTA
-- pessoa acabou de enviar.
--
-- Sem essa conferência, quem pode anexar apontaria o exame para o laudo de
-- outra pessoa e o leria pelo link: `posso_ler_laudo` autoriza olhando a LINHA
-- do exame, não a origem do arquivo. Um médico que atende a Ana passaria a ler
-- o laudo do Bruno só por apontar o exame dela para o arquivo dele.

/*
  Anexa o laudo e devolve a chave do arquivo ANTERIOR — quando ela é de quem
  está chamando.

  É função, e não um `update` direto do cliente, por causa da devolução. A
  coluna `chaveArquivo` não é legível por ninguém (arquivo 13: personal e
  nutricionista nunca alcançam o laudo, e a chave crua não sai do banco), então
  o cliente não tem como descobrir qual arquivo ficou para trás para apagá-lo.
  Trocar o laudo sem apagar o antigo deixa até 25 MB ocupados para sempre a
  cada correção.

  A devolução é limitada ao que a pessoa já podia ter: `exames/<eu>/…`. Laudo
  anexado por OUTRO profissional não volta como chave — ele vira órfão, e órfão
  invisível é melhor que chave de arquivo clínico circulando.

  `security definer` para poder ler a chave antiga e gravar a nova; o recorte
  não afrouxa nada, porque a primeira coisa que ela faz é repetir a pergunta da
  política com `pode_escrever_do_aluno`.
*/
create or replace function public.anexar_laudo(
  p_exame_id text,
  p_chave text,
  p_mime text
)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  v_aluno text;
  v_anterior text;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  select e."alunoId", e."chaveArquivo" into v_aluno, v_anterior
    from public."Exame" e
   where e.id = p_exame_id and e."deletadoEm" is null;

  if v_aluno is null then
    raise exception 'Exame não encontrado.' using errcode = 'P0002';
  end if;

  -- A mesma pergunta da política `exame_altera`, e não uma versão dela.
  if not public.pode_escrever_do_aluno(v_aluno, 'CLINICO', array['NUTRICIONISTA', 'MEDICO']) then
    raise exception 'Você não tem acesso a este conteúdo.' using errcode = '42501';
  end if;

  if p_chave not like 'exames/' || eu || '/%' then
    raise exception 'Chave de arquivo não pertence a você.' using errcode = '42501';
  end if;

  update public."Exame"
     set "chaveArquivo" = p_chave, "mimeType" = p_mime
   where id = p_exame_id;

  if v_anterior is null
     or v_anterior = p_chave
     or v_anterior not like 'exames/' || eu || '/%' then
    return null;
  end if;
  return v_anterior;
end;
$funcao$;

revoke execute on function public.anexar_laudo(text, text, text) from public, anon;
grant execute on function public.anexar_laudo(text, text, text) to authenticated;

/*
  A chave do laudo, para quem pode abri-lo.

  A coluna é invisível para todo mundo (arquivo 13), e por bom motivo: o
  nutricionista lê os marcadores do exame e nunca o arquivo. Mas o médico e o
  próprio aluno PRECISAM abri-lo, e abrir depende de assinar uma URL — que
  depende de saber a chave.

  Enquanto a API existia, era ela quem sabia. Sem ela, `arquivoUrl` passou a
  voltar nulo sempre, e a tela do médico dizia "existe um laudo anexado,
  acessível apenas ao médico da equipe" para o médico da equipe.

  Devolve `null` em vez de erro quando não pode: a tela já trata "sem arquivo
  para abrir", e distinguir "não existe" de "existe e não é para você" contaria
  ao nutricionista que há um laudo ali.

  A pergunta é a mesma de `posso_ler_laudo`, que a política do compartimento
  usa — as duas respondem igual porque leem a mesma linha.
*/
create or replace function public.chave_do_laudo(p_exame_id text)
returns text
language sql
stable
security definer
set search_path = public
as $funcao$
  select e."chaveArquivo"
    from public."Exame" e
   where e.id = p_exame_id
     and e."deletadoEm" is null
     and e."chaveArquivo" is not null
     and public.posso_ler_laudo(e."chaveArquivo");
$funcao$;

revoke execute on function public.chave_do_laudo(text) from public, anon;
grant execute on function public.chave_do_laudo(text) to authenticated;

/*
  Quem enviou o arquivo alcança o arquivo — e sem isso não consegue nem apagá-lo.

  A política do arquivo 32 parava em `posso_ler_laudo`, que decide pela LINHA do
  exame. Ficava sem resposta o arquivo que ainda não tem linha: o laudo recém
  enviado, entre o envio e o `anexar_laudo`, e o laudo substituído, que deixa de
  ser apontado no instante em que o novo entra.

  E o efeito escondia-se atrás de um sucesso: o Storage SELECIONA os objetos
  antes de apagá-los, então apagar sem poder ler não dá erro — responde 200 com
  lista vazia, e o arquivo fica. Trocar o laudo deixava até 25 MB de dado
  clínico órfão a cada correção, sem nada no log.

  Não é afrouxamento: quem enviou o arquivo já teve os bytes na mão. É a mesma
  primeira condição que `evolucao_le`, `exercicios_le`, `materiais_le` e
  `avatares_le` sempre tiveram — o `exames_le` era o único sem ela.
*/
drop policy if exists exames_le on storage.objects;
create policy exames_le on storage.objects for select
  using (
    bucket_id = 'exames'
    and (
      public.dono_do_arquivo(name) = public.usuario_atual()
      or public.posso_ler_laudo(public.chave_de_midia(bucket_id, name))
    )
  );
