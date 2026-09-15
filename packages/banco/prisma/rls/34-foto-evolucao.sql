-- Foto de evolução: a terceira trava, que estava só no código da API.
--
-- Vínculo e consentimento de EVOLUCAO já estavam no banco. O que não estava é
-- a lista `visivelPara` — o aluno escolhe, FOTO A FOTO, quais profissionais
-- veem cada uma. Consentir com o escopo EVOLUCAO não é consentir com cada
-- foto, e a especificação sempre foi explícita nisso.
--
-- Quem aplicava essa regra era `fotos.service.ts`, filtrando em JavaScript
-- depois de trazer TODAS as fotos do aluno do banco. Com a API saindo, a
-- consulta passa a ser do cliente, e o filtro em JavaScript deixa de existir:
-- sem este arquivo, qualquer profissional com consentimento de EVOLUCAO lê a
-- linha de toda foto do aluno — inclusive as que ele nunca compartilhou — e,
-- com a chave do arquivo em mãos, o arquivo junto.

/*
  A pergunta, num lugar só.

  `security definer` porque a política do Storage precisa fazer a mesma
  pergunta, e lá não há como olhar a tabela de fotos: `storage.objects` é de
  outro esquema, e quem consulta é a sessão de quem pede — que não alcança a
  foto de outra pessoa justamente por causa desta regra. A função quebra o
  círculo.

  Vale reparar no que ela NÃO faz: não devolve dado nenhum. Responde sim ou não
  sobre uma foto que quem pergunta já nomeou.
*/
create or replace function public.posso_ver_a_foto(p_aluno_id text, p_visivel_para text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select
    public.usuario_atual() is not null
    and (
      -- O titular vê as próprias fotos, sempre, sem depender de lista nenhuma.
      p_aluno_id = public.usuario_atual()
      or (
        public.pode_ler_do_aluno(p_aluno_id, 'EVOLUCAO')
        and public.papel_atual() = any(p_visivel_para)
      )
    );
$funcao$;

revoke execute on function public.posso_ver_a_foto(text, text[]) from public, anon;
grant execute on function public.posso_ver_a_foto(text, text[]) to authenticated;

drop policy if exists fotoevolucao_le on public."FotoEvolucao";
create policy fotoevolucao_le on public."FotoEvolucao" for select using (
  public.posso_ver_a_foto("alunoId", "visivelPara"::text[])
);

/*
  A mesma trava no arquivo.

  A política anterior parava em vínculo e consentimento: bastava a chave do
  arquivo para baixar qualquer foto do aluno. A chave não é segredo — ela vive
  na linha da tabela, e está no corpo de toda resposta que lista fotos.

  Agora o caminho do profissional exige a LINHA: a foto tem de existir, não
  estar removida, e ter o papel dele na lista. O dono continua alcançando o
  arquivo direto, sem depender de linha nenhuma — é o que mantém o envio
  funcionando, já que o arquivo sobe antes de a linha existir.
*/
drop policy if exists evolucao_le on storage.objects;
create policy evolucao_le on storage.objects for select
  using (
    bucket_id = 'evolucao'
    and (
      public.dono_do_arquivo(name) = public.usuario_atual()
      or exists (
        select 1 from public."FotoEvolucao" f
        where f."chaveArquivo" = public.chave_de_midia(bucket_id, name)
          and f."deletadoEm" is null
          and public.posso_ver_a_foto(f."alunoId", f."visivelPara"::text[])
      )
    )
  );

/*
  O `id` era gerado pelo Prisma.

  `@default(cuid())` é do cliente: o valor era sorteado em JavaScript e vinha
  dentro do INSERT. Pelo PostgREST não há quem o sorteie.
*/
alter table public."FotoEvolucao" alter column id set default gen_random_uuid()::text;

/*
  O que muda numa foto já registrada, e o que não muda.

  Só duas coisas: a lista de quem vê e o carimbo de remoção. Data, ângulo,
  arquivo e dono são o registro — mexer neles não é corrigir, é trocar a foto
  por outra mantendo o histórico da primeira.

  Remover é carimbo porque o registro serve à auditoria de acesso: quem viu a
  foto e quando continua respondível depois de a pessoa apagá-la. O arquivo,
  esse, sai do armazenamento de verdade.
*/
create or replace function public.governar_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  -- Sem sessão é a chave de serviço (semente, migração): não mexe.
  if eu is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new."alunoId" := eu;
    /*
      A chave tem de ser um arquivo DELE. A API conferia o prefixo antes de
      gravar; sem essa conferência, bastaria apontar a chave de outra pessoa
      para registrar a foto dela como sua — e, com a linha no nome próprio,
      liberá-la para quem quisesse.
    */
    if new."chaveArquivo" not like 'evolucao/' || eu || '/%' then
      raise exception 'Chave de arquivo não pertence a você.' using errcode = '42501';
    end if;
  else
    new."alunoId" := old."alunoId";
    new."chaveArquivo" := old."chaveArquivo";
    new.data := old.data;
    new.angulo := old.angulo;
    new."mimeType" := old."mimeType";
    new."tamanhoBytes" := old."tamanhoBytes";
    new.observacao := old.observacao;
    new."criadoEm" := old."criadoEm";
    -- Removida não volta: `deletadoEm` só anda para frente.
    if old."deletadoEm" is not null then
      new."deletadoEm" := old."deletadoEm";
    end if;
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_foto on public."FotoEvolucao";
create trigger governar_foto
  before insert or update on public."FotoEvolucao"
  for each row execute function public.governar_foto();

/*
  Só o titular escreve. O profissional vê — quando o aluno deixou — e nunca
  mexe: nem para corrigir o ângulo, nem para "organizar".
*/
drop policy if exists foto_altera on public."FotoEvolucao";
create policy foto_altera on public."FotoEvolucao" for update
  using ("alunoId" = public.usuario_atual())
  with check ("alunoId" = public.usuario_atual());

/*
  O DELETE continua revogado: remover é carimbo (veja o gatilho). A política
  `foto_apaga`, do arquivo 07, ficou sem permissão para exercer — some aqui
  para não fazer quem lê acreditar que ela decide alguma coisa.
*/
drop policy if exists foto_apaga on public."FotoEvolucao";

grant select, insert, update on public."FotoEvolucao" to authenticated;
revoke delete on public."FotoEvolucao" from authenticated;
