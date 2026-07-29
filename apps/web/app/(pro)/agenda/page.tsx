'use client';

import {
  DURACAO_PADRAO_MIN,
  ROTULO_STATUS,
  ROTULO_TIPO_COMPROMISSO,
  type CompromissoResumo,
  type HorarioLivre,
  type StatusCompromisso,
  type TipoCompromisso,
  type VinculoResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const hojeISO = () => new Date().toISOString().slice(0, 10);

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const COR_DO_STATUS: Record<StatusCompromisso, string> = {
  AGENDADO: 'var(--vv-texto-secundario)',
  CONFIRMADO: 'var(--vv-sucesso)',
  REALIZADO: 'var(--vv-sucesso)',
  CANCELADO: 'var(--vv-erro)',
  NAO_COMPARECEU: 'var(--vv-erro)',
};

export default function Agenda() {
  const [dia, setDia] = useState(hojeISO());
  const [compromissos, setCompromissos] = useState<CompromissoResumo[]>([]);
  const [livres, setLivres] = useState<HorarioLivre[]>([]);
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [alunoId, setAlunoId] = useState('');
  const [tipo, setTipo] = useState<TipoCompromisso>('AVALIACAO_FISICA');
  const [horarioEscolhido, setHorarioEscolhido] = useState<string | null>(null);
  const [local, setLocal] = useState('');
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const [doDia, vagas] = await Promise.all([
        sdk.agenda.listar({
          de: `${dia}T00:00:00.000Z`,
          ate: `${dia}T23:59:59.999Z`,
          incluirCancelados: false,
        }),
        sdk.agenda.horariosLivres(dia, DURACAO_PADRAO_MIN[tipo]),
      ]);
      setCompromissos(doDia);
      setLivres(vagas);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar a agenda.');
    }
  }, [dia, tipo]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then((lista) => {
        setAlunos(lista);
        setAlunoId((atual) => atual || (lista[0]?.contraparte.id ?? ''));
      })
      .catch(() => undefined);
  }, []);

  async function marcar() {
    if (!alunoId || !horarioEscolhido) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      await sdk.agenda.marcar({
        alunoId,
        tipo,
        inicioEm: new Date(horarioEscolhido),
        local: local || undefined,
      });
      setHorarioEscolhido(null);
      setMensagem('Atendimento marcado.');
      await recarregar();
    } catch (e) {
      // O 409 aqui vem da restrição do banco recusando sobreposição.
      setErro(
        e instanceof ErroApi && e.codigo === 'CONFLITO'
          ? e.message
          : 'Não foi possível marcar o atendimento.',
      );
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(id: string, status: StatusCompromisso) {
    try {
      await sdk.agenda.mudarStatus(id, { status });
      await recarregar();
    } catch {
      setErro('Não foi possível atualizar o status.');
    }
  }

  const seletor = {
    background: 'var(--vv-superficie)',
    borderColor: 'var(--vv-borda)',
    color: 'var(--vv-texto-primario)',
  };

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Avaliações, consultas e retornos. Horário ocupado não aceita outra marcação.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-md">
        <Campo rotulo="Dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Botao variante="neutra" onClick={() => setDia(hojeISO())}>
          Hoje
        </Botao>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mensagem && <Aviso tipo="info">{mensagem}</Aviso>}

      <div className="grid gap-xl lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold">
            {compromissos.length === 0
              ? 'Nenhum atendimento neste dia'
              : `${compromissos.length} ${compromissos.length === 1 ? 'atendimento' : 'atendimentos'}`}
          </h2>

          {compromissos.map((c) => (
            <Cartao key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <p className="text-lg font-bold tabular-nums">
                    {hora(c.inicioEm)} – {hora(c.fimEm)}
                  </p>
                  <p className="font-semibold">{c.aluno.nome}</p>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {ROTULO_TIPO_COMPROMISSO[c.tipo]}
                    {c.local && ` · ${c.local}`}
                  </p>
                </div>
                <Etiqueta texto={ROTULO_STATUS[c.status]} cor={COR_DO_STATUS[c.status]} />
              </div>

              {(c.status === 'AGENDADO' || c.status === 'CONFIRMADO') && (
                <div className="mt-md flex flex-wrap gap-sm">
                  <Botao variante="neutra" onClick={() => void mudarStatus(c.id, 'REALIZADO')}>
                    Marcar realizado
                  </Botao>
                  <Botao variante="neutra" onClick={() => void mudarStatus(c.id, 'NAO_COMPARECEU')}>
                    Não compareceu
                  </Botao>
                  <Botao variante="perigo" onClick={() => void mudarStatus(c.id, 'CANCELADO')}>
                    Cancelar
                  </Botao>
                </div>
              )}
            </Cartao>
          ))}
        </section>

        <aside className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold">Marcar atendimento</h2>

          <Cartao>
            <div className="flex flex-col gap-md">
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Aluno
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={seletor}
                  value={alunoId}
                  onChange={(e) => setAlunoId(e.target.value)}
                >
                  {alunos.length === 0 && <option value="">Nenhum aluno ativo</option>}
                  {alunos.map((v) => (
                    <option key={v.contraparte.id} value={v.contraparte.id}>
                      {v.contraparte.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Tipo
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={seletor}
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as TipoCompromisso);
                    setHorarioEscolhido(null);
                  }}
                >
                  {Object.entries(ROTULO_TIPO_COMPROMISSO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo} ({DURACAO_PADRAO_MIN[valor as TipoCompromisso]} min)
                    </option>
                  ))}
                </select>
              </label>

              <Campo
                rotulo="Local (opcional)"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Consultório, Online…"
              />

              <div className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Horários livres
                </span>
                {livres.length === 0 ? (
                  <Aviso tipo="info">
                    Nenhum horário livre neste dia. Defina sua janela de atendimento, ou escolha
                    outro dia.
                  </Aviso>
                ) : (
                  <div className="grid grid-cols-3 gap-xs">
                    {livres.map((h) => {
                      const escolhido = horarioEscolhido === h.inicioEm;
                      return (
                        <button
                          key={h.inicioEm}
                          type="button"
                          aria-pressed={escolhido}
                          onClick={() => setHorarioEscolhido(escolhido ? null : h.inicioEm)}
                          className="min-h-toque rounded-md border text-sm font-semibold tabular-nums"
                          style={{
                            borderColor: escolhido ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
                            background: escolhido ? 'var(--vv-acao-fundo)' : 'transparent',
                            color: escolhido ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
                          }}
                        >
                          {hora(h.inicioEm)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <Botao
                disabled={!alunoId || !horarioEscolhido || salvando}
                onClick={() => void marcar()}
              >
                {salvando ? 'Marcando…' : 'Marcar'}
              </Botao>
            </div>
          </Cartao>
        </aside>
      </div>
    </div>
  );
}
