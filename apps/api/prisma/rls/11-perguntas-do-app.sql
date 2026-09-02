-- Quem pode EXECUTAR cada função, e o que o app pode perguntar.
--
-- ## A regra que este arquivo existe para não deixar esquecer
--
-- Uma função chamada DIRETAMENTE do corpo de uma política roda como quem está
-- pedindo — não como quem definiu a função. Então `authenticated` precisa de
-- EXECUTE em tudo que uma política menciona, mesmo que a função seja
-- `security definer`. Chamada de dentro de outra `security definer`, não
-- precisa: ali quem executa já é o dono.
--
-- Custou caro descobrir. A primeira versão revogou `pode_escrever_do_aluno`
-- por parecer interna, e com isso quebrou TODA escrita pelo PostgREST de uma
-- vez — e quase passou despercebido, porque o teste que deveria pegar afirmava
-- "a nutricionista NÃO consegue escrever", que continuou verdadeiro pelo
-- motivo errado. Um teste que só espera recusa não distingue "a política
-- barrou" de "nada funciona".
--
-- Por isso o teste companheiro afirma também o caso POSITIVO: o médico
-- consegue. É a asserção que quebra quando se revoga demais.

-- --------------------------------------------------------------------------
-- O que as POLÍTICAS chamam. Sem estes grants, nada funciona.
-- --------------------------------------------------------------------------
grant execute on function public.usuario_atual() to authenticated;
grant execute on function public.papel_atual() to authenticated;
grant execute on function public.tem_vinculo(text) to authenticated;
grant execute on function public.tem_consentimento(text, text) to authenticated;
grant execute on function public.tem_acesso_compartilhado(text, text) to authenticated;
grant execute on function public.pode_ler_do_aluno(text, text) to authenticated;
grant execute on function public.pode_escrever_do_aluno(text, text, text[]) to authenticated;

-- --------------------------------------------------------------------------
-- O que o APP pergunta, e por quê.
--
-- Com a API, ler a dieta de um aluno sem consentimento devolvia 403 com o
-- código CONSENTIMENTO_AUSENTE, e doze telas usam esse código para trocar a
-- lista vazia por "peça autorização a este aluno".
--
-- Com RLS não há 403: a política simplesmente não devolve a linha. Do lado de
-- fora, "o aluno não autorizou" e "o aluno ainda não tem dieta" chegam iguais.
--
-- A saída não é fazer a política falar — dizer "sem consentimento para o
-- clínico deste aluno" já confirma que o aluno existe e tem prontuário. É
-- deixar a tela perguntar, em separado, sobre a RELAÇÃO, que é o que
-- `pode_ler_do_aluno` responde. E só quando a lista volta vazia: no caminho
-- comum, que é ter o dado, não custa nada.
-- --------------------------------------------------------------------------

/*
  Estas NÃO são expostas: recebem o profissional como PARÂMETRO, e por isso
  respondem sobre terceiros. Expostas, deixariam qualquer profissional
  perguntar "o colega fulano tem consentimento do aluno beltrano?" — que é
  justamente o que o pedido de acesso existe para intermediar.
*/
revoke execute on function public.vinculo_de(text, text) from authenticated, anon, public;
revoke execute on function public.consentimento_de(text, text, text) from authenticated, anon, public;

-- Ninguém sem sessão pergunta nada.
revoke execute on function public.pode_ler_do_aluno(text, text) from anon;
revoke execute on function public.pode_escrever_do_aluno(text, text, text[]) from anon;
revoke execute on function public.tem_vinculo(text) from anon;
revoke execute on function public.tem_consentimento(text, text) from anon;
revoke execute on function public.tem_acesso_compartilhado(text, text) from anon;

grant execute on function public.pode_pedir_acesso(text, text) to authenticated;
revoke execute on function public.pode_pedir_acesso(text, text) from anon;

/*
  A equipe de cuidado enxerga a si mesma.

  Antes, cada profissional via só o próprio vínculo — e com isso não tinha como
  saber A QUEM pedir um exame, o que deixava a funcionalidade de pedido sem
  porta de entrada.

  Quem entra na lista é só quem já atende o aluno, e o aluno escolheu cada um
  deles. O que fica visível é nome e papel de quem está na mesma equipe, não
  dado nenhum de saúde — para esse continua valendo o consentimento por escopo.
*/
drop policy if exists vinculo_le on public."Vinculo";
create policy vinculo_le on public."Vinculo" for select using (
  "alunoId" = public.usuario_atual()
  or "profissionalId" = public.usuario_atual()
  /*
    `tem_vinculo` e nao um `exists` aqui dentro: consultar `Vinculo` de dentro
    da politica de `Vinculo` dispara a propria politica outra vez, e o Postgres
    para com "infinite recursion detected in policy". A funcao e
    `security definer` justamente para quebrar esse ciclo — e foi por isso que
    ela nasceu, na fundacao.
  */
  or (status = 'ATIVO' and public.tem_vinculo("alunoId"))
);
