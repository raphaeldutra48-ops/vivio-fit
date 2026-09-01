-- Políticas das tabelas de dado do aluno.
--
-- Cada uma amarra a tabela ao ESCOPO de consentimento que lhe corresponde. O
-- mapa vem do próprio produto e não é arbitrário: treino é TREINO, dieta é
-- NUTRICAO, exame é CLINICO, medida é EVOLUCAO.
--
-- `force row level security` além de `enable`: sem o `force`, o dono da tabela
-- (o papel que roda as migrações) continua ignorando as políticas. Em Supabase
-- isso importa porque é fácil acabar consultando como dono e concluir que a
-- proteção funciona quando ela nem foi consultada.

-- ---------------------------------------------------------------------------
-- User: cada um se vê; profissional vê quem ele atende.
-- ---------------------------------------------------------------------------
alter table public."User" enable row level security;
alter table public."User" force row level security;
drop policy if exists user_le on public."User";
create policy user_le on public."User" for select using (
  id = public.usuario_atual()
  or public.tem_vinculo(id)
  /*
    O profissional também precisa aparecer para o aluno — a tela "minha equipe"
    mostra nome e especialidade de quem cuida dele.
  */
  or exists (
    select 1 from public."Vinculo" v
    where v."profissionalId" = "User".id
      and v."alunoId" = public.usuario_atual()
      and v.status = 'ATIVO'
  )
);

-- ---------------------------------------------------------------------------
-- Vinculo e Consentimento: os dois lados enxergam o próprio laço.
-- ---------------------------------------------------------------------------
alter table public."Vinculo" enable row level security;
alter table public."Vinculo" force row level security;
drop policy if exists vinculo_le on public."Vinculo";
create policy vinculo_le on public."Vinculo" for select using (
  "alunoId" = public.usuario_atual() or "profissionalId" = public.usuario_atual()
);

alter table public."Consentimento" enable row level security;
alter table public."Consentimento" force row level security;
drop policy if exists consentimento_le on public."Consentimento";
create policy consentimento_le on public."Consentimento" for select using (
  "alunoId" = public.usuario_atual()
  /*
    O profissional vê o consentimento que lhe diz respeito — é o que permite a
    tela dizer "falta o aluno autorizar TREINO" em vez de só mostrar um botão
    desligado sem explicação.
  */
  or (public.tem_vinculo("alunoId")
      and ("profissionalId" is null or "profissionalId" = public.usuario_atual()))
);

-- Só o titular concede e revoga o próprio consentimento.
drop policy if exists consentimento_escreve on public."Consentimento";
create policy consentimento_escreve on public."Consentimento" for all
  using ("alunoId" = public.usuario_atual())
  with check ("alunoId" = public.usuario_atual());

-- ---------------------------------------------------------------------------
-- Treino — escopo TREINO
-- ---------------------------------------------------------------------------
alter table public."PlanoTreino" enable row level security;
alter table public."PlanoTreino" force row level security;
drop policy if exists plano_le on public."PlanoTreino";
create policy plano_le on public."PlanoTreino" for select using (
  public.pode_ler_do_aluno("alunoId", 'TREINO')
);

alter table public."ExecucaoTreino" enable row level security;
alter table public."ExecucaoTreino" force row level security;
drop policy if exists execucao_le on public."ExecucaoTreino";
create policy execucao_le on public."ExecucaoTreino" for select using (
  public.pode_ler_do_aluno("alunoId", 'TREINO')
);

-- ---------------------------------------------------------------------------
-- Evolução — escopo EVOLUCAO
-- ---------------------------------------------------------------------------
alter table public."Medida" enable row level security;
alter table public."Medida" force row level security;
drop policy if exists medida_le on public."Medida";
create policy medida_le on public."Medida" for select using (
  public.pode_ler_do_aluno("alunoId", 'EVOLUCAO')
);

-- ---------------------------------------------------------------------------
-- Clínico — escopo CLINICO, e ainda por papel
-- ---------------------------------------------------------------------------
alter table public."Exame" enable row level security;
alter table public."Exame" force row level security;
drop policy if exists exame_le on public."Exame";
create policy exame_le on public."Exame" for select using (
  public.pode_ler_do_aluno("alunoId", 'CLINICO')
  /*
    E ainda: só quem lança exame pode lê-lo. O personal fica de fora do dado
    bruto de propósito — ele recebe a orientação derivada pelo alerta, que é
    outra tabela e outra política.
  */
  and (public.usuario_atual() = "alunoId"
       or public.papel_atual() in ('NUTRICIONISTA', 'MEDICO'))
);

/*
  Alerta clínico: o cruzamento que é o produto.

  O personal ENTRA aqui, e é de propósito — ele não vê marcador nenhum e por
  isso precisa da orientação já derivada. O filtro é o `papelDestino`: cada um
  recebe o que foi endereçado ao seu papel, e nada mais.

  Automático, sem pedir autorização a cada vez: alerta clínico que espera
  aprovação chega tarde.
*/
alter table public."AlertaClinico" enable row level security;
alter table public."AlertaClinico" force row level security;
drop policy if exists alerta_le on public."AlertaClinico";
create policy alerta_le on public."AlertaClinico" for select using (
  public.pode_ler_do_aluno("alunoId", 'CLINICO')
  and "papelDestino" = public.papel_atual()
);
