'use client';

import {
  DOBRAS_DO_PROTOCOLO,
  ProtocoloDobras,
  ROTULO_DOBRA,
  ROTULO_PROTOCOLO,
  type AvaliacaoResumo,
  type SexoBiologico,
  type VinculoResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useMemo, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import {
  corpoDaAvaliacao,
  erroVisivel,
  previaDaAvaliacao,
  problemaDaAltura,
  problemaDaDobra,
  problemaDaIdade,
  problemaDoPeso,
  problemasDaAvaliacao,
  type EntradaNaTela,
} from '../../../../lib/adipometria';
import { sdk } from '../../../../lib/sdk';

export default function Adipometria() {
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [alunoId, setAlunoId] = useState('');
  const [protocolo, setProtocolo] = useState<ProtocoloDobras>(ProtocoloDobras.POLLOCK_3);
  const [sexo, setSexo] = useState<SexoBiologico>('M');
  const [idade, setIdade] = useState('30');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [dobras, setDobras] = useState<Record<string, string>>({});
  const [historico, setHistorico] = useState<AvaliacaoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const exigidas = DOBRAS_DO_PROTOCOLO[protocolo][sexo];

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
    sdk.avaliacoes
      .listar(alunoId)
      .then(setHistorico)
      .catch(() => setHistorico([]));
  }, [alunoId, mensagem]);

  const entrada: EntradaNaTela = useMemo(
    () => ({ protocolo, sexo, idade, peso, altura, dobras }),
    [protocolo, sexo, idade, peso, altura, dobras],
  );

  const previa = useMemo(() => previaDaAvaliacao(entrada), [entrada]);
  const problemas = useMemo(
    () => problemasDaAvaliacao(alunoId, entrada),
    [alunoId, entrada],
  );
  const completo = problemas.length === 0;

  async function salvar() {
    if (!completo) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const r = await sdk.avaliacoes.registrar(alunoId, corpoDaAvaliacao(entrada, new Date()));
      setMensagem(
        `Avaliação salva: ${r.resultado.percentualGordura}% de gordura. Os gráficos do aluno já refletem o resultado.`,
      );
      setDobras({});
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar a avaliação.');
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
        <h1 className="text-2xl font-bold">Adipometria</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Dobras cutâneas em milímetros. O percentual sai por Jackson &amp; Pollock e Siri — é
          estimativa de campo, não medida direta.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mensagem && <Aviso tipo="info">{mensagem}</Aviso>}

      <div className="grid gap-xl lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-lg">
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
                  Protocolo
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={seletor}
                  value={protocolo}
                  onChange={(e) => setProtocolo(e.target.value as ProtocoloDobras)}
                >
                  {Object.entries(ROTULO_PROTOCOLO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Sexo biológico
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={seletor}
                  value={sexo}
                  onChange={(e) => setSexo(e.target.value as SexoBiologico)}
                >
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </label>

              <Campo
                rotulo="Idade (anos)"
                type="number"
                value={idade}
                erro={erroVisivel(idade, problemaDaIdade(idade))}
                onChange={(e) => setIdade(e.target.value)}
              />
              <Campo
                rotulo="Peso (kg)"
                inputMode="decimal"
                value={peso}
                erro={erroVisivel(peso, problemaDoPeso(peso))}
                onChange={(e) => setPeso(e.target.value)}
              />
              <Campo
                rotulo="Altura (cm) — opcional"
                inputMode="decimal"
                value={altura}
                erro={erroVisivel(altura, problemaDaAltura(altura))}
                onChange={(e) => setAltura(e.target.value)}
              />
            </div>
          </Cartao>

          <Cartao>
            <p className="mb-md font-semibold">
              Dobras — {ROTULO_PROTOCOLO[protocolo]} ({exigidas.length} pontos)
            </p>
            <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
              {exigidas.map((d) => (
                <Campo
                  key={d}
                  rotulo={`${ROTULO_DOBRA[d]} (mm)`}
                  inputMode="decimal"
                  value={dobras[d] ?? ''}
                  erro={erroVisivel(dobras[d], problemaDaDobra(dobras[d]))}
                  onChange={(e) => setDobras((atual) => ({ ...atual, [d]: e.target.value }))}
                />
              ))}
            </div>
            <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              O protocolo de 3 dobras usa pontos diferentes para homens e mulheres — é assim que as
              equações foram derivadas.
            </p>
          </Cartao>

          <div className="flex flex-col gap-sm">
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
        </div>

        <aside className="flex flex-col gap-md">
          <Cartao>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Resultado
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {previa ? `${previa.percentualGordura}%` : '—'}
              <span className="text-sm font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                {' '}
                de gordura
              </span>
            </p>
            {previa ? (
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Faixa: {previa.faixa}
              </p>
            ) : (
              /*
                Antes a prévia calculava com o que houvesse: duas de três dobras
                davam soma menor, densidade maior e um percentual BAIXO na tela —
                plausível e errado. O servidor sempre recusou meio protocolo;
                agora a tela recusa também, e diz por quê.
              */
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Preencha as {exigidas.length} dobras e a idade para ver o resultado.
              </p>
            )}

            <dl className="mt-md flex flex-col gap-xs text-sm">
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Soma das dobras</dt>
                <dd className="tabular-nums">{previa ? `${previa.somaMm} mm` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa gorda</dt>
                <dd className="tabular-nums">
                  {previa?.massaGordaKg !== null && previa?.massaGordaKg !== undefined
                    ? `${previa.massaGordaKg.toFixed(1)} kg`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa magra</dt>
                <dd className="tabular-nums">
                  {previa?.massaMagraKg !== null && previa?.massaMagraKg !== undefined
                    ? `${previa.massaMagraKg.toFixed(1)} kg`
                    : '—'}
                </dd>
              </div>
            </dl>

            <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              Prévia local, pela mesma equação que a API executa. O valor gravado é calculado no
              servidor.
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
                    </span>
                    <span className="tabular-nums">
                      {a.resultado.percentualGordura}%
                      {a.variacao && (
                        <span
                          style={{
                            color:
                              a.variacao.percentualGordura < 0
                                ? 'var(--vv-sucesso)'
                                : 'var(--vv-texto-secundario)',
                          }}
                        >
                          {' '}
                          ({a.variacao.percentualGordura > 0 ? '+' : ''}
                          {a.variacao.percentualGordura})
                        </span>
                      )}
                    </span>
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
