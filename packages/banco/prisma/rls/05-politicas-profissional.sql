-- Conteúdo do profissional, catálogo global e registros pessoais.
--
-- Aqui não há consentimento no meio: são dados do próprio profissional (os
-- modelos que ele monta) ou catálogo que todo mundo lê.

-- --------------------------------------------------------------------------
-- Catálogo: todo usuário autenticado lê.
--
-- Exercício GLOBAL e alimento são conteúdo do produto, não de ninguém. O
-- exercício PRIVADO é a exceção: pertence a quem o criou, e o motivo é
-- concorrência — a biblioteca própria de um personal não é do outro.
-- --------------------------------------------------------------------------
alter table public."Alimento" enable row level security;
alter table public."Alimento" force row level security;
drop policy if exists alimento_le on public."Alimento";
create policy alimento_le on public."Alimento" for select using (
  public.usuario_atual() is not null
);

alter table public."Exercicio" enable row level security;
alter table public."Exercicio" force row level security;
drop policy if exists exercicio_le on public."Exercicio";
create policy exercicio_le on public."Exercicio" for select using (
  public.usuario_atual() is not null
  and (escopo = 'GLOBAL' or "criadoPorId" = public.usuario_atual())
);

alter table public."ItemPrescritivel" enable row level security;
alter table public."ItemPrescritivel" force row level security;
drop policy if exists itemprescritivel_le on public."ItemPrescritivel";
create policy itemprescritivel_le on public."ItemPrescritivel" for select using (
  public.usuario_atual() is not null
  and (escopo = 'GLOBAL' or "criadoPorId" = public.usuario_atual())
);

-- --------------------------------------------------------------------------
-- Do profissional, e só dele.
-- --------------------------------------------------------------------------
alter table public."DemonstracaoProfissional" enable row level security;
alter table public."DemonstracaoProfissional" force row level security;
drop policy if exists demonstracao_le on public."DemonstracaoProfissional";
create policy demonstracao_le on public."DemonstracaoProfissional" for select using (
  "profissionalId" = public.usuario_atual()
  -- O aluno também vê a demonstração de quem cuida dele: é ela que toca na
  -- tela de treino, gravada pelo próprio personal.
  or exists (
    select 1 from public."Vinculo" v
    where v."profissionalId" = "DemonstracaoProfissional"."profissionalId"
      and v."alunoId" = public.usuario_atual()
      and v.status = 'ATIVO'
  )
);

alter table public."DisponibilidadeSlot" enable row level security;
alter table public."DisponibilidadeSlot" force row level security;
drop policy if exists disponibilidade_le on public."DisponibilidadeSlot";
create policy disponibilidade_le on public."DisponibilidadeSlot" for select using (
  "profissionalId" = public.usuario_atual()
  -- O aluno precisa ver os horários livres de quem cuida dele para marcar.
  or exists (
    select 1 from public."Vinculo" v
    where v."profissionalId" = "DisponibilidadeSlot"."profissionalId"
      and v."alunoId" = public.usuario_atual()
      and v.status = 'ATIVO'
  )
);

alter table public."BloqueioAgenda" enable row level security;
alter table public."BloqueioAgenda" force row level security;
drop policy if exists bloqueio_le on public."BloqueioAgenda";
create policy bloqueio_le on public."BloqueioAgenda" for select using (
  "profissionalId" = public.usuario_atual()
);

-- Dado bancário: só o dono, sem exceção.
alter table public."DadosDePagamento" enable row level security;
alter table public."DadosDePagamento" force row level security;
drop policy if exists dadospagamento_le on public."DadosDePagamento";
create policy dadospagamento_le on public."DadosDePagamento" for select using (
  "profissionalId" = public.usuario_atual()
);

alter table public."ModeloAnamnese" enable row level security;
alter table public."ModeloAnamnese" force row level security;
drop policy if exists modeloanamnese_le on public."ModeloAnamnese";
create policy modeloanamnese_le on public."ModeloAnamnese" for select using (
  "profissionalId" = public.usuario_atual()
);

-- --------------------------------------------------------------------------
-- Perfis
-- --------------------------------------------------------------------------
alter table public."PerfilAluno" enable row level security;
alter table public."PerfilAluno" force row level security;
drop policy if exists perfilaluno_le on public."PerfilAluno";
create policy perfilaluno_le on public."PerfilAluno" for select using (
  "userId" = public.usuario_atual() or public.tem_vinculo("userId")
);

alter table public."PerfilProfissional" enable row level security;
alter table public."PerfilProfissional" force row level security;
drop policy if exists perfilprofissional_le on public."PerfilProfissional";
create policy perfilprofissional_le on public."PerfilProfissional" for select using (
  "userId" = public.usuario_atual()
  -- O aluno vê o registro no conselho e a especialidade de quem cuida dele.
  or exists (
    select 1 from public."Vinculo" v
    where v."profissionalId" = "PerfilProfissional"."userId"
      and v."alunoId" = public.usuario_atual()
      and v.status = 'ATIVO'
  )
);

-- Página pública do profissional: lida por QUALQUER UM, inclusive sem sessão.
-- É o único caso do sistema em que isso é correto — a página existe para ser
-- encontrada por quem ainda não é cliente.
alter table public."PerfilPublico" enable row level security;
alter table public."PerfilPublico" force row level security;
drop policy if exists perfilpublico_le on public."PerfilPublico";
create policy perfilpublico_le on public."PerfilPublico" for select using (publicado = true);

-- --------------------------------------------------------------------------
-- Notificação e dispositivo: só o dono.
-- --------------------------------------------------------------------------
alter table public."Notificacao" enable row level security;
alter table public."Notificacao" force row level security;
drop policy if exists notificacao_le on public."Notificacao";
create policy notificacao_le on public."Notificacao" for select using (
  "userId" = public.usuario_atual()
);

alter table public."TokenDispositivo" enable row level security;
alter table public."TokenDispositivo" force row level security;
drop policy if exists tokendispositivo_le on public."TokenDispositivo";
create policy tokendispositivo_le on public."TokenDispositivo" for select using (
  "userId" = public.usuario_atual()
);

-- --------------------------------------------------------------------------
-- Tabelas de credencial: NINGUÉM lê pela API.
--
-- SessaoRefresh e os tokens de verificação e de redefinição pertencem à
-- autenticação própria, que o Supabase Auth substitui. Enquanto existirem no
-- schema ficam com RLS ligado e SEM política nenhuma — o que em Postgres
-- significa "nada é visível". Somem junto com a API.
-- --------------------------------------------------------------------------
alter table public."SessaoRefresh" enable row level security;
alter table public."SessaoRefresh" force row level security;
alter table public."TokenRedefinicaoSenha" enable row level security;
alter table public."TokenRedefinicaoSenha" force row level security;
alter table public."TokenVerificacaoEmail" enable row level security;
alter table public."TokenVerificacaoEmail" force row level security;

-- --------------------------------------------------------------------------
-- Auditoria: o titular vê os próprios acessos, e mais ninguém.
--
-- É a tela "quem olhou meus dados", que é direito do titular pela LGPD. O
-- profissional não vê a auditoria — nem a que ele mesmo gerou, para não poder
-- conferir se foi notado.
-- --------------------------------------------------------------------------
alter table public."LogAuditoria" enable row level security;
alter table public."LogAuditoria" force row level security;
drop policy if exists logauditoria_le on public."LogAuditoria";
create policy logauditoria_le on public."LogAuditoria" for select using (
  "alunoId" = public.usuario_atual()
);
