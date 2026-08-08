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

export default function CarteiraDeAlunos() {
  const [vinculos, setVinculos] = useState<VinculoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [emailConvite, setEmailConvite] = useState('');
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
      })
      .catch(() => undefined);
  }, []);

  async function convidar(evento: React.FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    try {
      await sdk.vinculos.convidar(emailConvite);
      setEmailConvite('');
      setMensagem('Convite enviado. O aluno precisa aceitar para o vínculo ficar ativo.');
      await recarregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível convidar.');
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
          <Botao type="submit">Convidar</Botao>
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
        {ativos.length === 0 && !carregando && (
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
