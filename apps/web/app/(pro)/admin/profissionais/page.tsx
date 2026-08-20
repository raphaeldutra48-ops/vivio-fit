'use client';

import {
  CONSELHO_POR_PAPEL,
  CONSULTA_DO_CONSELHO,
  ROTULO_STATUS_VERIFICACAO,
  StatusVerificacao,
  type ProfissionalParaVerificar,
} from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

const corDoStatus: Record<StatusVerificacao, string> = {
  PENDENTE: 'var(--vv-alerta)',
  VERIFICADO: 'var(--vv-sucesso)',
  RECUSADO: 'var(--vv-erro)',
};

const ABAS: { valor: StatusVerificacao; rotulo: string }[] = [
  { valor: 'PENDENTE', rotulo: 'Aguardando' },
  { valor: 'VERIFICADO', rotulo: 'Verificados' },
  { valor: 'RECUSADO', rotulo: 'Recusados' },
];

export default function VerificarProfissionais() {
  const [aba, setAba] = useState<StatusVerificacao>('PENDENTE');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<ProfissionalParaVerificar[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  /** id do profissional cujo formulário de recusa está aberto. */
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    setCarregando(true);
    return sdk.admin
      .listarProfissionais({ status: aba, q: busca || undefined, limit: 100 })
      .then(setLista)
      .catch(() => setErro('Não foi possível carregar a lista.'))
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, busca]);

  async function verificar(p: ProfissionalParaVerificar) {
    const conselho = CONSELHO_POR_PAPEL[p.tipo] ?? 'conselho';
    if (
      !confirm(
        `Confirmar que o registro ${p.registroConselho}/${p.ufRegistro} foi conferido no ${conselho} e pertence a ${p.nome}?\n\n` +
          'A partir daí esta pessoa passa a acessar dados de saúde de alunos.',
      )
    ) {
      return;
    }
    setSalvando(true);
    try {
      await sdk.admin.verificar(p.id);
      await carregar();
    } catch {
      setErro('Não foi possível verificar.');
    } finally {
      setSalvando(false);
    }
  }

  async function recusar(p: ProfissionalParaVerificar) {
    setSalvando(true);
    try {
      await sdk.admin.recusar(p.id, { motivo: motivo.trim() });
      setRecusando(null);
      setMotivo('');
      await carregar();
    } catch {
      setErro('Não foi possível recusar. O motivo precisa ter ao menos 5 caracteres.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Verificação de profissionais</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Confira o registro no conselho antes de liberar. Verificado é quem passa a ter acesso a
          dado de saúde de alunos.
        </p>
      </div>

      <div className="flex flex-wrap gap-sm">
        {ABAS.map((a) => (
          <button
            key={a.valor}
            onClick={() => setAba(a.valor)}
            aria-pressed={aba === a.valor}
            className="min-h-toque rounded-md border px-lg font-semibold"
            style={{
              background: aba === a.valor ? 'var(--vv-acao-fundo)' : 'var(--vv-superficie)',
              color: aba === a.valor ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
              borderColor: aba === a.valor ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
            }}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <Campo
        rotulo="Buscar por nome ou e-mail"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="flex flex-col gap-md">
        {lista.map((p) => {
          const conselho = CONSELHO_POR_PAPEL[p.tipo];
          const consulta = CONSULTA_DO_CONSELHO[p.tipo];
          return (
            <Cartao key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="font-semibold">{p.nome}</h2>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {p.email}
                    {p.telefone && ` · ${p.telefone}`}
                  </p>
                  <p className="mt-xs font-medium tabular-nums">
                    {p.registroConselho}/{p.ufRegistro}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Cadastrou-se em {new Date(p.criadoEm).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-sm">
                  <Etiqueta texto={ROTULO_STATUS_VERIFICACAO[p.status]} cor={corDoStatus[p.status]} />
                  {!p.emailVerificado && (
                    <Etiqueta texto="E-mail não confirmado" cor="var(--vv-alerta)" />
                  )}
                </div>
              </div>

              {p.bio && (
                <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {p.bio}
                </p>
              )}

              {p.status === 'VERIFICADO' && p.verificadoPor && (
                <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Verificado por {p.verificadoPor.nome} em{' '}
                  {new Date(p.verificadoEm!).toLocaleDateString('pt-BR')}
                </p>
              )}

              {p.status === 'RECUSADO' && (
                <p className="mt-md text-sm" style={{ color: 'var(--vv-erro)' }}>
                  Recusado em {new Date(p.recusadoEm!).toLocaleDateString('pt-BR')}:{' '}
                  {p.motivoRecusa}
                </p>
              )}

              {consulta && (
                <p className="mt-md text-sm">
                  <a
                    href={consulta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: 'var(--vv-texto-secundario)' }}
                  >
                    Conferir no {consulta.nome} ↗
                  </a>
                </p>
              )}

              {recusando === p.id ? (
                <div className="mt-lg flex flex-col gap-md">
                  <label className="flex flex-col gap-xs">
                    <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      Motivo da recusa — o profissional vai ler isto
                    </span>
                    <textarea
                      className="min-h-[70px] rounded-md border p-md"
                      style={{
                        background: 'var(--vv-superficie)',
                        borderColor: 'var(--vv-borda)',
                        color: 'var(--vv-texto-primario)',
                      }}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder={`Registro não localizado na consulta ao ${conselho ?? 'conselho'}.`}
                      autoFocus
                    />
                  </label>
                  <div className="flex justify-end gap-sm">
                    <Botao
                      variante="neutra"
                      onClick={() => {
                        setRecusando(null);
                        setMotivo('');
                      }}
                    >
                      Cancelar
                    </Botao>
                    <Botao
                      variante="perigo"
                      onClick={() => recusar(p)}
                      disabled={motivo.trim().length < 5 || salvando}
                    >
                      Confirmar recusa
                    </Botao>
                  </div>
                </div>
              ) : (
                <div className="mt-lg flex flex-wrap justify-end gap-sm">
                  {p.status !== 'RECUSADO' && (
                    <Botao
                      variante="perigo"
                      onClick={() => {
                        setRecusando(p.id);
                        setMotivo('');
                      }}
                    >
                      Recusar
                    </Botao>
                  )}
                  {p.status !== 'VERIFICADO' && (
                    <Botao onClick={() => verificar(p)} disabled={salvando}>
                      Verificar
                    </Botao>
                  )}
                </div>
              )}
            </Cartao>
          );
        })}
      </div>

      {!carregando && lista.length === 0 && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>
          {aba === 'PENDENTE'
            ? 'Nenhum profissional aguardando análise.'
            : 'Nada nesta lista.'}
        </p>
      )}
    </div>
  );
}
