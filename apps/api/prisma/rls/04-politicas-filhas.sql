-- Tabelas que não têm `alunoId`: o acesso passa pelo registro pai.
--
-- `SerieExecutada` não sabe de quem ela é; ela pertence a uma `ExecucaoTreino`,
-- que pertence a um aluno. A política pergunta pelo pai — e como o pai já tem
-- RLS, a subconsulta só enxerga o que o próprio usuário enxergaria.
--
-- É esse encadeamento que torna o modelo seguro sem repetir a regra de
-- consentimento em cada tabela: quem não vê a execução não vê as séries dela,
-- automaticamente.

-- --------------------------------------------------------------------------
-- Treino
-- --------------------------------------------------------------------------
alter table public."SessaoTreino" enable row level security;
alter table public."SessaoTreino" force row level security;
drop policy if exists sessaotreino_le on public."SessaoTreino";
create policy sessaotreino_le on public."SessaoTreino" for select using (
  exists (select 1 from public."PlanoTreino" p where p.id = "planoId")
);

alter table public."ItemTreino" enable row level security;
alter table public."ItemTreino" force row level security;
drop policy if exists itemtreino_le on public."ItemTreino";
create policy itemtreino_le on public."ItemTreino" for select using (
  exists (select 1 from public."SessaoTreino" s where s.id = "sessaoId")
);

alter table public."SerieExecutada" enable row level security;
alter table public."SerieExecutada" force row level security;
drop policy if exists serieexecutada_le on public."SerieExecutada";
create policy serieexecutada_le on public."SerieExecutada" for select using (
  exists (select 1 from public."ExecucaoTreino" e where e.id = "execucaoId")
);

alter table public."FeedbackTreino" enable row level security;
alter table public."FeedbackTreino" force row level security;
drop policy if exists feedbacktreino_le on public."FeedbackTreino";
create policy feedbacktreino_le on public."FeedbackTreino" for select using (
  exists (select 1 from public."ExecucaoTreino" e where e.id = "execucaoId")
);

-- --------------------------------------------------------------------------
-- Dieta
-- --------------------------------------------------------------------------
alter table public."Refeicao" enable row level security;
alter table public."Refeicao" force row level security;
drop policy if exists refeicao_le on public."Refeicao";
create policy refeicao_le on public."Refeicao" for select using (
  exists (select 1 from public."PlanoDieta" d where d.id = "planoDietaId")
);

alter table public."ItemRefeicao" enable row level security;
alter table public."ItemRefeicao" force row level security;
drop policy if exists itemrefeicao_le on public."ItemRefeicao";
create policy itemrefeicao_le on public."ItemRefeicao" for select using (
  exists (select 1 from public."Refeicao" r where r.id = "refeicaoId")
);

-- --------------------------------------------------------------------------
-- Clínico
--
-- `ResultadoMarcador` é o número do exame — o dado que o personal nunca vê. A
-- política do `Exame` já barra o papel dele, e este encadeamento herda isso
-- sem repetir a regra.
-- --------------------------------------------------------------------------
alter table public."ResultadoMarcador" enable row level security;
alter table public."ResultadoMarcador" force row level security;
drop policy if exists resultadomarcador_le on public."ResultadoMarcador";
create policy resultadomarcador_le on public."ResultadoMarcador" for select using (
  exists (select 1 from public."Exame" e where e.id = "exameId")
);

alter table public."ItemPrescricao" enable row level security;
alter table public."ItemPrescricao" force row level security;
drop policy if exists itemprescricao_le on public."ItemPrescricao";
create policy itemprescricao_le on public."ItemPrescricao" for select using (
  exists (select 1 from public."Prescricao" p where p.id = "prescricaoId")
);

alter table public."RespostaAnamnese" enable row level security;
alter table public."RespostaAnamnese" force row level security;
drop policy if exists respostaanamnese_le on public."RespostaAnamnese";
create policy respostaanamnese_le on public."RespostaAnamnese" for select using (
  exists (select 1 from public."Anamnese" a where a.id = "anamneseId")
);

-- --------------------------------------------------------------------------
-- Conversa
-- --------------------------------------------------------------------------
alter table public."Mensagem" enable row level security;
alter table public."Mensagem" force row level security;
drop policy if exists mensagem_le on public."Mensagem";
create policy mensagem_le on public."Mensagem" for select using (
  exists (select 1 from public."Conversa" c where c.id = "conversaId")
);

alter table public."ParticipanteConversa" enable row level security;
alter table public."ParticipanteConversa" force row level security;
drop policy if exists participanteconversa_le on public."ParticipanteConversa";
create policy participanteconversa_le on public."ParticipanteConversa" for select using (
  exists (select 1 from public."Conversa" c where c.id = "conversaId")
);
