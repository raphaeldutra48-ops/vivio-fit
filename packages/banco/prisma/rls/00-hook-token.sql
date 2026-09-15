-- Injeta o nosso id no token do Supabase Auth.
--
-- ## Por que isto precisa existir
--
-- `auth.uid()` faz `::uuid` no campo `sub` do token. Os nossos ids são `cuid`
-- — texto de 25 caracteres, como `cms4yfrv50006uw88b96ttf28`. A conversão não
-- devolve falso: ela **lança erro**, e derruba a consulta inteira. Toda política
-- que comparasse `auth.uid()::text` com uma coluna nossa quebraria.
--
-- As três saídas eram: migrar o id de 66 tabelas para uuid, pôr uma coluna de
-- mapeamento e pagar um join em toda política, ou carregar o nosso id dentro do
-- próprio token. Esta é a terceira: não toca em id nenhum e não custa join.
--
-- O casamento é por e-mail porque ele é único dos dois lados e já existe. A
-- alternativa — guardar o uuid do Auth numa coluna nova — seria uma migração de
-- schema para resolver o que uma junção resolve uma vez por login.

create or replace function public.token_com_id_vivio(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  id_vivio text;
  claims jsonb;
begin
  select u.id into id_vivio
  from public."User" u
  join auth.users a on lower(a.email) = lower(u.email)
  where a.id = (event ->> 'user_id')::uuid
    and u."deletadoEm" is null;

  claims := event -> 'claims';

  /*
    Sem correspondência, o token sai SEM a claim — e não com um valor vazio.
    Política que compara com `''` acharia que ninguém é ninguém; política que
    compara com claim ausente devolve nulo, e nulo em `WHERE` é falso. O
    segundo é o comportamento seguro.
  */
  if id_vivio is not null then
    claims := jsonb_set(claims, '{vivio_id}', to_jsonb(id_vivio));
    claims := jsonb_set(claims, '{vivio_papel}',
      to_jsonb(coalesce((select papel::text from public."User" where id = id_vivio), '')));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- O Auth roda o hook como `supabase_auth_admin`; sem estas permissões ele
-- falha em silêncio e o token sai sem a claim.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.token_com_id_vivio to supabase_auth_admin;
grant select on table public."User" to supabase_auth_admin;
revoke execute on function public.token_com_id_vivio from authenticated, anon, public;
