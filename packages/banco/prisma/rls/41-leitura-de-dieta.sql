-- A autorização para mandar o documento de saúde a um modelo de IA.
--
-- A leitura em si acontece fora do banco — num serviço que fala com o modelo.
-- O que fica aqui é a pergunta que precede a leitura, e ela não pode morar lá:
-- quem decide se o documento de uma pessoa pode sair do app é o banco, com a
-- mesma regra que decide todo o resto.

/*
  Pode mandar a dieta deste aluno para leitura automática?

  Devolve o que FALTA, e não um sim/não, porque a tela precisa da diferença: o
  profissional que vê "falta a autorização de leitura automática" pede a
  autorização; o que vê "não foi possível" reenvia o arquivo três vezes e
  desiste.

  São DOIS consentimentos, e não um, e a distinção é a razão de esta função
  existir:

  - `NUTRICAO` é quem pode ver a dieta dele — a autorização que ele já dá para o
    profissional acompanhar.
  - `LEITURA_AUTOMATICA` é outra pergunta: se o documento de saúde dele pode ser
    enviado a um serviço de terceiro, fora do país, para ser lido por máquina.

  Quem autoriza o profissional a VER não autorizou, com isso, uma empresa
  estrangeira a PROCESSAR. A LGPD trata dado de saúde como sensível e pede
  consentimento específico e destacado por finalidade; reaproveitar o de
  nutrição aqui seria usar um "sim" dado para outra pergunta.

  `null` quer dizer que pode. O vínculo vem antes dos dois: sem ele, nem a
  pergunta faz sentido.
*/
create or replace function public.falta_para_ler_dieta(p_aluno_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  if eu is null then
    return 'SESSAO';
  end if;
  if public.papel_atual() = 'ALUNO' then
    return 'PAPEL';
  end if;

  -- Sem aluno é a importação do modelo do próprio profissional: o documento é
  -- dele, não há dado de terceiro saindo daqui, e não há o que consentir.
  if p_aluno_id is null then
    return null;
  end if;

  if not exists (
    select 1 from public."Vinculo" v
     where v."alunoId" = p_aluno_id and v."profissionalId" = eu and v.status = 'ATIVO'
  ) then
    return 'VINCULO';
  end if;

  if not public.consentimento_de(eu, p_aluno_id, 'NUTRICAO') then
    return 'NUTRICAO';
  end if;
  if not public.consentimento_de(eu, p_aluno_id, 'LEITURA_AUTOMATICA') then
    return 'LEITURA_AUTOMATICA';
  end if;

  return null;
end;
$funcao$;

revoke execute on function public.falta_para_ler_dieta(text) from public, anon;
grant execute on function public.falta_para_ler_dieta(text) to authenticated;
