'use client';

import {
  DOBRAS_DO_PROTOCOLO,
  ProtocoloDobras,
  ROTULO_DOBRA,
  ROTULO_PROTOCOLO,
  faixaDeGordura,
  type AvaliacaoResumo,
  type Dobra,
  type SexoBiologico,
  type VinculoResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useMemo, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

/**
 * Réplica local das equações, só para a prévia enquanto o profissional digita.
 * O número que vale é o que o servidor devolve ao salvar — este existe para o
 * resultado aparecer sem ida e volta a cada dobra digitada.
 */
function previaPercentual(
  protocolo: ProtocoloDobras,
  sexo: SexoBiologico,
  soma: number,
  idade: number,
): number | null {
  if (soma <= 0 || idade <= 0) return null;
  const s2 = soma * soma;
  const d =
    protocolo === ProtocoloDobras.POLLOCK_3
      ? sexo === 'M'
        ? 1.10938 - 0.0008267 * soma + 0.0000016 * s2 - 0.0002574 * idade
        : 1.0994921 - 0.0009929 * soma + 0.0000023 * s2 - 0.0001392 * idade
      : sexo === 'M'
        ? 1.112 - 0.00043499 * soma + 0.00000055 * s2 - 0.00028826 * idade
        : 1.097 - 0.00046971 * soma + 0.00000056 * s2 - 0.00012828 * idade;

  const percentual = 495 / d - 450;
  return percentual > 1 && percentual < 70 ? Math.round(percentual * 10) / 10 : null;
}

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

  const soma = useMemo(
    () => exigidas.reduce((total, d) => total + (Number(dobras[d]?.replace(',', '.')) || 0), 0),
    [exigidas, dobras],
  );

  const previa = previaPercentual(protocolo, sexo, soma, Number(idade) || 0);
  const pesoNum = Number(peso.replace(',', '.')) || 0;
  const massaGorda = previa !== null && pesoNum > 0 ? (pesoNum * previa) / 100 : null;

  const completo =
    alunoId !== '' && pesoNum > 0 && exigidas.every((d) => Number(dobras[d]?.replace(',', '.')) > 0);

  async function salvar() {
    if (!completo) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const r = await sdk.avaliacoes.registrar(alunoId, {
        metodo: 'ADIPOMETRIA',
        data: new Date(),
        protocolo,
        sexo,
        idade: Number(idade),
        pesoKg: pesoNum,
        alturaCm: altura ? Number(altura) : undefined,
        dobras: Object.fromEntries(
          exigidas.map((d) => [d, Number(dobras[d]!.replace(',', '.'))]),
        ) as Record<Dobra, number>,
      });
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
                onChange={(e) => setIdade(e.target.value)}
              />
              <Campo rotulo="Peso (kg)" value={peso} onChange={(e) => setPeso(e.target.value)} />
              <Campo
                rotulo="Altura (cm) — opcional"
                value={altura}
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
                  onChange={(e) => setDobras((atual) => ({ ...atual, [d]: e.target.value }))}
                />
              ))}
            </div>
            <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              O protocolo de 3 dobras usa pontos diferentes para homens e mulheres — é assim que as
              equações foram derivadas.
            </p>
          </Cartao>

          <div>
            <Botao disabled={!completo || salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando…' : 'Salvar avaliação'}
            </Botao>
          </div>
        </div>

        <aside className="flex flex-col gap-md">
          <Cartao>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Resultado
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {previa !== null ? `${previa}%` : '—'}
              <span className="text-sm font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                {' '}
                de gordura
              </span>
            </p>
            {previa !== null && (
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Faixa: {faixaDeGordura(previa, sexo)}
              </p>
            )}

            <dl className="mt-md flex flex-col gap-xs text-sm">
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Soma das dobras</dt>
                <dd className="tabular-nums">{soma > 0 ? `${soma} mm` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa gorda</dt>
                <dd className="tabular-nums">
                  {massaGorda !== null ? `${massaGorda.toFixed(1)} kg` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa magra</dt>
                <dd className="tabular-nums">
                  {massaGorda !== null ? `${(pesoNum - massaGorda).toFixed(1)} kg` : '—'}
                </dd>
              </div>
            </dl>

            <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              Prévia local. O valor gravado é calculado no servidor.
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
