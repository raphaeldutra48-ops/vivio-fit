'use client';

import {
  EscopoMarcador,
  Papel,
  ROTULO_SISTEMA,
  SistemaCorporal,
  marcadoresDoEscopo,
  referenciaDe,
  type Marcador,
  type SexoBiologico,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../../../components/ui';
import { erroVisivel } from '../../../../../../lib/campos';
import {
  marcadoresPreenchidos,
  problemaDoMarcador,
  problemasDoExame,
  type ValoresDigitados,
} from '../../../../../../lib/exames';
import { sdk } from '../../../../../../lib/sdk';
import { useSessao } from '../../../../../../lib/sessao';

/**
 * Digitação assistida do exame.
 *
 * O profissional transcreve o que o laudo traz — não precisa preencher tudo.
 * Marcador em branco simplesmente não vai; é assim que um exame de 8 itens
 * convive com uma tabela de 20 sem virar formulário de reclamação.
 */
export default function NovoExame() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const router = useRouter();
  const { usuario } = useSessao();

  const [laboratorio, setLaboratorio] = useState('');
  const [dataColeta, setDataColeta] = useState(() => new Date().toISOString().slice(0, 10));
  const [sexo, setSexo] = useState<SexoBiologico>('F');
  const [observacao, setObservacao] = useState('');
  const [valores, setValores] = useState<ValoresDigitados>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /*
    Só os marcadores que este papel pode lançar. O servidor recusa o resto de
    qualquer forma — mostrar o campo e depois recusar seria pior que não
    mostrar.
  */
  const meus = useMemo(
    () =>
      marcadoresDoEscopo(
        usuario?.papel === Papel.NUTRICIONISTA ? EscopoMarcador.NUTRICIONAL : 'TODOS',
      ),
    [usuario?.papel],
  );

  const porSistema = useMemo(() => {
    const grupos = new Map<SistemaCorporal, Marcador[]>();
    for (const m of meus) {
      const sistema = referenciaDe(m).sistema;
      grupos.set(sistema, [...(grupos.get(sistema) ?? []), m]);
    }
    return [...grupos.entries()];
  }, [meus]);

  const problemas = useMemo(
    () => problemasDoExame(laboratorio, dataColeta, valores),
    [laboratorio, dataColeta, valores],
  );
  const preenchidos = marcadoresPreenchidos(valores);

  async function salvar() {
    if (problemas.length > 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const exame = await sdk.exames.registrar(alunoId, {
        laboratorio,
        dataColeta: new Date(`${dataColeta}T12:00:00`),
        sexo,
        observacao: observacao.trim() || undefined,
        resultados: preenchidos,
      });
      router.push(`/alunos/${alunoId}/exames/${exame.id}`);
    } catch (e) {
      setErro(
        e instanceof ErroApi ? e.message : 'Não foi possível salvar o exame.',
      );
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
    <div className="flex flex-col gap-xl pb-2xl">
      <Link
        href={`/alunos/${alunoId}`}
        className="text-sm"
        style={{ color: 'var(--vv-texto-secundario)' }}
      >
        ← Voltar para a ficha
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Novo exame</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Transcreva o que o laudo traz. Deixe em branco o que o laboratório não mediu — só o que
          for preenchido é enviado.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao>
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            rotulo="Laboratório"
            value={laboratorio}
            onChange={(e) => setLaboratorio(e.target.value)}
            placeholder="Emilio Ribas Medicina Diagnóstica"
          />
          <Campo
            rotulo="Data da coleta"
            type="date"
            value={dataColeta}
            onChange={(e) => setDataColeta(e.target.value)}
          />
          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Sexo biológico (define a faixa)
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
          <Campo
            rotulo="Observação — opcional"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </Cartao>

      {porSistema.map(([sistema, marcadores]) => (
        <Cartao key={sistema}>
          <p className="mb-md font-semibold">{ROTULO_SISTEMA[sistema]}</p>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {marcadores.map((m) => {
              const ref = referenciaDe(m);
              return (
                <Campo
                  key={m}
                  rotulo={`${ref.rotulo}${ref.unidade ? ` (${ref.unidade})` : ''}`}
                  inputMode="decimal"
                  value={valores[m] ?? ''}
                  erro={erroVisivel(valores[m], problemaDoMarcador(valores[m]))}
                  onChange={(e) => setValores((atual) => ({ ...atual, [m]: e.target.value }))}
                />
              );
            })}
          </div>
        </Cartao>
      ))}

      {usuario?.papel === Papel.NUTRICIONISTA && (
        <Aviso tipo="info">
          Os marcadores hormonais (TSH, T4 livre, DHEA-S, prolactina) exigem avaliação médica e não
          aparecem aqui. Se o laudo os traz, o médico da equipe pode lançá-los.
        </Aviso>
      )}

      <div
        className="sticky bottom-0 flex flex-col gap-sm border-t py-lg"
        style={{ background: 'var(--vv-fundo)', borderColor: 'var(--vv-borda)' }}
      >
        {problemas.length > 0 && (
          <ul className="flex flex-col gap-xs text-sm" style={{ color: 'var(--vv-alerta)' }}>
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-md">
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {preenchidos.length}{' '}
            {preenchidos.length === 1 ? 'marcador preenchido' : 'marcadores preenchidos'}
          </p>
          <Botao disabled={problemas.length > 0 || salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar e analisar'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
