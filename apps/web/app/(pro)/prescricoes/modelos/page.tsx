'use client';

import { descreverPosologia, type ModeloPrescricaoResumo } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import {
  EditorDeItensPrescritos,
  type ItemEmEdicao,
} from '../../../../components/EditorDeItensPrescritos';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

export default function ModelosDePrescricao() {
  const [modelos, setModelos] = useState<ModeloPrescricaoResumo[]>([]);
  const [montando, setMontando] = useState(false);
  const [nome, setNome] = useState('');
  const [orientacoes, setOrientacoes] = useState('');
  const [itens, setItens] = useState<ItemEmEdicao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    sdk.modelosPrescricao
      .listar()
      .then(setModelos)
      .catch(() => setErro('Não foi possível carregar os modelos.'));

  useEffect(() => {
    void carregar();
  }, []);

  function limpar() {
    setNome('');
    setOrientacoes('');
    setItens([]);
    setMontando(false);
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await sdk.modelosPrescricao.criar({
        nome: nome.trim(),
        orientacoes: orientacoes || undefined,
        // `nome` é só de exibição no editor; o servidor resolve pelo id.
        itens: itens.map(({ nome: _nome, ...posologia }) => posologia),
      });
      limpar();
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o modelo.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(modelo: ModeloPrescricaoResumo) {
    if (!confirm(`Remover o modelo "${modelo.nome}"?`)) return;
    await sdk.modelosPrescricao.remover(modelo.id).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Modelos de prescrição</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Protocolos que você repete. Na ficha do paciente eles viram prescrição em um clique.
          </p>
        </div>
        <Botao onClick={() => (montando ? limpar() : setMontando(true))} variante={montando ? 'neutra' : 'acao'}>
          {montando ? 'Cancelar' : '+ Novo modelo'}
        </Botao>
      </div>

      {montando && (
        <div className="flex flex-col gap-md">
          <Cartao>
            <div className="grid gap-md">
              <Campo
                rotulo="Nome do modelo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Protocolo de hipertrofia — iniciante"
                autoFocus
              />
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Orientações gerais
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
                  placeholder="Manter hidratação. Suspender em caso de desconforto gástrico."
                />
              </label>
            </div>
          </Cartao>

          <EditorDeItensPrescritos itens={itens} aoMudar={setItens} />

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="flex justify-end">
            <Botao onClick={salvar} disabled={nome.trim().length < 2 || itens.length === 0 || salvando}>
              {salvando ? 'Salvando…' : 'Salvar modelo'}
            </Botao>
          </div>
        </div>
      )}

      {!montando && erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-md lg:grid-cols-2">
        {modelos.map((modelo) => (
          <Cartao key={modelo.id}>
            <div className="flex items-start justify-between gap-sm">
              <div>
                <h2 className="font-semibold">{modelo.nome}</h2>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {modelo.totalItens} {modelo.totalItens === 1 ? 'item' : 'itens'}
                </p>
              </div>
              <button
                onClick={() => remover(modelo)}
                className="text-sm underline"
                style={{ color: 'var(--vv-texto-secundario)' }}
              >
                Remover
              </button>
            </div>

            <ul className="mt-md flex flex-col gap-sm">
              {modelo.itens.map((item) => (
                <li key={item.id} style={{ borderTop: '1px solid var(--vv-borda)' }} className="pt-sm">
                  <span className="font-medium">{item.prescritivel.nome}</span>
                  <span className="block text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {descreverPosologia(item) || 'Sem posologia definida'}
                  </span>
                </li>
              ))}
            </ul>

            {modelo.orientacoes && (
              <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {modelo.orientacoes}
              </p>
            )}
          </Cartao>
        ))}
      </div>

      {modelos.length === 0 && !montando && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>
          Nenhum modelo ainda. Monte o primeiro a partir do seu catálogo.
        </p>
      )}
    </div>
  );
}
