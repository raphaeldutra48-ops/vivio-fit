-- Check-in diário: quem escreve, e até que dia para trás.
--
-- ## A regra que o aluno tem interesse em burlar
--
-- Esquecer de registrar ontem é comum, e proibir seria irritante. Mas
-- preencher três meses de uma vez, retroativamente, transformaria a adesão num
-- número que a pessoa ESCREVE em vez de um que ela vive — e é justamente
-- desse número que o personal tira a decisão de ligar ou não.
--
-- Era uma checagem no serviço. Sem API, ela precisa estar onde o cliente não
-- alcança: quem quer contornar a janela é quem escreve o pedido.

create or replace function public.governar_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  hoje date := (now() at time zone 'utc')::date;
begin
  /*
    Um dia de folga para o futuro, e não zero.

    Quem está em fuso à frente do UTC — não é o caso do Brasil, mas o app não é
    só do Brasil — veria o próprio "hoje" recusado como se fosse amanhã.
  */
  if new.data > hoje + 1 then
    raise exception 'Não dá para fazer check-in de um dia que ainda não veio.'
      using errcode = '22007';
  end if;

  if new.data < hoje - 3 then
    raise exception 'Só dá para registrar os últimos 3 dias. Para corrigir algo mais antigo, fale com seu profissional.'
      using errcode = '22007';
  end if;

  /*
    Dor sem local é aceitável — nem sempre a pessoa sabe dizer onde. Local sem
    dor é contradição, e ficaria guardado para sempre; some aqui em vez de
    depender de a tela lembrar de limpar o campo ao desmarcar.
  */
  if not new."teveDor" then
    new."localDor" := null;
  end if;

  new."atualizadoEm" := now();
  return new;
end;
$funcao$;

drop trigger if exists governar_checkin on public."CheckinDiario";
create trigger governar_checkin
  before insert or update on public."CheckinDiario"
  for each row execute function public.governar_checkin();

/*
  Alterar o próprio check-in é o caminho de corrigir: quem marcou "não treinei"
  de manhã e treinou à noite precisa poder consertar. A política de INSERT já
  existe em `07-politicas-escrita.sql`, com o escopo EVOLUCAO; falta o UPDATE,
  que o `upsert` usa quando o dia já tem registro.
*/
drop policy if exists checkin_altera on public."CheckinDiario";
create policy checkin_altera on public."CheckinDiario" for update
  using (public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array[]::text[]))
  with check (public.pode_escrever_do_aluno("alunoId", 'EVOLUCAO', array[]::text[]));

grant select, insert, update on public."CheckinDiario" to authenticated;
-- Apagar check-in seria apagar a adesão que ele mede.
revoke delete on public."CheckinDiario" from authenticated, anon;
