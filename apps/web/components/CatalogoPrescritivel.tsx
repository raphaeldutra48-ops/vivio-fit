'use client';

import type { CriarPrescritivelInput, PrescritivelResumo, TipoPrescritivel } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from './ui';

const vazio: CriarPrescritivelInput = {
  nome: '',
  tipo: 'SUPLEMENTO',
  apresentacao: '',
  principioAtivo: '',
  contraindicacoes: '',
  observacao: '',
};

/**
 * Suplementos, fitoterápicos e medicamentos são a mesma tela com outro `tipo`.
 * O que muda de verdade é quem tem competência para cadastrar — e isso a API
 * decide, não o front.
 */
export function CatalogoPrescritivel({
  tipo,
  titulo,
  subtitulo,
  exemploNome,
}: {
  tipo: TipoPrescritivel;
  titulo: string;
  subtitulo: string;
  exemploNome: string;
}) {
  const [itens, setItens] = useState<PrescritivelResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<CriarPrescritivelInput>({ ...vazio, tipo });
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    sdk.prescritiveis
      .listar({ tipo, q: busca || undefined, limit: 100 })
      .then(setItens)
      .catch(() => setErro('Não foi possível carregar o catálogo.'));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, tipo]);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await sdk.prescritiveis.criar({
        ...form,
        tipo,
        // String vazia não é "não informado" — o schema espera ausência.
        apresentacao: form.apresentacao || undefined,
        principioAtivo: form.principioAtivo || undefined,
        contraindicacoes: form.contraindicacoes || undefined,
        observacao: form.observacao || undefined,
      });
      setForm({ ...vazio, tipo });
      setAbrindo(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(item: PrescritivelResumo) {
    if (!confirm(`Remover "${item.nome}" do catálogo?`)) return;
    try {
      await sdk.prescritiveis.remover(item.id);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover.');
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">{titulo}</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {subtitulo}
          </p>
        </div>
        <Botao onClick={() => setAbrindo((a) => !a)} variante={abrindo ? 'neutra' : 'acao'}>
          {abrindo ? 'Cancelar' : '+ Novo item'}
        </Botao>
      </div>

      {abrindo && (
        <Cartao>
          <div className="grid gap-md sm:grid-cols-2">
            <Campo
              rotulo="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder={exemploNome}
              autoFocus
            />
            <Campo
              rotulo="Apresentação"
              value={form.apresentacao ?? ''}
              onChange={(e) => setForm({ ...form, apresentacao: e.target.value })}
              placeholder="pote 300 g, cápsula 500 mg…"
            />
            <Campo
              rotulo="Princípio ativo (opcional)"
              value={form.principioAtivo ?? ''}
              onChange={(e) => setForm({ ...form, principioAtivo: e.target.value })}
            />
            <Campo
              rotulo="Observação (opcional)"
              value={form.observacao ?? ''}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
            <label className="flex flex-col gap-xs sm:col-span-2">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Contraindicações
              </span>
              <textarea
                className="min-h-[80px] rounded-md border p-md"
                style={{
                  background: 'var(--vv-superficie)',
                  borderColor: 'var(--vv-borda)',
                  color: 'var(--vv-texto-primario)',
                }}
                value={form.contraindicacoes ?? ''}
                onChange={(e) => setForm({ ...form, contraindicacoes: e.target.value })}
                placeholder="Gestantes, insuficiência renal…"
              />
            </label>
          </div>

          <div className="mt-lg flex justify-end">
            <Botao onClick={salvar} disabled={form.nome.trim().length < 2 || salvando}>
              {salvando ? 'Salvando…' : 'Salvar no catálogo'}
            </Botao>
          </div>
        </Cartao>
      )}

      <Campo
        rotulo="Buscar"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Nome do item…"
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((item) => (
          <Cartao key={item.id}>
            <div className="flex items-start justify-between gap-sm">
              <h2 className="font-semibold">{item.nome}</h2>
              {item.escopo === 'GLOBAL' && <Etiqueta texto="Padrão" cor="var(--vv-texto-secundario)" />}
            </div>

            {item.apresentacao && (
              <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {item.apresentacao}
              </p>
            )}
            {item.principioAtivo && (
              <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {item.principioAtivo}
              </p>
            )}
            {item.contraindicacoes && (
              <p className="mt-sm text-xs" style={{ color: 'var(--vv-erro)' }}>
                ⚠ {item.contraindicacoes}
              </p>
            )}

            {item.escopo === 'PRIVADO' && (
              <div className="mt-md flex justify-end">
                <button
                  onClick={() => remover(item)}
                  className="text-sm underline"
                  style={{ color: 'var(--vv-texto-secundario)' }}
                >
                  Remover
                </button>
              </div>
            )}
          </Cartao>
        ))}
      </div>

      {itens.length === 0 && !erro && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>
          Nada aqui ainda. Cadastre o primeiro item para poder prescrevê-lo.
        </p>
      )}
    </div>
  );
}
