-- O disparo dos lembretes, dentro do banco.
--
-- Morava na API: `lembretes.scheduler.ts` varria a cada minuto, com
-- `@nestjs/schedule`, o que estava na hora no fuso de cada aluno. Quando a API
-- saiu do repositório, a varredura foi junto e nada tomou o lugar — a tela de
-- lembretes continuava salvando horário, e nenhum lembrete nascia. Falha do
-- tipo mais caro: tudo parece funcionar.
--
-- O `29-lembrete.sql` já dizia o destino ("vai virar rotina agendada do lado do
-- Supabase quando a API morrer"). É esta: uma função que faz a conta e o
-- `pg_cron` chamando a cada minuto.
--
-- ## O que ela faz, e o que ainda não faz
--
-- Cria a `Notificacao` — a caixa de avisos do app mostra. A ENTREGA no aparelho
-- não existe: o aplicativo nunca registra token de push (não há
-- `expo-notifications` nele), e a API só tinha um driver que escrevia no log e
-- marcava "enviada". Aqui a linha diz a verdade: `enviadaEm` fica nulo e `erro`
-- conta por quê (`SEM_DISPOSITIVO` ou `PUSH_NAO_CONFIGURADO`). É a pendência 10.

create extension if not exists pg_cron with schema pg_catalog;

/*
  `p_agora` é parâmetro pelo mesmo motivo que era na API: horário injetado é o
  que torna a regra verificável sem esperar o relógio.
*/
create or replace function public.disparar_lembretes_devidos(p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  c record;
  v_fuso text;
  v_local timestamp;
  v_dia date;
  v_titulo text;
  v_corpo text;
  v_id text;
  v_criadas integer := 0;
begin
  for c in
    select cl."alunoId" as aluno,
           cl.tipo::text as tipo,
           cl.horarios,
           cl."diasDaSemana" as dias,
           coalesce(pa.timezone, 'America/Sao_Paulo') as fuso
      from public."ConfiguracaoLembrete" cl
      join public."User" u on u.id = cl."alunoId" and u."deletadoEm" is null
      left join public."PerfilAluno" pa on pa."userId" = cl."alunoId"
     where cl.ativo
       and 'PUSH' = any(cl.canais)
  loop
    /*
      O horário é o do fuso DELE: "07:30" em Noronha e em Rio Branco são
      instantes diferentes. Fuso que o Postgres não reconhece cai no padrão do
      cadastro em vez de derrubar a varredura de todo mundo por uma linha.
    */
    v_fuso := c.fuso;
    begin
      v_local := p_agora at time zone v_fuso;
    exception when others then
      v_fuso := 'America/Sao_Paulo';
      v_local := p_agora at time zone v_fuso;
    end;
    v_dia := v_local::date;

    continue when not (to_char(v_local, 'HH24:MI') = any(c.horarios));
    -- Lista de dias vazia é "todos os dias"; 1 = segunda … 7 = domingo.
    continue when cardinality(c.dias) > 0
              and not (extract(isodow from v_local)::int = any(c.dias));

    /*
      Lembrar de treinar quem já treinou é ruído. O "hoje" é o dia LOCAL, com
      as bordas convertidas para UTC, que é como `iniciadoEm` é gravado.

      A API comparava o dia local com as bordas do dia em UTC: o treino das 22h
      de ontem em São Paulo (01h de hoje em UTC) calava o lembrete de hoje.
    */
    if c.tipo = 'TREINO' and exists (
      select 1 from public."ExecucaoTreino" e
       where e."alunoId" = c.aluno
         and e."iniciadoEm" >= (v_dia::timestamp at time zone v_fuso) at time zone 'UTC'
         and e."iniciadoEm" <  ((v_dia + 1)::timestamp at time zone v_fuso) at time zone 'UTC'
    ) then
      continue;
    end if;

    -- Os textos são os de `PREVIA_LEMBRETE`, em `@vivio/contracts`; o teste
    -- deste arquivo compara um com o outro, para a tela de configuração não
    -- prometer uma frase e o aviso chegar com outra.
    select t.titulo, t.corpo into v_titulo, v_corpo
      from (values
        ('TREINO',   'Hora de treinar 💪',  'Seu treino de hoje está esperando.'),
        ('REFEICAO', 'Hora da refeição 🍽', 'Não pule esta refeição do seu plano.'),
        ('AGUA',     'Bebeu água? 💧',      'Você está atrás da sua meta de hoje.'),
        ('CONSULTA', 'Consulta chegando',   'Seu atendimento começa em breve.'),
        ('MENSAGEM', 'Nova mensagem',       'Um profissional falou com você.')
      ) as t(tipo, titulo, corpo)
     where t.tipo = c.tipo;

    /*
      A única (userId, tipo, referenteA) é a defesa contra duplicata: duas
      varreduras no mesmo minuto, ou uma atrasada, geram um aviso só.
    */
    v_id := null;
    insert into public."Notificacao"
      (id, "userId", tipo, titulo, corpo, deeplink, "referenteA", "agendadaPara", "falhaEm", erro)
    values (
      gen_random_uuid()::text,
      c.aluno,
      c.tipo::"TipoLembrete",
      v_titulo,
      v_corpo,
      case when c.tipo = 'TREINO' then 'viviofit://treino' end,
      v_dia,
      p_agora at time zone 'UTC',
      now() at time zone 'UTC',
      case
        when exists (
          select 1 from public."TokenDispositivo" d where d."userId" = c.aluno and d.ativo
        ) then 'PUSH_NAO_CONFIGURADO'
        else 'SEM_DISPOSITIVO'
      end
    )
    on conflict ("userId", tipo, "referenteA") do nothing
    returning id into v_id;

    if v_id is not null then
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  return v_criadas;
end;
$funcao$;

/*
  Ninguém do app dispara: quem chama é o agendador, como `postgres`. Um aluno
  que pudesse chamar escolheria o `p_agora` e fabricaria o aviso de qualquer
  dia.
*/
revoke execute on function public.disparar_lembretes_devidos(timestamptz) from public, anon, authenticated;

-- A cada minuto. Agendar de novo com o mesmo nome substitui, então reaplicar
-- este arquivo não empilha rotinas.
select cron.schedule(
  'vivio-disparar-lembretes',
  '* * * * *',
  'select public.disparar_lembretes_devidos()'
);
