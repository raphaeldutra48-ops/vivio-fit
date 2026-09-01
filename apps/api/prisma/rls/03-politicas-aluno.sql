-- Políticas das tabelas com `alunoId`, por escopo de consentimento.
--
-- O mapa de escopo é escrito à mão porque é decisão de produto, não mecânica:
-- registro de água é NUTRICAO, foto de evolução é EVOLUCAO, receita é CLINICO.
-- Errar aqui não quebra nada visivelmente — só abre ou fecha dado errado.
--
-- Onde há restrição por papel, ela é ADICIONAL ao consentimento: o aluno pode
-- ter autorizado CLINICO e ainda assim o personal não ler a anamnese, porque
-- anamnese pergunta doença, cirurgia e remédio em uso.


-- --------------------------------------------------------------------------
-- Anamnese — CLINICO: a anamnese pergunta doenca, cirurgia e remedio em uso
-- Restrito a: NUTRICIONISTA, MEDICO
-- --------------------------------------------------------------------------
alter table public."Anamnese" enable row level security;
alter table public."Anamnese" force row level security;
drop policy if exists anamnese_le on public."Anamnese";
create policy anamnese_le on public."Anamnese" for select using (
  public.pode_ler_do_aluno("alunoId", 'CLINICO')
  and (public.usuario_atual() = "alunoId" or public.papel_atual() in ('NUTRICIONISTA', 'MEDICO'))
);

-- --------------------------------------------------------------------------
-- AtividadeCardio — TREINO
-- --------------------------------------------------------------------------
alter table public."AtividadeCardio" enable row level security;
alter table public."AtividadeCardio" force row level security;
drop policy if exists atividadecardio_le on public."AtividadeCardio";
create policy atividadecardio_le on public."AtividadeCardio" for select using (
  public.pode_ler_do_aluno("alunoId", 'TREINO')
);

-- --------------------------------------------------------------------------
-- AvaliacaoFisica — EVOLUCAO
-- --------------------------------------------------------------------------
alter table public."AvaliacaoFisica" enable row level security;
alter table public."AvaliacaoFisica" force row level security;
drop policy if exists avaliacaofisica_le on public."AvaliacaoFisica";
create policy avaliacaofisica_le on public."AvaliacaoFisica" for select using (
  public.pode_ler_do_aluno("alunoId", 'EVOLUCAO')
);

-- --------------------------------------------------------------------------
-- CalorimetriaIndireta — EVOLUCAO: gasto energetico medido; anda com a composicao corporal
-- Restrito a: NUTRICIONISTA, MEDICO
-- --------------------------------------------------------------------------
alter table public."CalorimetriaIndireta" enable row level security;
alter table public."CalorimetriaIndireta" force row level security;
drop policy if exists calorimetriaindireta_le on public."CalorimetriaIndireta";
create policy calorimetriaindireta_le on public."CalorimetriaIndireta" for select using (
  public.pode_ler_do_aluno("alunoId", 'EVOLUCAO')
  and (public.usuario_atual() = "alunoId" or public.papel_atual() in ('NUTRICIONISTA', 'MEDICO'))
);

-- --------------------------------------------------------------------------
-- CheckinDiario — EVOLUCAO: sono, energia e dor — acompanhamento, nao treino
-- --------------------------------------------------------------------------
alter table public."CheckinDiario" enable row level security;
alter table public."CheckinDiario" force row level security;
drop policy if exists checkindiario_le on public."CheckinDiario";
create policy checkindiario_le on public."CheckinDiario" for select using (
  public.pode_ler_do_aluno("alunoId", 'EVOLUCAO')
);

-- --------------------------------------------------------------------------
-- CondicaoSaude — CLINICO
-- Restrito a: PERSONAL, NUTRICIONISTA, MEDICO
-- --------------------------------------------------------------------------
alter table public."CondicaoSaude" enable row level security;
alter table public."CondicaoSaude" force row level security;
drop policy if exists condicaosaude_le on public."CondicaoSaude";
create policy condicaosaude_le on public."CondicaoSaude" for select using (
  public.pode_ler_do_aluno("alunoId", 'CLINICO')
  and (public.usuario_atual() = "alunoId" or public.papel_atual() in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO'))
);

-- --------------------------------------------------------------------------
-- Conversa — MENSAGENS
-- --------------------------------------------------------------------------
alter table public."Conversa" enable row level security;
alter table public."Conversa" force row level security;
drop policy if exists conversa_le on public."Conversa";
create policy conversa_le on public."Conversa" for select using (
  public.pode_ler_do_aluno("alunoId", 'MENSAGENS')
);

-- --------------------------------------------------------------------------
-- FotoEvolucao — EVOLUCAO: o dado mais intimo do app
-- --------------------------------------------------------------------------
alter table public."FotoEvolucao" enable row level security;
alter table public."FotoEvolucao" force row level security;
drop policy if exists fotoevolucao_le on public."FotoEvolucao";
create policy fotoevolucao_le on public."FotoEvolucao" for select using (
  public.pode_ler_do_aluno("alunoId", 'EVOLUCAO')
);

-- --------------------------------------------------------------------------
-- Meta — TREINO
-- --------------------------------------------------------------------------
alter table public."Meta" enable row level security;
alter table public."Meta" force row level security;
drop policy if exists meta_le on public."Meta";
create policy meta_le on public."Meta" for select using (
  public.pode_ler_do_aluno("alunoId", 'TREINO')
);

-- --------------------------------------------------------------------------
-- MetaAgua — NUTRICAO
-- --------------------------------------------------------------------------
alter table public."MetaAgua" enable row level security;
alter table public."MetaAgua" force row level security;
drop policy if exists metaagua_le on public."MetaAgua";
create policy metaagua_le on public."MetaAgua" for select using (
  public.pode_ler_do_aluno("alunoId", 'NUTRICAO')
);

-- --------------------------------------------------------------------------
-- PlanoDieta — NUTRICAO
-- --------------------------------------------------------------------------
alter table public."PlanoDieta" enable row level security;
alter table public."PlanoDieta" force row level security;
drop policy if exists planodieta_le on public."PlanoDieta";
create policy planodieta_le on public."PlanoDieta" for select using (
  public.pode_ler_do_aluno("alunoId", 'NUTRICAO')
);

-- --------------------------------------------------------------------------
-- Prescricao — CLINICO: receita e o que o medico prescreveu
-- Restrito a: NUTRICIONISTA, MEDICO
-- --------------------------------------------------------------------------
alter table public."Prescricao" enable row level security;
alter table public."Prescricao" force row level security;
drop policy if exists prescricao_le on public."Prescricao";
create policy prescricao_le on public."Prescricao" for select using (
  public.pode_ler_do_aluno("alunoId", 'CLINICO')
  and (public.usuario_atual() = "alunoId" or public.papel_atual() in ('NUTRICIONISTA', 'MEDICO'))
);

-- --------------------------------------------------------------------------
-- RegistroAgua — NUTRICAO
-- --------------------------------------------------------------------------
alter table public."RegistroAgua" enable row level security;
alter table public."RegistroAgua" force row level security;
drop policy if exists registroagua_le on public."RegistroAgua";
create policy registroagua_le on public."RegistroAgua" for select using (
  public.pode_ler_do_aluno("alunoId", 'NUTRICAO')
);

-- --------------------------------------------------------------------------
-- RegistroRefeicao — NUTRICAO
-- --------------------------------------------------------------------------
alter table public."RegistroRefeicao" enable row level security;
alter table public."RegistroRefeicao" force row level security;
drop policy if exists registrorefeicao_le on public."RegistroRefeicao";
create policy registrorefeicao_le on public."RegistroRefeicao" for select using (
  public.pode_ler_do_aluno("alunoId", 'NUTRICAO')
);
