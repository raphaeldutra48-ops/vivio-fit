-- Escrita: quem pode criar, alterar e apagar.
--
-- Leitura e escrita são políticas SEPARADAS de propósito. Ver o dado e mudar o
-- dado são permissões diferentes, e juntá-las numa política `for all` é como
-- se perde a regra "o personal lê a condição de saúde e só o médico escreve".
--
-- `with check` vale para INSERT e para o resultado do UPDATE; `using` decide
-- quais linhas o UPDATE e o DELETE alcançam. Escrever só um dos dois deixa
-- buraco: sem `with check`, um UPDATE pode mover a linha para outro aluno.
--
-- ## Uma função para a condição repetida
--
-- Quase toda escrita exige as três condições MAIS um papel. `pode_escrever`
-- junta isso num lugar só — a alternativa era repetir a mesma conjunção em
-- vinte políticas e deixar uma divergir.

create or replace function public.pode_escrever_do_aluno(
  p_aluno_id text,
  p_escopo text,
  p_papeis text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_ler_do_aluno(p_aluno_id, p_escopo)
     and (
       /*
         Lista vazia = titular ou qualquer profissional vinculado e consentido.
         É o caso de medida, check-in e execução de treino: quem acompanha
         registra, e o próprio aluno também.
       */
       cardinality(p_papeis) = 0
       /*
         Lista preenchida = SÓ esses papéis, e o titular NÃO entra por ser
         titular.

         A primeira versão abria uma exceção para o dono do dado, e ela estava
         errada justamente onde mais importa: com ela a Ana podia registrar a
         própria condição de saúde, contornando o "só o médico escreve". O
         teste passou reto porque a linha morreu numa coluna obrigatória
         faltando — o RLS já a tinha liberado.

         Paciente não diagnostica a si mesmo no prontuário. Onde o titular
         precisa escrever mesmo — a foto de evolução, o consentimento — a
         política da tabela diz isso diretamente, sem passar por aqui.
       */
       or public.papel_atual() = any(p_papeis)
     )
$$;

-- --------------------------------------------------------------------------
-- Clínico: aqui o papel é a regra, não detalhe.
-- --------------------------------------------------------------------------

/*
  Condição de saúde: o personal LÊ e só o médico ESCREVE.

  É a separação que justifica o app ter médico dentro. O personal precisa saber
  que existe uma lesão no ombro para não prescrever desenvolvimento; ele não
  pode registrar nem dar alta a um diagnóstico.
*/
drop policy if exists condicaosaude_escreve on public."CondicaoSaude";
create policy condicaosaude_escreve on public."CondicaoSaude" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['MEDICO']));

drop policy if exists condicaosaude_altera on public."CondicaoSaude";
create policy condicaosaude_altera on public."CondicaoSaude" for update
  using (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['MEDICO']))
  with check (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['MEDICO']));

-- Exame: quem lança é quem interpreta.
drop policy if exists exame_escreve on public."Exame";
create policy exame_escreve on public."Exame" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['NUTRICIONISTA', 'MEDICO']));

drop policy if exists exame_altera on public."Exame";
create policy exame_altera on public."Exame" for update
  using (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['NUTRICIONISTA', 'MEDICO']))
  with check (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['NUTRICIONISTA', 'MEDICO']));

drop policy if exists prescricao_escreve on public."Prescricao";
create policy prescricao_escreve on public."Prescricao" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['NUTRICIONISTA', 'MEDICO']));

/*
  Anamnese: quem aplica é quem pergunta.

  O aluno responde, mas quem cria o registro é o profissional — daí o titular
  entrar pela regra geral de `pode_escrever_do_aluno` e não por lista.
*/
drop policy if exists anamnese_escreve on public."Anamnese";
create policy anamnese_escreve on public."Anamnese" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'CLINICO', array['NUTRICIONISTA', 'MEDICO']));

-- --------------------------------------------------------------------------
-- Treino: o personal prescreve, o aluno executa.
-- --------------------------------------------------------------------------
drop policy if exists planotreino_escreve on public."PlanoTreino";
create policy planotreino_escreve on public."PlanoTreino" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'TREINO', array['PERSONAL']));

drop policy if exists planotreino_altera on public."PlanoTreino";
create policy planotreino_altera on public."PlanoTreino" for update
  using (public.pode_escrever_do_aluno("alunoId", 'TREINO', array['PERSONAL']))
  with check (public.pode_escrever_do_aluno("alunoId", 'TREINO', array['PERSONAL']));

/*
  Execução: quem treina é o aluno, e é ele quem grava.

  Sem lista de papel — o personal também registra, quando acompanha o treino
  presencial. O que barra é o consentimento de TREINO, como já era.
*/
drop policy if exists execucao_escreve on public."ExecucaoTreino";
create policy execucao_escreve on public."ExecucaoTreino" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'TREINO', array[]::text[]));

drop policy if exists serie_escreve on public."SerieExecutada";
create policy serie_escreve on public."SerieExecutada" for insert
  with check (exists (select 1 from public."ExecucaoTreino" e where e.id = "execucaoId"));

drop policy if exists feedback_escreve on public."FeedbackTreino";
create policy feedback_escreve on public."FeedbackTreino" for insert
  with check (exists (select 1 from public."ExecucaoTreino" e where e.id = "execucaoId"));

-- --------------------------------------------------------------------------
-- Dieta: só o nutricionista prescreve; o aluno registra o que comeu.
-- --------------------------------------------------------------------------
drop policy if exists planodieta_escreve on public."PlanoDieta";
create policy planodieta_escreve on public."PlanoDieta" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array['NUTRICIONISTA']));

drop policy if exists planodieta_altera on public."PlanoDieta";
create policy planodieta_altera on public."PlanoDieta" for update
  using (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array['NUTRICIONISTA']))
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array['NUTRICIONISTA']));

drop policy if exists registrorefeicao_escreve on public."RegistroRefeicao";
create policy registrorefeicao_escreve on public."RegistroRefeicao" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]));

drop policy if exists registroagua_escreve on public."RegistroAgua";
create policy registroagua_escreve on public."RegistroAgua" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]));

-- --------------------------------------------------------------------------
-- Evolução: aluno e profissional registram — nenhuma restrição de papel, como
-- é hoje na API. O que barra é o consentimento de EVOLUCAO.
-- --------------------------------------------------------------------------
drop policy if exists medida_escreve on public."Medida";
create policy medida_escreve on public."Medida" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array[]::text[]));

drop policy if exists checkin_escreve on public."CheckinDiario";
create policy checkin_escreve on public."CheckinDiario" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array[]::text[]));

/*
  Foto de evolução: só o titular sobe e só o titular apaga.

  É o dado mais íntimo do app. O profissional vê — se houver consentimento de
  EVOLUCAO — e nunca escreve.
*/
drop policy if exists foto_escreve on public."FotoEvolucao";
create policy foto_escreve on public."FotoEvolucao" for insert
  with check ("alunoId" = public.usuario_atual());

drop policy if exists foto_apaga on public."FotoEvolucao";
create policy foto_apaga on public."FotoEvolucao" for delete
  using ("alunoId" = public.usuario_atual());

drop policy if exists cardio_escreve on public."AtividadeCardio";
create policy cardio_escreve on public."AtividadeCardio" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'TREINO', array[]::text[]));

drop policy if exists meta_escreve on public."Meta";
create policy meta_escreve on public."Meta" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'TREINO', array[]::text[]));

drop policy if exists meta_altera on public."Meta";
create policy meta_altera on public."Meta" for update
  using (public.pode_escrever_do_aluno("alunoId", 'TREINO', array[]::text[]))
  with check (public.pode_escrever_do_aluno("alunoId", 'TREINO', array[]::text[]));

-- --------------------------------------------------------------------------
-- Conteúdo do profissional: cria e mexe no que é dele.
-- --------------------------------------------------------------------------
drop policy if exists exercicio_escreve on public."Exercicio";
create policy exercicio_escreve on public."Exercicio" for insert
  with check ("criadoPorId" = public.usuario_atual());

drop policy if exists exercicio_altera on public."Exercicio";
create policy exercicio_altera on public."Exercicio" for update
  using ("criadoPorId" = public.usuario_atual() and escopo = 'PRIVADO')
  with check ("criadoPorId" = public.usuario_atual() and escopo = 'PRIVADO');

drop policy if exists modelocardapio_escreve on public."ModeloCardapio";
create policy modelocardapio_escreve on public."ModeloCardapio" for all
  using ("nutricionistaId" = public.usuario_atual())
  with check ("nutricionistaId" = public.usuario_atual());

drop policy if exists receita_escreve on public."Receita";
create policy receita_escreve on public."Receita" for all
  using ("autorId" = public.usuario_atual())
  with check ("autorId" = public.usuario_atual());

drop policy if exists material_escreve on public."Material";
create policy material_escreve on public."Material" for all
  using ("autorId" = public.usuario_atual())
  with check ("autorId" = public.usuario_atual());

/*
  Pedido de contato: escrito por QUEM AINDA NÃO É USUÁRIO.

  É o formulário da página pública — a pessoa que preenche não tem sessão. É a
  única escrita anônima do sistema, e por isso vale só para INSERT, num perfil
  que esteja publicado. Ler continua sendo só do dono da página.
*/
drop policy if exists pedidocontato_escreve on public."PedidoDeContato";
create policy pedidocontato_escreve on public."PedidoDeContato" for insert
  with check (
    exists (select 1 from public."PerfilPublico" pp where pp.id = "perfilId" and pp.publicado = true)
  );
