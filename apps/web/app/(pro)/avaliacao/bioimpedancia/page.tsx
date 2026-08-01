'use client';

import type { AvaliacaoResumo, SexoBiologico, VinculoResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useMemo, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import {
  CAMPOS,
  corpoDaBioimpedancia,
  previaDaBioimpedancia,
  problemaDoCampo,
  problemasDaBioimpedancia,
  type ValoresDaBalanca,
} from '../../../../lib/bioimpedancia';
import { erroVisivel } from '../../../../lib/campos';
import { sdk } from '../../../../lib/sdk';

export default function Bioimpedancia() {
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [alunoId, setAlunoId] = useState('');
  const [sexo, setSexo] = useState<SexoBiologico>('F');
  const [valores, setValores] = useState<ValoresDaBalanca>({});
  const [historico, setHistorico] = useState<AvaliacaoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then((lista) => {
        setAlunos(lista);
        setAlunoId((a) => a || (lista[0]?.contraparte.id ?? ''));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!alunoId) return;
    sdk.avaliacoes.listar(alunoId).then(setHistorico).catch(() => setHistorico([]));
  }, [alunoId, mensagem]);

  const previa = useMemo(() => previaDaBioimpedancia(valores, sexo), [valores, sexo]);
  const problemas = useMemo(
    () => problemasDaBioimpedancia(alunoId, valores),
    [alunoId, valores],
  );
  const completo = problemas.length === 0;

  async function salvar() {
    if (!completo) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const r = await sdk.avaliacoes.registrar(alunoId, corpoDaBioimpedancia(valores, new Date()));
      setMensagem(
        `Salvo: ${r.resultado.percentualGordura}% de gordura, ${r.resultado.massaMagraKg} kg de massa magra.`,
      );
      setValores({});
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
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
        <h1 className="text-2xl font-bold">Bioimpedância</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Transcreva o que a balança mostrou. Preencha ao menos peso e percentual de gordura — o
          resto é opcional e varia por aparelho.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mensagem && <Aviso tipo="info">{mensagem}</Aviso>}

      <div className="grid gap-xl lg:grid-cols-[1fr_300px]">
        <Cartao>
          <div className="grid gap-md sm:grid-cols-2">
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
                Sexo biológico (para a faixa de referência)
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={seletor}
                value={sexo}
                onChange={(e) => setSexo(e.target.value as SexoBiologico)}
              >
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </label>

            {CAMPOS.map((campo) => (
              <Campo
                key={campo.chave}
                rotulo={`${campo.rotulo} (${campo.unidade})${campo.obrigatorio ? '' : ' — opcional'}`}
                inputMode="decimal"
                value={valores[campo.chave] ?? ''}
                erro={erroVisivel(valores[campo.chave], problemaDoCampo(campo, valores))}
                onChange={(e) =>
                  setValores((atual) => ({ ...atual, [campo.chave]: e.target.value }))
                }
              />
            ))}
          </div>

          <div className="mt-lg flex flex-col gap-sm">
            {problemas.length > 0 && (
              <ul className="flex flex-col gap-xs text-sm" style={{ color: 'var(--vv-alerta)' }}>
                {problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div>
              <Botao disabled={!completo || salvando} onClick={() => void salvar()}>
                {salvando ? 'Salvando…' : 'Salvar avaliação'}
              </Botao>
            </div>
          </div>
        </Cartao>

        <aside className="flex flex-col gap-md">
          <Cartao>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Composição
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {previa ? `${previa.percentualGordura}%` : '—'}
              <span className="text-sm font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                {' '}
                de gordura
              </span>
            </p>
            {previa && (
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Faixa: {previa.faixa}
              </p>
            )}

            <dl className="mt-md flex flex-col gap-xs text-sm">
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa gorda</dt>
                <dd className="tabular-nums">
                  {previa ? `${previa.massaGordaKg.toFixed(1)} kg` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa magra</dt>
                <dd className="tabular-nums">
                  {previa ? `${previa.massaMagraKg.toFixed(1)} kg` : '—'}
                </dd>
              </div>
            </dl>

            {/*
              A prévia usa a massa magra informada quando ela existe, como o
              servidor faz. Antes a legenda prometia isso e a prévia mostrava a
              derivada — o número mudava depois de salvar.
            */}
            <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              {previa?.massaMagraInformada
                ? 'Massa magra informada pela balança — é ela que prevalece sobre a derivada.'
                : 'Se a balança informar a massa magra, ela prevalece sobre a derivada.'}
            </p>
          </Cartao>

          {historico.length > 0 && (
            <Cartao>
              <p className="mb-sm font-semibold">Avaliações anteriores</p>
              <ul className="flex flex-col gap-sm text-sm">
                {historico.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <span style={{ color: 'var(--vv-texto-secundario)' }}>
                      {new Date(`${a.data}T12:00:00`).toLocaleDateString('pt-BR')}
                      <span className="ml-xs text-xs">
                        {a.metodo === 'BIOIMPEDANCIA' ? 'bio' : 'dobras'}
                      </span>
                    </span>
                    <span className="tabular-nums">{a.resultado.percentualGordura}%</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </aside>
      </div>
    </div>
  );
}
