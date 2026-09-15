-- Pedir dado a um colega, sem sair do app.
--
-- ## O problema real
--
-- O consentimento pode ser dado a UM profissional. A Ana autoriza o médico a
-- ver o clínico e não autoriza mais ninguém — o que é o certo, e é o que a
-- LGPD chama de finalidade específica. Só que a nutricionista precisa do exame
-- para ajustar a carga proteica, e hoje o caminho que existe de verdade é o
-- médico mandar um print no WhatsApp: fora do sistema, sem registro, sem prazo
-- e sem como revogar.
--
-- Este arquivo põe esse caminho para dentro. Quem pede, pede; quem detém,
-- autoriza; o aluno vê tudo e pode desligar.
--
-- ## O que o banco confere sozinho
--
-- "Confirmar que o colega também cuida daquele cliente" não é um checkbox de
-- confiança: os dois vínculos são conferidos aqui, na hora de pedir e de novo
-- na hora de aprovar. O detentor decide se compartilha; ele não decide se o
-- outro atende a pessoa — isso é fato, e o fato mora no banco.

alter table public."SolicitacaoDeAcesso" enable row level security;
alter table public."SolicitacaoDeAcesso" force row level security;

/*
  Leitura: os três lados.

  O aluno entra na lista por direito, não por cortesia. É dado sobre ele sendo
  movimentado entre profissionais; se ele não pudesse ver, o compartilhamento
  seria só o print do WhatsApp com outro nome.
*/
drop policy if exists solicitacaoacesso_le on public."SolicitacaoDeAcesso";
create policy solicitacaoacesso_le on public."SolicitacaoDeAcesso" for select using (
  "solicitanteId" = public.usuario_atual()
  or "detentorId" = public.usuario_atual()
  or "alunoId" = public.usuario_atual()
);

/*
  Pedir.

  Só o próprio solicitante cria o pedido dele — ninguém pede em nome de outro.
  Nasce PENDENTE, e os dois profissionais precisam de vínculo ATIVO com o
  aluno: pedir não pode virar porta de entrada para paciente que você não
  atende.

  Não passa por `pode_ler_do_aluno` de propósito. Se passasse, só conseguiria
  pedir quem já podia ler — e o pedido existe justamente para quem não pode.
*/
/*
  A pergunta composta que a política do pedido de acesso precisa.

  A política precisava de `vinculo_de` para os DOIS lados, e `vinculo_de` está
  revogada. Esta função responde só a pergunta inteira — "posso pedir a este
  colega, sobre este aluno?" — em vez de emprestar a peça genérica.

  Ela devolve, de fato, se o detentor atende o aluno. Isso não abre nada novo:
  a política de `Vinculo` abaixo já mostra a equipe de cuidado a quem faz parte
  dela.
*/
create or replace function public.pode_pedir_acesso(p_aluno_id text, p_detentor_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_atual() is not null
     and public.papel_atual() in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO')
     and p_detentor_id <> public.usuario_atual()
     -- Quem pede tem de atender o aluno. Pedir não é porta de entrada.
     and public.vinculo_de(public.usuario_atual(), p_aluno_id)
     -- E quem vai autorizar também.
     and public.vinculo_de(p_detentor_id, p_aluno_id)
$$;

drop policy if exists solicitacaoacesso_pede on public."SolicitacaoDeAcesso";
create policy solicitacaoacesso_pede on public."SolicitacaoDeAcesso" for insert
  with check (
    "solicitanteId" = public.usuario_atual()
    and status = 'PENDENTE'
    and "revogadoEm" is null
    /*
      Papel, os dois vinculos e "nao e voce mesmo" moram em `pode_pedir_acesso`,
      e nao soltos aqui, porque a politica precisaria chamar `vinculo_de`
      diretamente — e funcao chamada do corpo de uma politica roda como quem
      pede, o que obrigaria a expor `vinculo_de` a todo mundo. Ela responde
      sobre TERCEIROS, e nao deve ser exposta.
    */
    and public.pode_pedir_acesso("alunoId", "detentorId")
  );

/*
  Responder e revogar.

  A política diz QUEM pode encostar na linha; o gatilho abaixo diz o que cada
  um pode mudar. A divisão não é estilo: política não enxerga o valor ANTIGO da
  linha, e sem o valor antigo não dá para escrever "de PENDENTE só se sai para
  APROVADA ou RECUSADA, e só pelo detentor".
*/
drop policy if exists solicitacaoacesso_responde on public."SolicitacaoDeAcesso";
create policy solicitacaoacesso_responde on public."SolicitacaoDeAcesso" for update
  using (
    "solicitanteId" = public.usuario_atual()
    or "detentorId" = public.usuario_atual()
    or "alunoId" = public.usuario_atual()
  )
  with check (
    "solicitanteId" = public.usuario_atual()
    or "detentorId" = public.usuario_atual()
    or "alunoId" = public.usuario_atual()
  );

-- Sem política de DELETE: recusa e revogação são histórico. A tela esconde, o
-- banco guarda — é o que responde "quem teve acesso ao meu exame, e até quando".

create or replace function public.governar_solicitacao_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
begin
  /*
    Conexão sem sessão é o operador com a chave de serviço, e ele já ignora
    toda política por `bypassrls`. Recusar aqui não defenderia nada — quem tem
    a chave também tem `alter table ... disable trigger` — e quebraria correção
    de linha errada e migração. Então passa, e o carimbo de tempo abaixo
    continua sendo posto para a linha não ficar incoerente.

    Quem defende contra o profissional é a política, que sempre roda com token.
  */
  if eu is null then
    if new.status is distinct from old.status then
      if new.status in ('APROVADA', 'RECUSADA') then new."respondidaEm" := now(); end if;
      if new.status = 'REVOGADA' then new."revogadoEm" := now(); end if;
    end if;
    return new;
  end if;

  /*
    O que ninguém remenda depois.

    Trocar o escopo de uma solicitação já aprovada seria transformar "pode ver
    o treino" em "pode ver o prontuário" sem passar por ninguém. Trocar o aluno
    seria pior. A resposta é sim ou não ao pedido que foi feito; querer outra
    coisa é fazer outro pedido.
  */
  if new."alunoId" is distinct from old."alunoId"
     or new."solicitanteId" is distinct from old."solicitanteId"
     or new."detentorId" is distinct from old."detentorId"
     or new.escopo is distinct from old.escopo
     or new.justificativa is distinct from old.justificativa
     or new."criadoEm" is distinct from old."criadoEm" then
    raise exception 'Pedido de acesso não se edita: responde-se.' using errcode = '42501';
  end if;

  -- Prazo é decisão de quem concede.
  if new."expiraEm" is distinct from old."expiraEm" and eu <> old."detentorId" then
    raise exception 'Só quem autorizou muda o prazo.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    -- RECUSADA e REVOGADA são terminais. Reabrir por UPDATE seria ressuscitar
    -- um acesso que alguém desligou; quem quiser de novo, pede de novo.
    if old.status in ('RECUSADA', 'REVOGADA') then
      raise exception 'Este pedido já foi encerrado.' using errcode = '42501';
    end if;

    if new.status in ('APROVADA', 'RECUSADA') then
      if old.status <> 'PENDENTE' then
        raise exception 'Só um pedido pendente pode ser respondido.' using errcode = '42501';
      end if;
      if eu <> old."detentorId" then
        raise exception 'Só o profissional que detém o dado responde.' using errcode = '42501';
      end if;
      /*
        Confere os vínculos DE NOVO, na aprovação.

        Entre pedir e responder pode ter passado um mês, e o solicitante pode
        ter deixado de atender o aluno nesse meio. Aprovar sem reconferir seria
        abrir prontuário para ex-profissional.
      */
      if new.status = 'APROVADA' then
        if not public.vinculo_de(old."solicitanteId", old."alunoId") then
          raise exception 'Quem pediu não atende mais este aluno.' using errcode = '42501';
        end if;
        if not public.vinculo_de(old."detentorId", old."alunoId") then
          raise exception 'Você não atende mais este aluno.' using errcode = '42501';
        end if;
        -- Ninguém concede o que não tem.
        if not public.consentimento_de(old."detentorId", old."alunoId", old.escopo::text) then
          raise exception 'Você não tem consentimento do aluno para este escopo.' using errcode = '42501';
        end if;
      end if;
      new."respondidaEm" := now();

    elsif new.status = 'REVOGADA' then
      -- Os três desligam: o aluno porque o dado é dele, o detentor porque
      -- concedeu, o solicitante porque pode não precisar mais.
      if eu not in (old."alunoId", old."detentorId", old."solicitanteId") then
        raise exception 'Só quem participa do acordo pode desligá-lo.' using errcode = '42501';
      end if;
      new."revogadoEm" := now();

    else
      raise exception 'Transição de status inválida.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$funcao$;

drop trigger if exists governar_solicitacao on public."SolicitacaoDeAcesso";
create trigger governar_solicitacao
  before update on public."SolicitacaoDeAcesso"
  for each row execute function public.governar_solicitacao_de_acesso();

/*
  Um pedido pendente por vez, para o mesmo par, aluno e escopo.

  Sem isto, um clique repetido enche a caixa de entrada do colega com o mesmo
  pedido, e a decisão dele deixa de significar alguma coisa. Índice único
  parcial não cabe aqui porque a condição inclui só um dos valores do enum e o
  Prisma não o descreve; o gatilho diz o mesmo e diz por quê.
*/
create or replace function public.recusar_pedido_duplicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if exists (
    select 1 from public."SolicitacaoDeAcesso" s
    where s."alunoId" = new."alunoId"
      and s."solicitanteId" = new."solicitanteId"
      and s."detentorId" = new."detentorId"
      and s.escopo = new.escopo
      and s.status = 'PENDENTE'
  ) then
    raise exception 'Já existe um pedido seu aguardando resposta para este aluno e escopo.'
      using errcode = '23505';
  end if;
  return new;
end;
$funcao$;

drop trigger if exists sem_pedido_duplicado on public."SolicitacaoDeAcesso";
create trigger sem_pedido_duplicado
  before insert on public."SolicitacaoDeAcesso"
  for each row execute function public.recusar_pedido_duplicado();
