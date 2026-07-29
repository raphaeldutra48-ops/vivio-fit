'use client';

import { faixaDeGordura, type AvaliacaoResumo, type SexoBiologico, type VinculoResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

/**
 * Campos que as balanças de bioimpedância costumam reportar. Só peso e
 * percentual são obrigatórios — o resto varia bastante de aparelho para aparelho.
 */
interface CampoDaBalanca {
  chave: string;
  rotulo: string;
  unidade: string;
  obrigatorio?: boolean;
}

const CAMPOS: CampoDaBalanca[] = [
  { chave: 'pesoKg', rotulo: 'Peso', unidade: 'kg', obrigatorio: true },
  { chave: 'percentualGordura', rotulo: 'Gordura', unidade: '%', obrigatorio: true },
  { chave: 'massaMagraKg', rotulo: 'Massa magra', unidade: 'kg' },
  { chave: 'alturaCm', rotulo: 'Altura', unidade: 'cm' },
  { chave: 'aguaCorporalPercentual', rotulo: 'Água corporal', unidade: '%' },
  { chave: 'massaOsseaKg', rotulo: 'Massa óssea', unidade: 'kg' },
  { chave: 'taxaMetabolicaBasal', rotulo: 'Taxa metabólica basal', unidade: 'kcal' },
  { chave: 'gorduraVisceral', rotulo: 'Gordura visceral', unidade: 'nível' },
];

export default function Bioimpedancia() {
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [alunoId, setAlunoId] = useState('');
  const [sexo, setSexo] = useState<SexoBiologico>('F');
  const [valores, setValores] = useState<Record<string, string>>({});
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

  const numero = (chave: string) => Number(valores[chave]?.replace(',', '.')) || 0;
  const peso = numero('pesoKg');
  const gordura = numero('percentualGordura');
  const completo = alunoId !== '' && peso > 0 && gordura > 0;

  const massaGorda = completo ? (peso * gordura) / 100 : null;

  async function salvar() {
    if (!completo) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const opcional = (chave: string) => (valores[chave] ? numero(chave) : undefined);
      const r = await sdk.avaliacoes.registrar(alunoId, {
        metodo: 'BIOIMPEDANCIA',
        data: new Date(),
        pesoKg: peso,
        percentualGordura: gordura,
        alturaCm: opcional('alturaCm'),
        massaMagraKg: opcional('massaMagraKg'),
        aguaCorporalPercentual: opcional('aguaCorporalPercentual'),
        massaOsseaKg: opcional('massaOsseaKg'),
        taxaMetabolicaBasal: opcional('taxaMetabolicaBasal'),
        gorduraVisceral: opcional('gorduraVisceral'),
      });
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
                onChange={(e) =>
                  setValores((atual) => ({ ...atual, [campo.chave]: e.target.value }))
                }
              />
            ))}
          </div>

          <div className="mt-lg">
            <Botao disabled={!completo || salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando…' : 'Salvar avaliação'}
            </Botao>
          </div>
        </Cartao>

        <aside className="flex flex-col gap-md">
          <Cartao>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Composição
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {gordura > 0 ? `${gordura}%` : '—'}
              <span className="text-sm font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                {' '}
                de gordura
              </span>
            </p>
            {gordura > 0 && (
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Faixa: {faixaDeGordura(gordura, sexo)}
              </p>
            )}

            <dl className="mt-md flex flex-col gap-xs text-sm">
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa gorda</dt>
                <dd className="tabular-nums">
                  {massaGorda !== null ? `${massaGorda.toFixed(1)} kg` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: 'var(--vv-texto-secundario)' }}>Massa magra</dt>
                <dd className="tabular-nums">
                  {massaGorda !== null ? `${(peso - massaGorda).toFixed(1)} kg` : '—'}
                </dd>
              </div>
            </dl>

            <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              Se a balança informar a massa magra, ela prevalece sobre a derivada.
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
