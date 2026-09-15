-- Cadastro: a conta do Supabase Auth vira usuário do Vívio.
--
-- Quem fazia isto era o AuthService do Nest, em duas escritas na mesma
-- transação: `User` mais o perfil. Sem API, o cadastro passa a ser
-- `supabase.auth.signUp`, e o que sobra — a linha em `public."User"` e o perfil
-- — nasce daqui, por gatilho em `auth.users`.
--
-- Gatilho e não chamada do app, pela mesma razão dos alertas: cadastro que
-- depende de o cliente lembrar de fazer a segunda metade é cadastro que um dia
-- fica pela metade, com a pessoa dentro do Auth e invisível para o sistema.
--
-- ## O metadado é do cliente, e por isso não se acredita nele
--
-- `raw_user_meta_data` é o que o navegador mandou em `signUp`. Qualquer pessoa
-- pode pôr `{"papel":"ADMIN"}` ali. Então o papel passa por lista fechada, e o
-- status do profissional é imposto aqui, não lido: ninguém vira médico
-- preenchendo formulário, e ninguém vira admin de jeito nenhum — ADMIN só
-- existe por dentro do banco, com quem responde por isso.

create or replace function public.criar_usuario_vivio()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_papel text;
  v_nome text;
  v_email text := lower(trim(new.email));
begin
  if v_email is null or v_email = '' then
    return new;
  end if;

  /*
    Já existe com este e-mail? É a semente, ou um cadastro refeito depois de o
    Auth apagar a conta. Não duplica: o `User` é o dono do histórico, e criar um
    segundo deixaria treino, medida e exame órfãos do primeiro.
  */
  if exists (select 1 from public."User" u where lower(u.email) = v_email) then
    return new;
  end if;

  -- Lista fechada. Qualquer outra coisa vira ALUNO, que é o papel sem poder.
  v_papel := upper(coalesce(meta ->> 'papel', 'ALUNO'));
  if v_papel not in ('ALUNO', 'PERSONAL', 'NUTRICIONISTA', 'MEDICO') then
    v_papel := 'ALUNO';
  end if;

  v_nome := nullif(trim(coalesce(meta ->> 'nome', '')), '');
  if v_nome is null then
    v_nome := split_part(v_email, '@', 1);
  end if;

  /*
    O id é o do Auth. Os antigos são cuid porque nasceram no Prisma, e a ponte
    entre os dois é o hook de token, que casa por e-mail. Daqui para a frente
    os dois lados têm o MESMO id — que é o que um dia deixa o hook ser
    apagado em vez de mantido para sempre.
  */
  insert into public."User" (id, email, nome, telefone, papel, status, "criadoEm", "atualizadoEm")
  values (
    new.id::text,
    v_email,
    v_nome,
    nullif(trim(coalesce(meta ->> 'telefone', '')), ''),
    v_papel::"Papel",
    case
      -- Profissional entra e vê o próprio cadastro, mas não recebe vínculo
      -- antes de o admin conferir o registro no conselho.
      when v_papel = 'ALUNO' then 'ATIVA'::"StatusConta"
      else 'PENDENTE_VERIFICACAO'::"StatusConta"
    end,
    now(), now()
  );

  if v_papel = 'ALUNO' then
    insert into public."PerfilAluno" (
      "userId", "dataNascimento", "sexoBiologico", "alturaCm", objetivo, "criadoEm", "atualizadoEm"
    ) values (
      new.id::text,
      -- Data de nascimento é obrigatória na tabela e o app a pede no cadastro.
      -- Se vier vazia, a conta ainda tem de nascer: a alternativa é o gatilho
      -- estourar e a pessoa ficar presa dentro do Auth, sem usuário nenhum.
      coalesce((meta ->> 'dataNascimento')::date, date '1900-01-01'),
      nullif(trim(coalesce(meta ->> 'sexoBiologico', '')), ''),
      nullif(meta ->> 'alturaCm', '')::int,
      nullif(trim(coalesce(meta ->> 'objetivo', '')), ''),
      now(), now()
    );
  else
    insert into public."PerfilProfissional" (
      "userId", tipo, "registroConselho", "ufRegistro", especialidades, bio, "criadoEm", "atualizadoEm"
    ) values (
      new.id::text,
      v_papel::"Papel",
      trim(coalesce(meta ->> 'registroConselho', '')),
      upper(trim(coalesce(meta ->> 'ufRegistro', ''))),
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(
          case jsonb_typeof(meta -> 'especialidades')
            when 'array' then meta -> 'especialidades'
            else '[]'::jsonb
          end) x),
        array[]::text[]
      ),
      nullif(trim(coalesce(meta ->> 'bio', '')), ''),
      now(), now()
    );
  end if;

  return new;
end;
$funcao$;

drop trigger if exists criar_usuario_vivio on auth.users;
create trigger criar_usuario_vivio
  after insert on auth.users
  for each row execute function public.criar_usuario_vivio();

/*
  Confirmação de e-mail liga a conta do aluno.

  O aluno já nasce ATIVA porque o produto o deixa usar antes de confirmar; o
  profissional não — para ele, confirmar o e-mail não é o que falta, é o admin
  conferir o conselho. Por isso este gatilho só mexe em quem está
  PENDENTE_VERIFICACAO **e é aluno**.
*/
create or replace function public.ativar_conta_confirmada()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public."User"
       set status = 'ATIVA', "emailVerifEm" = new.email_confirmed_at, "atualizadoEm" = now()
     where id = new.id::text
       and papel = 'ALUNO'
       and status = 'PENDENTE_VERIFICACAO';
  end if;
  return new;
end;
$funcao$;

drop trigger if exists ativar_conta_confirmada on auth.users;
create trigger ativar_conta_confirmada
  after update of email_confirmed_at on auth.users
  for each row execute function public.ativar_conta_confirmada();
