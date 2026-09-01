'use client';

import { EscopoDado, type ResumoDoProfissional } from '@vivio/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao, EstadoVazio, Explicacao } from '../../../components/ui';
import { Sensivel } from '../../../lib/modo-discreto';
import { dataPorExtenso, haQuantoTempo, saudacao } from '../../../lib/saudacao';
import { sdk } from '../../../lib/sdk';
import { useSessao } from '../../../lib/sessao';

/**
 * A tela inicial do profissional.
 *
 * Ela responde **"quem precisa de mim hoje?"**, e não "quanto eu faturei". É a
 * escolha que separa este app dos oito produtos que serviram de referência: no
 * Prime Coaching, no MFit e no Trainer Club, cinco dos seis blocos da tela
 * inicial são dinheiro. A pergunta é legítima e o Vívio também tem financeiro —
 * mas em `/financeiro`, que é onde ela se decide. Quem abre o app às sete da
 * manhã está decidindo a quem escrever.
 *
 * O que aparece aqui, aparece porque leva a uma ação de hoje. Contador que só
 * enfeita ficou de fora.
 */

const NOME_DO_ESCOPO: Partial<Record<EscopoDado, string>> = {
  TREINO: 'Treino',
  NUTRICAO: 'Nutrição',
  CLINICO: 'Dados clínicos',
  EVOLUCAO: 'Evolução',
  MENSAGENS: 'Mensagens',
  LEITURA_AUTOMATICA: 'Leitura automática',
};

/** Faixa de seção, no mesmo espírito das do Prime: orienta sem ocupar. */
function Faixa({ children }: { children: string }) {
  return (
    <p
      className="rounded-pill px-md py-xs text-xs font-semibold tracking-wide"
      style={{
        background: 'var(--vv-superficie-elevada)',
        color: 'var(--vv-texto-secundario)',
        width: 'fit-content',
      }}
    >
      {children}
    </p>
  );
}

function Contador({
  rotulo,
  valor,
  href,
  explicacao,
  destaque,
}: {
  rotulo: string;
  valor: number;
  href?: string;
  explicacao?: string;
  destaque?: boolean;
}) {
  const conteudo = (
    <Cartao className="h-full">
      <p
        className="flex items-center gap-xs text-sm"
        style={{ color: 'var(--vv-texto-secundario)' }}
      >
        {rotulo}
        {explicacao && <Explicacao termo={rotulo}>{explicacao}</Explicacao>}
      </p>
      <p
        className="text-2xl font-bold tabular-nums"
        style={destaque && valor > 0 ? { color: 'var(--vv-alerta)' } : undefined}
      >
        {valor}
      </p>
      {href && (
        <p className="mt-xs text-sm" style={{ color: 'var(--vv-area-treino)' }}>
          ver detalhes →
        </p>
      )}
    </Cartao>
  );

  return href ? (
    <Link href={href} className="block">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

export default function Resumo() {
  const { usuario } = useSessao();
  const [dados, setDados] = useState<ResumoDoProfissional | null>(null);
  const [erro, setErro] = useState(false);
  const [agora, setAgora] = useState<Date | null>(null);

  /*
    A data vem depois da montagem, e não no primeiro render: o servidor não sabe
    o fuso de quem abriu, e renderizar "sexta-feira" no servidor com "quinta" no
    cliente quebra a hidratação — o React descarta a árvore inteira e a tela
    pisca.
  */
  useEffect(() => setAgora(new Date()), []);

  useEffect(() => {
    let ativo = true;
    sdk.resumo
      .doProfissional()
      .then((r) => ativo && setDados(r))
      .catch(() => ativo && setErro(true));
    return () => {
      ativo = false;
    };
  }, []);

  if (erro) return <Aviso tipo="erro">Não foi possível carregar o resumo.</Aviso>;

  return (
    <div className="flex flex-col gap-xl">
      <header>
        <h1 className="text-2xl font-bold">
          {agora ? saudacao(agora.getHours()) : 'Olá'}
          {usuario ? `, ${usuario.nome.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm first-letter:uppercase" style={{ color: 'var(--vv-texto-secundario)' }}>
          {agora ? dataPorExtenso(agora) : ' '}
        </p>
      </header>

      {/* Sem esqueleto falso: uma frase honesta enquanto a chamada volta. */}
      {!dados ? (
        <Cartao>
          <p style={{ color: 'var(--vv-texto-secundario)' }}>Carregando seu resumo…</p>
        </Cartao>
      ) : (
        <>
          <section className="flex flex-col gap-md">
            <Faixa>ACOMPANHAMENTO</Faixa>
            <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
              <Contador rotulo="Alunos ativos" valor={dados.alunosAtivos} href="/alunos" />
              <Contador
                rotulo="Convites pendentes"
                valor={dados.convitesPendentes}
                explicacao="Convites que você enviou e o aluno ainda não aceitou. Enquanto não aceitar, não há vínculo e nada pode ser prescrito."
              />
              <Contador
                rotulo="Sem treinar"
                valor={dados.sumidos.length}
                destaque
                explicacao="Alunos sem registrar treino há sete dias ou mais. Quem nunca registrou conta a partir do início do vínculo — quem entrou ontem não aparece aqui."
              />
              <Contador
                rotulo="Alertas clínicos"
                valor={dados.alertas.length}
                destaque
                explicacao="Alertas endereçados ao seu papel e ainda não reconhecidos. Nascem de exame ou de condição de saúde registrada."
              />
            </div>
          </section>

          {/*
            Antes de tudo o que é rotina: um alerta clínico pendente muda a
            conduta do treino e da dieta que vêm abaixo.
          */}
          {dados.alertas.length > 0 && (
            <section className="flex flex-col gap-md">
              <h2 className="text-lg font-semibold">Alertas para você</h2>
              <Cartao>
                <ul className="flex flex-col gap-md">
                  {dados.alertas.map((a) => (
                    <li key={a.alertaId} className="flex flex-wrap items-baseline justify-between gap-md">
                      <span>
                        <Link href={`/alunos/${a.alunoId}`} className="font-semibold underline">
                          {a.alunoNome}
                        </Link>
                        <span style={{ color: 'var(--vv-texto-secundario)' }}> · </span>
                        {/*
                          O título do alerta é o dado clínico — "Glicemia de
                          jejum elevada" identifica a pessoa tanto quanto o
                          número. O nome fica: sem ele o profissional não sabe a
                          quem a linha se refere e a lista perde a serventia.
                        */}
                        <Sensivel>{a.titulo}</Sensivel>
                      </span>
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {a.severidade.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            </section>
          )}

          {dados.autorizacoesPendentes.length > 0 && (
            <section className="flex flex-col gap-md">
              <h2 className="flex items-center gap-xs text-lg font-semibold">
                Esperando autorização do aluno
                <Explicacao termo="autorização do aluno">
                  Vínculo ativo não basta: pela LGPD, cada tipo de dado de saúde precisa de uma
                  autorização específica do titular. A decisão é do aluno e pode ser desfeita a
                  qualquer momento.
                </Explicacao>
              </h2>
              <Cartao>
                <p className="mb-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Enquanto o aluno não autorizar, os botões da ficha dele ficam desligados. Peça
                  para abrir o aplicativo em <strong>Minha equipe</strong> →{' '}
                  <strong>O que eu compartilho</strong>.
                </p>
                <ul className="flex flex-col gap-sm">
                  {dados.autorizacoesPendentes.map((p) => (
                    <li key={p.alunoId} className="flex flex-wrap items-baseline justify-between gap-md">
                      <Link href={`/alunos/${p.alunoId}`} className="font-semibold underline">
                        {p.nome}
                      </Link>
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        falta autorizar {p.faltando.map((e) => NOME_DO_ESCOPO[e] ?? e).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            </section>
          )}

          <section className="flex flex-col gap-md">
            <h2 className="text-lg font-semibold">Sem registrar treino</h2>
            <Cartao>
              {dados.sumidos.length === 0 ? (
                <EstadoVazio
                  icone="✅"
                  titulo="Ninguém sumido"
                  descricao="Todos os alunos que autorizaram os dados de treino registraram algo na última semana."
                />
              ) : (
                <ul className="flex flex-col gap-sm">
                  {dados.sumidos.map((a) => (
                    <li key={a.alunoId} className="flex flex-wrap items-baseline justify-between gap-md">
                      <Link href={`/alunos/${a.alunoId}`} className="font-semibold underline">
                        {a.nome}
                      </Link>
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {/*
                          Nunca ter treinado e ter parado de treinar pedem
                          conversas diferentes: um não começou, o outro
                          desistiu. Escrever "há 45 dias" nos dois casos faria o
                          profissional cobrar o primeiro por um treino que ele
                          nunca soube que existia.
                        */}
                        {a.diasSemTreinar === null
                          ? `nunca registrou · no plano ${haQuantoTempo(a.diasDeVinculo)}`
                          : `último treino ${haQuantoTempo(a.diasSemTreinar)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </section>

          <section className="flex flex-col gap-md">
            <Faixa>AGENDA</Faixa>
            <h2 className="text-lg font-semibold">Hoje</h2>
            <Cartao>
              {dados.agendaDeHoje.length === 0 ? (
                <EstadoVazio
                  icone="📅"
                  titulo="Nenhum compromisso hoje"
                  descricao="Marque avaliações, consultas e treinos acompanhados na agenda."
                  acao={
                    <Link href="/agenda">
                      <Botao variante="neutra">Abrir agenda</Botao>
                    </Link>
                  }
                />
              ) : (
                <ul className="flex flex-col gap-sm">
                  {dados.agendaDeHoje.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-md">
                      <span>
                        <span className="font-semibold tabular-nums">
                          {new Date(c.inicioEm).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>{' '}
                        {c.alunoNome}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {c.tipo.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </section>

          {dados.alunosAtivos === 0 && dados.convitesPendentes === 0 && (
            <Cartao>
              <EstadoVazio
                icone="👥"
                titulo="Você ainda não tem alunos"
                descricao="Convide pelo e-mail que o aluno usou para se cadastrar. Ele aceita no aplicativo e escolhe o que quer compartilhar com você."
                acao={
                  <Link href="/alunos">
                    <Botao>Convidar aluno</Botao>
                  </Link>
                }
              />
            </Cartao>
          )}
        </>
      )}
    </div>
  );
}
