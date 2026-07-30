'use client';

import {
  ROTULO_STATUS_PRESCRICAO,
  descreverPosologia,
  type ModeloPrescricaoResumo,
  type PrescricaoResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  EditorDeItensPrescritos,
  type ItemEmEdicao,
} from '../../../../../components/EditorDeItensPrescritos';
import { Aviso, Botao, Cartao, Etiqueta } from '../../../../../components/ui';
import { sdk } from '../../../../../lib/sdk';

const hoje = () => new Date().toISOString().slice(0, 10);

const corDoStatus: Record<string, string> = {
  ATIVA: 'var(--vv-sucesso)',
  SUSPENSA: 'var(--vv-atencao)',
  ENCERRADA: 'var(--vv-texto-secundario)',
  SUBSTITUIDA: 'var(--vv-texto-secundario)',
};

export default function PrescricoesDoAluno() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const [prescricoes, setPrescricoes] = useState<PrescricaoResumo[]>([]);
  const [modelos, setModelos] = useState<ModeloPrescricaoResumo[]>([]);
  const [semConsentimento, setSemConsentimento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** null = fechado; string = id da prescrição sendo substituída; '' = nova. */
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState<string | null>(null);
  const [data, setData] = useState(hoje());
  const [validaAte, setValidaAte] = useState('');
  const [orientacoes, setOrientacoes] = useState('');
  const [itens, setItens] = useState<ItemEmEdicao[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      setPrescricoes(await sdk.prescricoes.listar(alunoId));
      setSemConsentimento(false);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') setSemConsentimento(true);
      else setErro('Não foi possível carregar as prescrições.');
    }
  };

  useEffect(() => {
    void carregar();
    sdk.modelosPrescricao
      .listar()
      .then(setModelos)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunoId]);

  function abrirNova() {
    setEmitindo('');
    setInstrucao(null);
    setErro(null);
    setData(hoje());
    setValidaAte('');
    setOrientacoes('');
    setItens([]);
  }

  /** Substituir parte do que já está valendo — o profissional ajusta a dose. */
  function abrirSubstituicao(p: PrescricaoResumo) {
    setEmitindo(p.id);
    setErro(null);
    setData(hoje());
    setValidaAte(p.validaAte ?? '');
    setOrientacoes(p.orientacoes ?? '');
    // Já vem com os itens atuais: quase sempre o que muda é uma dose.
    setItens(
      p.itens.map((i) => ({
        prescritivelId: i.prescritivelId,
        nome: i.nome,
        dose: i.dose ?? undefined,
        unidade: i.unidade ?? undefined,
        frequencia: i.frequencia ?? undefined,
        horarios: i.horarios,
        duracaoDias: i.duracaoDias ?? undefined,
        via: i.via ?? undefined,
        observacao: i.observacao ?? undefined,
      })),
    );
    setInstrucao('A versão anterior fica no histórico como substituída.');
  }

  function aplicarModelo(modelo: ModeloPrescricaoResumo) {
    setOrientacoes(modelo.orientacoes ?? '');
    setItens(
      modelo.itens.map((i) => ({
        prescritivelId: i.prescritivelId,
        nome: i.prescritivel.nome,
        dose: i.dose,
        unidade: i.unidade,
        frequencia: i.frequencia,
        horarios: i.horarios,
        duracaoDias: i.duracaoDias,
        via: i.via,
        observacao: i.observacao,
      })),
    );
  }

  async function emitir() {
    setErro(null);
    setSalvando(true);
    const corpo = {
      data: new Date(`${data}T12:00:00`),
      validaAte: validaAte ? new Date(`${validaAte}T12:00:00`) : undefined,
      orientacoes: orientacoes || undefined,
      itens: itens.map(({ nome: _nome, ...posologia }) => posologia),
    };
    try {
      if (emitindo) await sdk.prescricoes.substituir(alunoId, emitindo, corpo);
      else await sdk.prescricoes.emitir(alunoId, corpo);
      setEmitindo(null);
      setInstrucao(null);
      setItens([]);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível emitir a prescrição.');
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(p: PrescricaoResumo, status: 'SUSPENSA' | 'ENCERRADA' | 'ATIVA') {
    try {
      await sdk.prescricoes.mudarStatus(alunoId, p.id, { status });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível alterar o status.');
    }
  }

  if (semConsentimento) {
    return (
      <div className="flex flex-col gap-lg">
        <Link href={`/alunos/${alunoId}`} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          ← Voltar à ficha
        </Link>
        <Cartao>
          <p className="mb-xs font-semibold">Dados clínicos não compartilhados</p>
          <Aviso tipo="info">
            O paciente ainda não autorizou o compartilhamento dos dados clínicos. A autorização é
            dada por ele, no aplicativo, e vale apenas para o escopo que ele escolher.
          </Aviso>
        </Cartao>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xl">
      <Link href={`/alunos/${alunoId}`} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        ← Voltar à ficha
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Prescrições</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Prescrição não se edita: mudar a conduta gera uma versão nova e arquiva a anterior.
          </p>
        </div>
        <Botao onClick={() => (emitindo === null ? abrirNova() : setEmitindo(null))} variante={emitindo === null ? 'acao' : 'neutra'}>
          {emitindo === null ? '+ Nova prescrição' : 'Cancelar'}
        </Botao>
      </div>

      {emitindo !== null && (
        <div className="flex flex-col gap-md">
          <Cartao>
            <div className="grid gap-md sm:grid-cols-2">
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Data
                </span>
                <input
                  type="date"
                  className="min-h-toque rounded-md border px-md"
                  style={{
                    background: 'var(--vv-superficie)',
                    borderColor: 'var(--vv-borda)',
                    color: 'var(--vv-texto-primario)',
                  }}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Válida até (opcional)
                </span>
                <input
                  type="date"
                  className="min-h-toque rounded-md border px-md"
                  style={{
                    background: 'var(--vv-superficie)',
                    borderColor: 'var(--vv-borda)',
                    color: 'var(--vv-texto-primario)',
                  }}
                  value={validaAte}
                  onChange={(e) => setValidaAte(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-xs sm:col-span-2">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Orientações
                </span>
                <textarea
                  className="min-h-[80px] rounded-md border p-md"
                  style={{
                    background: 'var(--vv-superficie)',
                    borderColor: 'var(--vv-borda)',
                    color: 'var(--vv-texto-primario)',
                  }}
                  value={orientacoes}
                  onChange={(e) => setOrientacoes(e.target.value)}
                  placeholder="Como e quando tomar, o que observar, quando retornar."
                />
              </label>
            </div>

            {modelos.length > 0 && (
              <div className="mt-lg">
                <p className="mb-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Partir de um modelo
                </p>
                <div className="flex flex-wrap gap-sm">
                  {modelos.map((m) => (
                    <Botao key={m.id} variante="neutra" onClick={() => aplicarModelo(m)}>
                      {m.nome}
                    </Botao>
                  ))}
                </div>
              </div>
            )}
          </Cartao>

          {instrucao && <Aviso tipo="info">{instrucao}</Aviso>}

          <EditorDeItensPrescritos itens={itens} aoMudar={setItens} />

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="flex justify-end">
            <Botao onClick={emitir} disabled={itens.length === 0 || salvando}>
              {salvando ? 'Emitindo…' : emitindo ? 'Emitir nova versão' : 'Emitir prescrição'}
            </Botao>
          </div>
        </div>
      )}

      {emitindo === null && erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="flex flex-col gap-md">
        {prescricoes.map((p) => (
          <Cartao key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div>
                <p className="font-semibold">
                  {new Date(`${p.data}T12:00:00`).toLocaleDateString('pt-BR')}
                  {p.versao > 1 && (
                    <span className="ml-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      versão {p.versao}
                    </span>
                  )}
                </p>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {p.prescritor.nome}
                  {p.validaAte &&
                    ` · válida até ${new Date(`${p.validaAte}T12:00:00`).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <Etiqueta texto={ROTULO_STATUS_PRESCRICAO[p.status]} cor={corDoStatus[p.status]} />
            </div>

            <ul className="mt-md flex flex-col gap-sm">
              {p.itens.map((item) => (
                <li key={item.id} style={{ borderTop: '1px solid var(--vv-borda)' }} className="pt-sm">
                  <span className="font-medium">{item.nome}</span>
                  {item.apresentacao && (
                    <span className="ml-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {item.apresentacao}
                    </span>
                  )}
                  <span className="block text-sm tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {descreverPosologia(item) || 'Sem posologia definida'}
                  </span>
                  {item.observacao && (
                    <span className="block text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {item.observacao}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {p.orientacoes && (
              <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {p.orientacoes}
              </p>
            )}

            {p.status !== 'SUBSTITUIDA' && (
              <div className="mt-md flex flex-wrap justify-end gap-sm">
                <Botao variante="neutra" onClick={() => abrirSubstituicao(p)}>
                  Nova versão
                </Botao>
                {p.status === 'ATIVA' && (
                  <Botao variante="neutra" onClick={() => mudarStatus(p, 'SUSPENSA')}>
                    Suspender
                  </Botao>
                )}
                {p.status === 'SUSPENSA' && (
                  <Botao variante="neutra" onClick={() => mudarStatus(p, 'ATIVA')}>
                    Reativar
                  </Botao>
                )}
                {p.status !== 'ENCERRADA' && (
                  <Botao variante="perigo" onClick={() => mudarStatus(p, 'ENCERRADA')}>
                    Encerrar
                  </Botao>
                )}
              </div>
            )}
          </Cartao>
        ))}
      </div>

      {prescricoes.length === 0 && emitindo === null && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>Nenhuma prescrição emitida ainda.</p>
      )}
    </div>
  );
}
