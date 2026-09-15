-- As 16 que faltavam. Enquanto ficaram sem RLS, qualquer token lia tudo delas.
--
-- Os nomes de coluna aqui foram lidos do banco, não supostos — a rodada
-- anterior custou quatro tentativas por causa disso: `planoId` onde era
-- `planoDietaId`, `criadoPorId` onde era `profissionalId`, `usuarioId` onde
-- era `userId`. Cada nome errado só aparece na hora de aplicar, uma falha por
-- vez. Daí o `conferir-rls.ts`, que agora roda antes.

-- --------------------------------------------------------------------------
-- Cobrança e agenda: os DOIS lados enxergam.
--
-- Não passa por consentimento de escopo: cobrança é relação comercial e
-- compromisso é combinado entre as partes — nenhum dos dois é dado de saúde.
-- --------------------------------------------------------------------------
alter table public."Cobranca" enable row level security;
alter table public."Cobranca" force row level security;
drop policy if exists cobranca_le on public."Cobranca";
create policy cobranca_le on public."Cobranca" for select using (
  "profissionalId" = public.usuario_atual() or "alunoId" = public.usuario_atual()
);

alter table public."Compromisso" enable row level security;
alter table public."Compromisso" force row level security;
drop policy if exists compromisso_le on public."Compromisso";
create policy compromisso_le on public."Compromisso" for select using (
  "profissionalId" = public.usuario_atual() or "alunoId" = public.usuario_atual()
);

-- Preferência de lembrete é do aluno, e de mais ninguém: a que horas ele quer
-- ser cutucado não interessa ao profissional.
alter table public."ConfiguracaoLembrete" enable row level security;
alter table public."ConfiguracaoLembrete" force row level security;
drop policy if exists configlembrete_le on public."ConfiguracaoLembrete";
create policy configlembrete_le on public."ConfiguracaoLembrete" for select using (
  "alunoId" = public.usuario_atual()
);

-- --------------------------------------------------------------------------
-- Material: do autor, e de quem ele compartilhou.
-- --------------------------------------------------------------------------
alter table public."Material" enable row level security;
alter table public."Material" force row level security;
drop policy if exists material_le on public."Material";
create policy material_le on public."Material" for select using (
  "autorId" = public.usuario_atual()
  or exists (
    select 1 from public."MaterialCompartilhado" mc
    where mc."materialId" = "Material".id and mc."alunoId" = public.usuario_atual()
  )
);

alter table public."MaterialCompartilhado" enable row level security;
alter table public."MaterialCompartilhado" force row level security;
drop policy if exists materialcompartilhado_le on public."MaterialCompartilhado";
create policy materialcompartilhado_le on public."MaterialCompartilhado" for select using (
  "alunoId" = public.usuario_atual()
  or exists (
    select 1 from public."Material" m
    where m.id = "MaterialCompartilhado"."materialId" and m."autorId" = public.usuario_atual()
  )
);

-- --------------------------------------------------------------------------
-- Modelos do profissional: conteúdo que ele monta para reusar.
--
-- Privado por padrão, e o motivo é concorrência: o cardápio que um
-- nutricionista escreveu é o trabalho dele, não do colega.
-- --------------------------------------------------------------------------
alter table public."ModeloCardapio" enable row level security;
alter table public."ModeloCardapio" force row level security;
drop policy if exists modelocardapio_le on public."ModeloCardapio";
create policy modelocardapio_le on public."ModeloCardapio" for select using (
  "nutricionistaId" = public.usuario_atual()
);

alter table public."RefeicaoModelo" enable row level security;
alter table public."RefeicaoModelo" force row level security;
drop policy if exists refeicaomodelo_le on public."RefeicaoModelo";
create policy refeicaomodelo_le on public."RefeicaoModelo" for select using (
  exists (select 1 from public."ModeloCardapio" m where m.id = "modeloId")
);

alter table public."ItemModelo" enable row level security;
alter table public."ItemModelo" force row level security;
drop policy if exists itemmodelo_le on public."ItemModelo";
create policy itemmodelo_le on public."ItemModelo" for select using (
  exists (select 1 from public."RefeicaoModelo" r where r.id = "refeicaoId")
);

alter table public."ModeloPrescricao" enable row level security;
alter table public."ModeloPrescricao" force row level security;
drop policy if exists modeloprescricao_le on public."ModeloPrescricao";
create policy modeloprescricao_le on public."ModeloPrescricao" for select using (
  "prescritorId" = public.usuario_atual()
);

alter table public."ItemModeloPrescricao" enable row level security;
alter table public."ItemModeloPrescricao" force row level security;
drop policy if exists itemmodeloprescricao_le on public."ItemModeloPrescricao";
create policy itemmodeloprescricao_le on public."ItemModeloPrescricao" for select using (
  exists (select 1 from public."ModeloPrescricao" m where m.id = "modeloId")
);

alter table public."Receita" enable row level security;
alter table public."Receita" force row level security;
drop policy if exists receita_le on public."Receita";
create policy receita_le on public."Receita" for select using (
  "autorId" = public.usuario_atual()
);

alter table public."IngredienteReceita" enable row level security;
alter table public."IngredienteReceita" force row level security;
drop policy if exists ingredientereceita_le on public."IngredienteReceita";
create policy ingredientereceita_le on public."IngredienteReceita" for select using (
  exists (select 1 from public."Receita" r where r.id = "receitaId")
);

alter table public."RefeicaoSalva" enable row level security;
alter table public."RefeicaoSalva" force row level security;
drop policy if exists refeicaosalva_le on public."RefeicaoSalva";
create policy refeicaosalva_le on public."RefeicaoSalva" for select using (
  "autorId" = public.usuario_atual()
);

alter table public."ItemRefeicaoSalva" enable row level security;
alter table public."ItemRefeicaoSalva" force row level security;
drop policy if exists itemrefeicaosalva_le on public."ItemRefeicaoSalva";
create policy itemrefeicaosalva_le on public."ItemRefeicaoSalva" for select using (
  exists (select 1 from public."RefeicaoSalva" r where r.id = "refeicaoId")
);

alter table public."PerguntaAnamnese" enable row level security;
alter table public."PerguntaAnamnese" force row level security;
drop policy if exists perguntaanamnese_le on public."PerguntaAnamnese";
create policy perguntaanamnese_le on public."PerguntaAnamnese" for select using (
  exists (select 1 from public."ModeloAnamnese" m where m.id = "modeloId")
);

-- --------------------------------------------------------------------------
-- Pedido de contato: chega pela página pública, e é do dono da página.
--
-- Quem escreve é anônimo — a política de INSERT vem no arquivo de escrita.
-- Ler, só o profissional dono do perfil.
-- --------------------------------------------------------------------------
alter table public."PedidoDeContato" enable row level security;
alter table public."PedidoDeContato" force row level security;
drop policy if exists pedidocontato_le on public."PedidoDeContato";
create policy pedidocontato_le on public."PedidoDeContato" for select using (
  exists (
    select 1 from public."PerfilPublico" pp
    where pp.id = "perfilId" and pp."profissionalId" = public.usuario_atual()
  )
);
