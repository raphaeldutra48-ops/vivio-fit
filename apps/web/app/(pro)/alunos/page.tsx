'use client';

import {
  TEXTO_MOTIVO,
  motivoDeAtencao,
  type MotivoDeAtencao,
  type VinculoResumo,
} from '@vivio/contracts';
import { areaTemaClaro } from '@vivio/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';
import { fraseDeErro } from '../../../lib/erros';

export default function CarteiraDeAlunos() {
  const [vinculos, setVinculos] = useState<VinculoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [emailConvite, setEmailConvite] = useState('');
  const [convidando, setConvidando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  /**
   * Quem precisa de atencao, por aluno.
   *
   * Vem do relatorio da carteira, que ja cruza treino, check-in e
   * consentimento numa consulta so. Falha aqui NAO quebra a lista: sem o
   * alerta a tela continua util, e um erro de relatorio nao pode impedir o
   * profissional de ver os proprios alunos.
   */
  const [atencaoPorAluno, setAtencaoPorAluno] = useState<Map<string, MotivoDeAtencao>>(new Map());
  /*
    Falhar o relatório NÃO é "está todo mundo bem".

    O comentário acima diz que a falha não quebra a lista, e isso continua certo —
    mas sem o relatório NENHUM aluno aparece marcado, e a ausência de selo se lê
    como tranquilidade. Quem parou de treinar ou de fazer check-in é exatamente
    quem desaparece nesse silêncio. A lista segue útil; o que muda é a tela dizer
    que não conferiu.
  */
  const [falhouAAtencao, setFalhouAAtencao] = useState(false);

  async function recarregar() {
    setCarregando(true);
    try {
      setVinculos(await sdk.vinculos.meusAlunos());
      setErro(null);
    } catch {
      setErro('Não foi possível carregar seus alunos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void recarregar();

    sdk.relatorios
      .carteira(30)
      .then((r) => {
        const mapa = new Map<string, MotivoDeAtencao>();
        for (const linha of r.linhas) {
          const motivo = motivoDeAtencao(linha);
          if (motivo) mapa.set(linha.alunoId, motivo);
        }
        setAtencaoPorAluno(mapa);
        setFalhouAAtencao(false);
      })
      .catch(() => setFalhouAAtencao(true));
  }, []);

  async function convidar(evento: React.FormEvent) {
    evento.preventDefault();
    /*
      O botão ficava clicável durante o envio, e o campo só é limpo DEPOIS da
      resposta. Dois cliques — ou um Enter repetido, que é o que acontece quando
      a resposta demora — mandavam dois convites para o mesmo e-mail: o primeiro
      dá certo, o segundo volta como conflito, e a tela troca "Convite enviado"
      por uma frase de erro. O profissional conclui que não convidou.
    */
    if (convidando) return;
    setConvidando(true);
    setMensagem(null);
    try {
      await sdk.vinculos.convidar(emailConvite);
      setEmailConvite('');
      setMensagem('Convite enviado. O aluno precisa aceitar para o vínculo ficar ativo.');
      await recarregar();
    } catch (e) {
      setMensagem(fraseDeErro(e, 'Não foi possível convidar.'));
    } finally {
      setConvidando(false);
    }
  }

  const ativos = vinculos.filter((v) => v.status === 'ATIVO');
  const pendentes = vinculos.filter((v) => v.status === 'PENDENTE');

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Meus alunos</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          {ativos.length} {ativos.length === 1 ? 'aluno ativo' : 'alunos ativos'}
        </p>
      </div>

      <Cartao>
        <form onSubmit={convidar} className="flex flex-col gap-md sm:flex-row sm:items-end">
          <div className="flex-1">
            <Campo
              rotulo="Convidar aluno por e-mail"
              type="email"
              required
              value={emailConvite}
              onChange={(e) => setEmailConvite(e.target.value)}
              placeholder="aluno@exemplo.com"
            />
          </div>
          <Botao type="submit" disabled={convidando}>
            {convidando ? 'Convidando…' : 'Convidar'}
          </Botao>
        </form>
        {mensagem && (
          <div className="mt-md">
            <Aviso tipo="info">{mensagem}</Aviso>
          </div>
        )}
      </Cartao>

      {carregando && <Aviso tipo="info">Carregando…</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {pendentes.length > 0 && (
        <section className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold">Convites aguardando resposta</h2>
          {pendentes.map((v) => (
            <Cartao key={v.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{v.contraparte.nome}</p>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {v.contraparte.email}
                  </p>
                </div>
                <Etiqueta texto="Pendente" cor={areaTemaClaro.consultoria.texto} />
              </div>
            </Cartao>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-md">
        {/*
          `!erro`: sem ele, quem tem trinta alunos e está sem rede lê "Nenhum
          aluno ativo ainda. Convide alguém" — a frase de quem está começando.
        */}
        {/*
          Dito antes da lista, porque é a leitura dela que muda: sem o relatório,
          "Ativo" em todos os cartões quer dizer "não conferimos", e não "sem
          pendência".
        */}
        {falhouAAtencao && !erro && (
          <Aviso tipo="erro">
            Não foi possível conferir quem precisa de atenção. Os alunos abaixo aparecem todos como
            ativos porque o relatório não respondeu — recarregue para ver as pendências.
          </Aviso>
        )}

        {ativos.length === 0 && !carregando && !erro && (
          <Aviso tipo="info">
            Nenhum aluno ativo ainda. Convide alguém pelo e-mail acima para começar.
          </Aviso>
        )}
        {ativos.map((v) => (
          <Link key={v.id} href={`/alunos/${v.contraparte.id}`} className="block">
            <Cartao className="transition hover:opacity-80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{v.contraparte.nome}</p>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {v.contraparte.email}
                  </p>
                </div>
                {/*
                  O motivo, e não só uma cor. "Precisa de atenção" em vermelho
                  faz abrir a ficha para descobrir por quê; "parou de fazer
                  check-in" já diz qual conversa ter.
                */}
                {atencaoPorAluno.get(v.contraparte.id) ? (
                  <Etiqueta
                    texto={TEXTO_MOTIVO[atencaoPorAluno.get(v.contraparte.id)!]}
                    cor="var(--vv-alerta)"
                  />
                ) : (
                  <Etiqueta texto="Ativo" cor={areaTemaClaro.treino.texto} />
                )}
              </div>
            </Cartao>
          </Link>
        ))}
      </section>
    </div>
  );
}
