-- Catálogo de alimentos: a lista de grupos.
--
-- `distinct` não existe no PostgREST, e trazer as ~600 linhas só para reduzir a
-- dez grupos no cliente seria pagar rede por uma conta que o banco faz de
-- graça. Uma função resolve, e é o único caso do catálogo que precisa dela —
-- listar e buscar são consulta comum.

create or replace function public.grupos_de_alimento()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct grupo from public."Alimento" order by grupo
$$;

grant execute on function public.grupos_de_alimento() to authenticated;
revoke execute on function public.grupos_de_alimento() from anon;

/*
  O catálogo é conteúdo do produto: todo mundo autenticado lê, e a política em
  `05-politicas-profissional.sql` já diz isso. Escrever é curadoria — entra
  pelo importador da TACO, com a chave de serviço.
*/
grant select on public."Alimento" to authenticated;
revoke insert, update, delete on public."Alimento" from authenticated, anon;
