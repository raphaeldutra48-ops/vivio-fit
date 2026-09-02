-- Vínculo de cuidado: convidar e responder.
--
-- ## Por que função, e não política de escrita
--
-- Quase toda tabela deste banco recebe política e pronto: a linha é do aluno,
-- e as três condições decidem. Vínculo não. Ele é a RAIZ das três condições —
-- é ele que diz quem atende quem — e as regras dele são transições com
-- invariante, não permissões de linha:
--
--   * quem convidou não pode aceitar o próprio convite;
--   * um aluno tem no máximo UM profissional ativo por tipo;
--   * profissional sem registro conferido pelo admin não recebe vínculo;
--   * convidar exige achar alguém pelo e-mail — e ninguém pode ler `User`
--     pelo e-mail dos outros, nem deve poder.
--
-- Nada disso cabe num `with check`, que só enxerga a linha nova. Então não há
-- política de INSERT nem de UPDATE em `Vinculo`: ou passa por estas duas
-- funções, ou não acontece.
--
-- As mensagens são as mesmas que a API devolvia, palavra por palavra: as telas
-- já as mostram, e trocá-las por texto novo faria a tradução parecer regressão.

/*
  Ninguém vira profissional de alguém só preenchendo formulário.

  O admin confere o registro no conselho, e é `verificadoEm` que registra isso.
  A checagem mora numa função separada porque vale nos DOIS momentos: ao
  convidar e de novo ao aceitar — entre um e outro o admin pode ter recusado.
*/
create or replace function public.exigir_profissional_conferido(p_profissional_id text)
returns void
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if not exists (
    select 1 from public."PerfilProfissional" pp
    where pp."userId" = p_profissional_id and pp."verificadoEm" is not null
  ) then
    raise exception 'Este profissional ainda não teve o registro no conselho verificado.'
      using errcode = '42501';
  end if;
end;
$funcao$;

/*
  Convidar.

  Funciona nos dois sentidos — o aluno convida um profissional, o profissional
  convida um aluno — e é o papel de cada lado que decide qual é qual.

  `security definer` porque precisa achar a pessoa pelo e-mail. Vaza um bit
  ("existe conta com este e-mail"), e vaza de propósito: sem ele, convidar
  alguém que digitou o e-mail errado falharia sem dizer o que houve. É o mesmo
  bit que a API já devolvia, com a mesma mensagem.
*/
create or replace function public.convidar_vinculo(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  meu_papel text := public.papel_atual();
  convidado record;
  v_aluno_id text;
  v_profissional_id text;
  v_tipo text;
  existente record;
  v_id text;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  select u.id, u.papel::text as papel into convidado
  from public."User" u
  where lower(u.email) = lower(trim(p_email)) and u."deletadoEm" is null;

  if convidado.id is null then
    raise exception 'Usuário com este e-mail não encontrado.' using errcode = 'P0002';
  end if;
  if convidado.id = eu then
    raise exception 'Você não pode se vincular a si mesmo.' using errcode = '23505';
  end if;

  if meu_papel = 'ALUNO' then
    if convidado.papel not in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO') then
      raise exception 'Este e-mail não pertence a um profissional de saúde.' using errcode = '23505';
    end if;
    v_aluno_id := eu;
    v_profissional_id := convidado.id;
    v_tipo := convidado.papel;
  elsif meu_papel in ('PERSONAL', 'NUTRICIONISTA', 'MEDICO') then
    if convidado.papel <> 'ALUNO' then
      raise exception 'Este e-mail não pertence a um aluno.' using errcode = '23505';
    end if;
    v_aluno_id := convidado.id;
    v_profissional_id := eu;
    v_tipo := meu_papel;
  else
    raise exception 'Apenas alunos e profissionais criam vínculos.' using errcode = '42501';
  end if;

  perform public.exigir_profissional_conferido(v_profissional_id);

  select * into existente from public."Vinculo" v
  where v."alunoId" = v_aluno_id and v."profissionalId" = v_profissional_id;

  if existente.id is not null then
    if existente.status = 'ATIVO' then
      raise exception 'Este vínculo já está ativo.' using errcode = '23505';
    end if;
    if existente.status = 'PENDENTE' then
      raise exception 'Já existe um convite pendente para esta pessoa.' using errcode = '23505';
    end if;
    -- Encerrado ou recusado pode ser reaberto: o histórico anterior fica.
    update public."Vinculo"
       set status = 'PENDENTE', "convidadoPorId" = eu, "encerradoEm" = null, "atualizadoEm" = now()
     where id = existente.id;
    return existente.id;
  end if;

  v_id := gen_random_uuid()::text;
  insert into public."Vinculo" (
    id, "alunoId", "profissionalId", tipo, status, "convidadoPorId", "criadoEm", "atualizadoEm"
  ) values (
    v_id, v_aluno_id, v_profissional_id, v_tipo::"Papel", 'PENDENTE', eu, now(), now()
  );
  return v_id;
end;
$funcao$;

/*
  Responder: aceitar, recusar ou encerrar.

  Uma função só, porque as três compartilham a mesma pergunta inicial — "você é
  parte deste vínculo?" — e separá-las triplicaria essa checagem, que é
  exatamente o tipo de coisa que diverge com o tempo.
*/
create or replace function public.responder_vinculo(p_vinculo_id text, p_acao text)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  eu text := public.usuario_atual();
  v record;
  ja_tem text;
begin
  if eu is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  select * into v from public."Vinculo" where id = p_vinculo_id;
  if v.id is null or eu not in (v."alunoId", v."profissionalId") then
    -- Mesma resposta para "não existe" e "não é seu": distinguir contaria a
    -- quem não é parte que o vínculo existe.
    raise exception 'Vínculo não encontrado.' using errcode = 'P0002';
  end if;

  if p_acao = 'ACEITAR' then
    if v.status <> 'PENDENTE' then
      raise exception 'Este convite não está mais pendente.' using errcode = '23505';
    end if;
    -- Convite que quem mandou pudesse aceitar não seria convite.
    if v."convidadoPorId" = eu then
      raise exception 'Quem enviou o convite não pode aceitá-lo.' using errcode = '23505';
    end if;
    perform public.exigir_profissional_conferido(v."profissionalId");

    /*
      Um profissional ativo por tipo. Trocar de personal exige encerrar o
      anterior — e o histórico dele permanece, que é o ponto de encerrar em vez
      de apagar.
    */
    select id into ja_tem from public."Vinculo"
    where "alunoId" = v."alunoId" and tipo = v.tipo and status = 'ATIVO';
    if ja_tem is not null then
      raise exception 'Este aluno já possui um profissional ativo do tipo %. Encerre o vínculo atual antes.', v.tipo
        using errcode = '23505';
    end if;

    update public."Vinculo"
       set status = 'ATIVO', "iniciadoEm" = now(), "atualizadoEm" = now()
     where id = v.id;

  elsif p_acao = 'RECUSAR' then
    if v.status <> 'PENDENTE' then
      raise exception 'Este convite não está mais pendente.' using errcode = '23505';
    end if;
    update public."Vinculo" set status = 'RECUSADO', "atualizadoEm" = now() where id = v.id;

  elsif p_acao = 'ENCERRAR' then
    -- Qualquer um dos dois lados encerra. O histórico gerado não é apagado.
    if v.status <> 'ATIVO' then
      raise exception 'Este vínculo não está ativo.' using errcode = '23505';
    end if;
    update public."Vinculo"
       set status = 'ENCERRADO', "encerradoEm" = now(), "atualizadoEm" = now()
     where id = v.id;

  else
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;

  return v.id;
end;
$funcao$;

grant execute on function public.convidar_vinculo(text) to authenticated;
grant execute on function public.responder_vinculo(text, text) to authenticated;
revoke execute on function public.convidar_vinculo(text) from anon, public;
revoke execute on function public.responder_vinculo(text, text) from anon, public;
/*
  Esta é interna: responde sobre um profissional que não é quem pergunta, e
  serve só para as duas acima. Exposta, viraria "fulano já foi verificado?"
  para qualquer um.
*/
revoke execute on function public.exigir_profissional_conferido(text) from authenticated, anon, public;
