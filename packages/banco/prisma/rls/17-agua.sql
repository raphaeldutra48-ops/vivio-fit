-- Água: apagar o próprio gole, e definir a meta.
--
-- A leitura e o INSERT já existem (`03` e `07`). Faltavam as duas escritas que
-- a tela usa e a política não cobria.

/*
  Apagar um registro é corrigir um toque errado — o app tem botões de volume
  rápido, e errar 750 ml em vez de 200 acontece. Some de vez, e não por marca
  de apagado: água não é histórico clínico, é o copo de hoje.

  Quem apaga é quem poderia ter registrado — a mesma regra do INSERT.
*/
drop policy if exists registroagua_apaga on public."RegistroAgua";
create policy registroagua_apaga on public."RegistroAgua" for delete
  using (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]));

/*
  A meta do dia. Uma por aluno, e por isso `upsert`.

  Sem lista de papel: o nutricionista define, e o próprio aluno também pode —
  é a hidratação dele, e enquanto não há nutricionista na equipe alguém precisa
  poder ajustar os 2000 ml padrão.
*/
drop policy if exists metaagua_escreve on public."MetaAgua";
create policy metaagua_escreve on public."MetaAgua" for insert
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]));

drop policy if exists metaagua_altera on public."MetaAgua";
create policy metaagua_altera on public."MetaAgua" for update
  using (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]))
  with check (public.pode_escrever_do_aluno("alunoId", 'NUTRICAO', array[]::text[]));

create or replace function public.tocar_meta_agua()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  -- `@updatedAt` é do Prisma, não do Postgres: pelo PostgREST não há quem o
  -- preencha, e a coluna é NOT NULL.
  new."atualizadoEm" := now();
  return new;
end;
$funcao$;

drop trigger if exists tocar_meta_agua on public."MetaAgua";
create trigger tocar_meta_agua
  before insert or update on public."MetaAgua"
  for each row execute function public.tocar_meta_agua();

grant select, insert, update on public."MetaAgua" to authenticated;
grant select, insert, delete on public."RegistroAgua" to authenticated;
-- Um gole registrado não se edita: apaga e registra de novo.
revoke update on public."RegistroAgua" from authenticated, anon;
