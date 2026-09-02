-- RLS protege a LINHA. Estas cinco coisas estavam vazando pela COLUNA.
--
-- ## O que a API fazia e a política não faz
--
-- A API montava a resposta: escolhia campo por campo o que cada papel recebia,
-- e apagava o resto antes de serializar. Expondo a tabela direto, esse passo
-- some — a política decide QUAIS LINHAS aparecem e devolve todas as colunas
-- delas. Cinco coisas passaram a vazar de uma vez, e uma delas é justamente o
-- que o produto promete não vazar:
--
--   1. `AlertaClinico.marcadorOrigem` e `exameId` chegavam ao PERSONAL. O
--      alerta existe para ele receber a conduta SEM o número; com o marcador
--      junto, ele sabe que é a taxa de filtração renal. É o diferencial do
--      produto virando o contrário de si mesmo.
--   2. O mesmo para a NUTRICIONISTA em marcador de escopo MEDICO — TSH, T4,
--      DHEA-S, prolactina.
--   3. `ResultadoMarcador` inteiro: a nutricionista lia o TSH do exame, valor
--      e tudo.
--   4. `Exame.chaveArquivo`: a chave do laudo no storage privado, que por
--      especificação é do médico e do aluno, e de mais ninguém.
--   5. `User.senhaHash`: qualquer profissional lia o hash argon2 dos alunos
--      que atende.
--
-- ## Três remédios diferentes, porque os problemas são diferentes
--
-- Coluna que NINGUÉM pode ler (1, 4, 5) → `grant` por coluna. É estático e
-- absoluto. Custa que `select *` passa a falhar com "permission denied for
-- table" em vez de omitir a coluna — o que é ruidoso, e é o lado certo de
-- errar: quem escrever `select *` descobre na hora, em vez de receber o
-- segredo calado.
--
-- Coluna que DEPENDE do papel de quem lê (1, 2) → não se resolve por grant nem
-- por política. Resolve-se **não gravando**: o gatilho já sabe para qual papel
-- o alerta vai, então grava o marcador só quando aquele papel poderia vê-lo. A
-- linha do personal simplesmente não tem marcador — não há o que proteger.
--
-- Linha que depende do papel (3) → política, que é o que política faz.

grant execute on function public.pode_ver_marcador(text, text) to authenticated;
revoke execute on function public.pode_ver_marcador(text, text) from anon;

-- --------------------------------------------------------------------------
-- (3) O resultado do exame, marcador a marcador.
--
-- Antes bastava alcançar o exame para ler todos os resultados dele. Agora cada
-- linha passa pelo escopo — a nutricionista lê a ferritina do mesmo exame em
-- que não lê o TSH.
-- --------------------------------------------------------------------------
drop policy if exists resultadomarcador_le on public."ResultadoMarcador";
create policy resultadomarcador_le on public."ResultadoMarcador" for select using (
  exists (select 1 from public."Exame" e where e.id = "exameId")
  and public.pode_ver_marcador(public.papel_atual(), marcador)
);

-- --------------------------------------------------------------------------
-- (5) O hash de senha não é de ninguém.
--
-- Sobra do login próprio, que o Supabase Auth substituiu. Some de vez quando a
-- API sair; até lá, fica ilegível pelo PostgREST.
-- --------------------------------------------------------------------------
revoke select on public."User" from authenticated, anon;
grant select (
  id, email, nome, telefone, "avatarUrl", papel, status,
  "emailVerifEm", "ultimoLoginEm", "criadoEm", "atualizadoEm", "deletadoEm"
) on public."User" to authenticated;

-- --------------------------------------------------------------------------
-- (4) A chave do laudo no storage privado.
--
-- Está na especificação como regra dura: personal e nutricionista **nunca**
-- acessam o arquivo, só o que foi derivado dele. Quem precisa dele — médico e
-- aluno — recebe uma URL assinada, emitida por quem confere o papel; a chave
-- crua não precisa sair do banco para ninguém.
-- --------------------------------------------------------------------------
revoke select on public."Exame" from authenticated, anon;
grant select (
  id, "alunoId", "registradoPorId", laboratorio, "dataColeta", sexo,
  observacao, "mimeType", "criadoEm"
) on public."Exame" to authenticated;

/*
  Escrever continua liberado nas mesmas colunas de antes: quem lança o exame
  precisa gravar a chave do arquivo, e é a política de INSERT que decide se
  pode. O que se tirou foi a LEITURA da chave por quem não devia.
*/
grant insert, update on public."Exame" to authenticated;
grant insert, update on public."User" to authenticated;

-- --------------------------------------------------------------------------
-- (1) e (2) nas linhas que já existiam.
--
-- O gatilho passou a não gravar o marcador para quem não pode vê-lo, mas os
-- alertas criados antes disso já estão gravados com ele. Limpar é o que fecha
-- o vazamento de verdade: sem isto, todo alerta anterior continuaria contando
-- ao personal de qual exame ele veio.
--
-- Só apaga a referência; o alerta e a orientação continuam inteiros, que é o
-- que aquele profissional deve receber.
-- --------------------------------------------------------------------------
update public."AlertaClinico"
   set "marcadorOrigem" = null, "exameId" = null
 where "marcadorOrigem" is not null
   and not public.pode_ver_marcador("papelDestino", "marcadorOrigem");
