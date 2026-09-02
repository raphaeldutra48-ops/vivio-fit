-- Dar baixa num alerta.
--
-- É a única escrita que o app faz em `AlertaClinico`: o resto nasce de gatilho.
-- E ela precisa ser estreita, porque a linha carrega orientação clínica — quem
-- pode marcar "li e entendi" não pode, pelo mesmo caminho, reescrever o que o
-- aviso diz.
--
-- Política diz QUEM alcança a linha; o gatilho diz o QUE pode mudar nela.
-- A divisão não é estilo: `with check` não enxerga o valor antigo, então
-- "só estes três campos mudaram" é uma frase que política nenhuma sabe dizer.

drop policy if exists alerta_reconhece on public."AlertaClinico";
create policy alerta_reconhece on public."AlertaClinico" for update
  using (
    public.pode_ler_do_aluno("alunoId", 'CLINICO')
    -- O `papelDestino` é o que impede dar baixa em aviso alheio: o
    -- nutricionista não reconhece o que era do personal.
    and "papelDestino" = public.papel_atual()
  )
  with check (
    public.pode_ler_do_aluno("alunoId", 'CLINICO')
    and "papelDestino" = public.papel_atual()
  );

create or replace function public.governar_reconhecimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  -- Sem sessão é o operador com a chave de serviço, que já ignora política.
  -- Recusar aqui não defenderia nada e quebraria manutenção.
  if eu is null then
    return new;
  end if;

  /*
    O conteúdo clínico é imutável por esta porta.

    O alerta é a conduta que outro profissional vai seguir. Se `orientacao`
    pudesse ser editada por quem recebe, o registro deixaria de ser o que a
    regra disse e passaria a ser o que o leitor preferiu ler.
  */
  if new."alunoId" is distinct from old."alunoId"
     or new."papelDestino" is distinct from old."papelDestino"
     or new.severidade is distinct from old.severidade
     or new.regra is distinct from old.regra
     or new.titulo is distinct from old.titulo
     or new.orientacao is distinct from old.orientacao
     or new."marcadorOrigem" is distinct from old."marcadorOrigem"
     or new."exameId" is distinct from old."exameId"
     or new."condicaoId" is distinct from old."condicaoId"
     or new."criadoEm" is distinct from old."criadoEm" then
    raise exception 'Alerta clínico não se edita: reconhece-se.' using errcode = '42501';
  end if;

  -- Quem reconheceu é quem está pedindo, e não quem o cliente disser que foi.
  if new."reconhecidoEm" is not null and old."reconhecidoEm" is null then
    new."reconhecidoEm" := now();
    new."reconhecidoPorId" := eu;
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_reconhecimento on public."AlertaClinico";
create trigger governar_reconhecimento
  before update on public."AlertaClinico"
  for each row execute function public.governar_reconhecimento();

/*
  As colunas que o `authenticated` alcança.

  `marcadorOrigem` e `exameId` seguem legíveis aqui — o que decide se eles
  existem na linha é o gatilho que a criou, e para quem não pode vê-los a
  coluna já está nula. Ver `13-colunas-sensiveis.sql`.
*/
grant select, update on public."AlertaClinico" to authenticated;
revoke insert, delete on public."AlertaClinico" from authenticated, anon;
