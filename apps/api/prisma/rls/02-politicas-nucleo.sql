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
/*
  Quem enxerga o cadastro de quem.

  Tres casos, e os dois ultimos foram aprendidos depois:

  1. Voce mesmo.
  2. Alguem com quem voce tem VINCULO, em qualquer status — e nao so ATIVO.
     Com "so ativo", o profissional que acabava de convidar um aluno recebia o
     convite pendente com a contraparte NULA: ele sabia o e-mail, porque foi ele
     que digitou, e mesmo assim nao conseguia ler o nome. A tela mostrava
     "Convites pendentes: 1" sem dizer de quem.
  3. Quem esta na MESMA EQUIPE de cuidado: dois profissionais com vinculo ativo
     com o mesmo aluno. Sem isso nao ha como saber a quem pedir um exame, e o
     pedido de acesso entre profissionais fica sem porta de entrada. O que fica
     visivel e nome e contato de colega — dado de saude continua preso ao
     consentimento por escopo, que nao passa por aqui.

  `senhaHash` nao entra em nenhum dos tres: RLS e por linha, e quem cuida da
  coluna e o `grant` em `13-colunas-sensiveis.sql`.
*/
create or replace function public.ha_vinculo_qualquer(p_outro_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and (
       public.usuario_atual() = p_outro_id
       or exists (
         select 1 from public."Vinculo" v
         where (v."alunoId" = p_outro_id and v."profissionalId" = public.usuario_atual())
            or (v."profissionalId" = p_outro_id and v."alunoId" = public.usuario_atual())
       )
     )
$$;

create or replace function public.mesma_equipe(p_outro_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and exists (
       select 1
       from public."Vinculo" meu
       join public."Vinculo" dele on dele."alunoId" = meu."alunoId"
       where meu."profissionalId" = public.usuario_atual()
         and meu.status = 'ATIVO'
         and dele."profissionalId" = p_outro_id
         and dele.status = 'ATIVO'
     )
$$;

/*
  Quarto caso: quem APARECE na minha auditoria.

  "Quem viu meus dados" é o direito de saber QUEM — e sem isto a tela mostrava
  a ação e a data com o nome em branco. Acontece com o admin, que acessa sem
  vínculo nenhum, e é justamente o acesso que mais interessa ao titular saber
  que houve.

  Abre pouco e abre o certo: só o nome de quem já mexeu nos dados DESTA pessoa,
  e só para ela.
*/
create or replace function public.foi_meu_ator(p_outro_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and exists (
       select 1 from public."LogAuditoria" l
       where l."alunoId" = public.usuario_atual()
         and l."atorId" = p_outro_id
     )
$$;

drop policy if exists user_le on public."User";
create policy user_le on public."User" for select using (
  id = public.usuario_atual()
  or public.ha_vinculo_qualquer(id)
  or public.mesma_equipe(id)
  or public.foi_meu_ator(id)
);

-- ---------------------------------------------------------------------------
-- Vinculo e Consentimento: os dois lados enxergam o próprio laço.
-- ---------------------------------------------------------------------------
alter table public."Vinculo" enable row level security;
alter table public."Vinculo" force row level security;
/*
  Vinculo: os dois lados enxergam o proprio laco, e a equipe enxerga a si mesma.

  A terceira condicao existe pelo mesmo motivo do `user_le`: sem ela, cada
  profissional via so o proprio vinculo e nao tinha como saber A QUEM pedir um
  exame.

  `tem_vinculo` e nao um `exists` aqui dentro: consultar `Vinculo` de dentro da
  politica de `Vinculo` dispara a propria politica outra vez, e o Postgres para
  com "infinite recursion detected in policy". A funcao e `security definer`
  justamente para quebrar esse ciclo.
*/
drop policy if exists vinculo_le on public."Vinculo";
create policy vinculo_le on public."Vinculo" for select using (
  "alunoId" = public.usuario_atual()
  or "profissionalId" = public.usuario_atual()
  or (status = 'ATIVO' and public.tem_vinculo("alunoId"))
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
