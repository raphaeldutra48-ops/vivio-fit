-- Cobrança: quem cobra, quem dá baixa e o que não se reescreve.
--
-- ## A linha que separa este grupo dos outros
--
-- Em quase todo o resto, o titular do dado escreve junto de quem o acompanha:
-- o aluno registra o próprio treino, a própria medida, o próprio copo de água.
-- Aqui não. A cobrança é do PROFISSIONAL — quem a cria, quem dá baixa e quem
-- estorna é ele. O aluno LÊ a dele, e a política de leitura já dizia isso.
--
-- A diferença importa porque o erro possível é de um tipo diferente: com uma
-- política de escrita frouxa, o aluno marcaria a própria mensalidade como paga
-- e o profissional só descobriria conferindo o extrato.
--
-- ## O que vira gatilho
--
-- Duas transições que um `with check` não enxerga, porque dependem do estado
-- ANTERIOR:
--
--   * cobrança paga não se cancela — estorna-se antes. Cancelar por cima
--     perderia o registro de que o dinheiro entrou;
--   * sair de PAGA limpa `pagaEm` e `formaPagamento`. Deixar os dois para trás
--     faria a cobrança estornada continuar dizendo "recebido em 05/03, no PIX".
--
-- E o congelamento do que já foi pago: valor, descrição e vencimento de uma
-- cobrança PAGA são o que foi combinado e quitado. Mudá-los depois reescreve
-- um recibo.

drop policy if exists cobranca_escreve on public."Cobranca";
create policy cobranca_escreve on public."Cobranca" for insert
  with check (
    "profissionalId" = public.usuario_atual()
    and public.papel_atual() in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO')
    -- Cobrar quem não é seu aluno é cobrar um estranho.
    and exists (
      select 1 from public."Vinculo" v
      where v."alunoId" = "Cobranca"."alunoId"
        and v."profissionalId" = public.usuario_atual()
        and v.status = 'ATIVO'
    )
  );

/*
  Alterar e apagar: só o dono da cobrança. O aluno não entra aqui.
*/
drop policy if exists cobranca_altera on public."Cobranca";
create policy cobranca_altera on public."Cobranca" for update
  using ("profissionalId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual());

drop policy if exists cobranca_apaga on public."Cobranca";
create policy cobranca_apaga on public."Cobranca" for delete
  using (
    "profissionalId" = public.usuario_atual()
    /*
      Cobrança paga não se apaga nem pelo dono: ela é o registro de um dinheiro
      que entrou. Apagar a série inteira de parcelas tem de deixar para trás
      exatamente as que já foram quitadas.
    */
    and status <> 'PAGA'
  );

create or replace function public.governar_cobranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."atualizadoEm" := now();

  if tg_op = 'INSERT' then
    if public.usuario_atual() is not null then
      new."profissionalId" := public.usuario_atual();
    end if;
    return new;
  end if;

  new."profissionalId" := old."profissionalId";
  new."alunoId" := old."alunoId";
  new."loteId" := old."loteId";
  new."criadoEm" := old."criadoEm";

  if old.status = 'PAGA' then
    if new.status = 'CANCELADA' then
      raise exception 'Cobrança paga não pode ser cancelada. Estorne antes.'
        using errcode = '23505';
    end if;
    -- O que foi cobrado e quitado é o que foi cobrado e quitado.
    new."valorCentavos" := old."valorCentavos";
    new.descricao := old.descricao;
    new.vencimento := old.vencimento;
  end if;

  -- Estornar apaga a baixa junto: uma cobrança pendente que ainda diz
  -- "recebido em 05/03, no PIX" é pior que uma sem informação nenhuma.
  if new.status <> 'PAGA' then
    new."pagaEm" := null;
    new."formaPagamento" := null;
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_cobranca on public."Cobranca";
create trigger governar_cobranca
  before insert or update on public."Cobranca"
  for each row execute function public.governar_cobranca();

grant select, insert, update, delete on public."Cobranca" to authenticated;

-- --------------------------------------------------------------------------
-- Chave PIX: do dono, sem exceção.
--
-- A leitura já era só dele. A escrita segue a mesma regra, e o gatilho garante
-- que a linha não muda de dono — a chave PIX gravada aqui é o que vai no
-- "copia e cola" que o aluno paga.
-- --------------------------------------------------------------------------
drop policy if exists dadospagamento_escreve on public."DadosDePagamento";
create policy dadospagamento_escreve on public."DadosDePagamento" for all
  using ("profissionalId" = public.usuario_atual())
  with check ("profissionalId" = public.usuario_atual());

create or replace function public.governar_dados_de_pagamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  new."atualizadoEm" := now();
  if tg_op = 'INSERT' and public.usuario_atual() is not null then
    new."profissionalId" := public.usuario_atual();
  end if;
  if tg_op = 'UPDATE' then
    new."profissionalId" := old."profissionalId";
  end if;
  return new;
end;
$funcao$;

drop trigger if exists governar_dados_de_pagamento on public."DadosDePagamento";
create trigger governar_dados_de_pagamento
  before insert or update on public."DadosDePagamento"
  for each row execute function public.governar_dados_de_pagamento();

grant select, insert, update, delete on public."DadosDePagamento" to authenticated;
