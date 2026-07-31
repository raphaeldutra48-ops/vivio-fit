'use client';

import {
  MIMES_DE_MATERIAL,
  ROTULO_DO_MIME,
  TAMANHO_MAXIMO_BYTES,
  formatarTamanho,
  type MaterialResumo,
} from '@vivio/contracts';
import { useEffect, useRef, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export default function Materiais() {
  const [materiais, setMateriais] = useState<MaterialResumo[]>([]);
  /** Só vínculos ativos: a API recusa compartilhar com quem não é seu aluno. */
  const [alunos, setAlunos] = useState<{ id: string; nome: string }[]>([]);
  const [etiqueta, setEtiqueta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [abrindo, setAbrindo] = useState(false);
  const [tipo, setTipo] = useState<'ARQUIVO' | 'LINK'>('ARQUIVO');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [url, setUrl] = useState('');
  const [etiquetasTexto, setEtiquetasTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  /** Material cujo painel de compartilhamento está aberto. */
  const [compartilhando, setCompartilhando] = useState<string | null>(null);

  const carregar = () =>
    sdk.materiais
      .listar(etiqueta || undefined)
      .then(setMateriais)
      .catch(() => setErro('Não foi possível carregar os materiais.'));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etiqueta]);

  useEffect(() => {
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then((vinculos) =>
        setAlunos(vinculos.map((v) => ({ id: v.contraparte.id, nome: v.contraparte.nome }))),
      )
      .catch(() => undefined);
  }, []);

  function limpar() {
    setAbrindo(false);
    setTitulo('');
    setDescricao('');
    setUrl('');
    setEtiquetasTexto('');
    setArquivo(null);
    if (campoArquivo.current) campoArquivo.current.value = '';
  }

  const problemaDoArquivo = (() => {
    if (tipo !== 'ARQUIVO' || !arquivo) return null;
    if (!MIMES_DE_MATERIAL.includes(arquivo.type as never)) {
      return 'Formato não aceito. Use PDF, imagem, vídeo MP4, áudio, planilha ou documento.';
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      return `Arquivo maior que ${formatarTamanho(TAMANHO_MAXIMO_BYTES)}.`;
    }
    return null;
  })();

  const podeSalvar =
    titulo.trim().length >= 2 &&
    !problemaDoArquivo &&
    (tipo === 'LINK' ? url.trim().startsWith('http') : Boolean(arquivo));

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const etiquetas = etiquetasTexto
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      if (tipo === 'LINK') {
        await sdk.materiais.criar({
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
          tipo: 'LINK',
          url: url.trim(),
          etiquetas,
        });
      } else {
        // Upload direto para o armazenamento: o arquivo não passa pela API.
        const autorizacao = await sdk.midia.autorizarUpload({
          tipo: 'MATERIAL',
          mimeType: arquivo!.type,
          tamanhoBytes: arquivo!.size,
        });
        await sdk.midia.enviarArquivo(autorizacao, arquivo!);

        await sdk.materiais.criar({
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
          tipo: 'ARQUIVO',
          chave: autorizacao.chave,
          nomeArquivo: arquivo!.name,
          mimeType: arquivo!.type,
          tamanhoBytes: arquivo!.size,
          etiquetas,
        });
      }

      limpar();
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o material.');
    } finally {
      setSalvando(false);
    }
  }

  async function abrir(m: MaterialResumo) {
    if (m.tipo === 'LINK') {
      window.open(m.url!, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const { url: assinada } = await sdk.materiais.abrir(m.id);
      window.open(assinada, '_blank', 'noopener,noreferrer');
    } catch {
      setErro('Não foi possível abrir o arquivo.');
    }
  }

  async function alternarCompartilhamento(m: MaterialResumo, alunoId: string) {
    const jaTem = m.compartilhadoCom.some((c) => c.alunoId === alunoId);
    try {
      if (jaTem) await sdk.materiais.descompartilhar(m.id, alunoId);
      else await sdk.materiais.compartilhar(m.id, { alunoIds: [alunoId] });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível alterar o compartilhamento.');
    }
  }

  async function remover(m: MaterialResumo) {
    if (!confirm(`Remover "${m.titulo}"?\n\nQuem já recebeu perde o acesso.`)) return;
    await sdk.materiais.remover(m.id).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Materiais</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            E-books, planilhas e vídeos de apoio. Só quem você escolher recebe.
          </p>
        </div>
        <Botao
          onClick={() => (abrindo ? limpar() : setAbrindo(true))}
          variante={abrindo ? 'neutra' : 'acao'}
        >
          {abrindo ? 'Cancelar' : '+ Novo material'}
        </Botao>
      </div>

      {abrindo && (
        <Cartao>
          <div className="mb-lg flex flex-wrap gap-sm">
            {(['ARQUIVO', 'LINK'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className="min-h-toque rounded-md border px-lg font-semibold"
                style={{
                  background: tipo === t ? 'var(--vv-acao-fundo)' : 'var(--vv-superficie)',
                  color: tipo === t ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
                  borderColor: tipo === t ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
                }}
              >
                {t === 'ARQUIVO' ? 'Enviar arquivo' : 'Link externo'}
              </button>
            ))}
          </div>

          <div className="grid gap-md">
            <Campo
              rotulo="Título"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Guia de alimentação pré-treino"
              autoFocus
            />

            {tipo === 'LINK' ? (
              <Campo
                rotulo="Endereço"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            ) : (
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Arquivo — até {formatarTamanho(TAMANHO_MAXIMO_BYTES)}
                </span>
                <input
                  ref={campoArquivo}
                  type="file"
                  accept={MIMES_DE_MATERIAL.join(',')}
                  className="min-h-toque rounded-md border p-sm"
                  style={entrada}
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                {arquivo && !problemaDoArquivo && (
                  <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {arquivo.name} · {formatarTamanho(arquivo.size)}
                  </span>
                )}
                {problemaDoArquivo && <Aviso tipo="erro">{problemaDoArquivo}</Aviso>}
              </label>
            )}

            <Campo
              rotulo="Descrição (opcional)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
            <Campo
              rotulo="Etiquetas, separadas por vírgula (opcional)"
              value={etiquetasTexto}
              onChange={(e) => setEtiquetasTexto(e.target.value)}
              placeholder="hipertrofia, iniciante"
            />
          </div>

          {erro && (
            <div className="mt-md">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}

          <div className="mt-lg flex justify-end">
            <Botao onClick={salvar} disabled={!podeSalvar || salvando}>
              {salvando ? 'Enviando…' : 'Salvar material'}
            </Botao>
          </div>
        </Cartao>
      )}

      {!abrindo && (
        <Campo
          rotulo="Filtrar por etiqueta"
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value.toLowerCase())}
          placeholder="hipertrofia"
        />
      )}

      {!abrindo && erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-md lg:grid-cols-2">
        {materiais.map((m) => (
          <Cartao key={m.id}>
            <div className="flex items-start justify-between gap-sm">
              <div>
                <h2 className="font-semibold">{m.titulo}</h2>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {m.tipo === 'LINK'
                    ? 'Link externo'
                    : `${ROTULO_DO_MIME[m.mimeType ?? ''] ?? 'Arquivo'} · ${formatarTamanho(m.tamanhoBytes)}`}
                </p>
              </div>
              <Botao variante="neutra" onClick={() => abrir(m)}>
                Abrir
              </Botao>
            </div>

            {m.descricao && (
              <p className="mt-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {m.descricao}
              </p>
            )}

            {m.etiquetas.length > 0 && (
              <div className="mt-md flex flex-wrap gap-xs">
                {m.etiquetas.map((e) => (
                  <Etiqueta key={e} texto={e} cor="var(--vv-texto-secundario)" />
                ))}
              </div>
            )}

            <div className="mt-md">
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {m.compartilhadoCom.length === 0
                  ? 'Ainda não compartilhado'
                  : `Com ${m.compartilhadoCom.length} ${m.compartilhadoCom.length === 1 ? 'aluno' : 'alunos'} · ${m.compartilhadoCom.filter((c) => c.vistoEm).length} já abriram`}
              </p>

              <button
                onClick={() => setCompartilhando(compartilhando === m.id ? null : m.id)}
                className="mt-sm text-sm underline"
                style={{ color: 'var(--vv-texto-secundario)' }}
              >
                {compartilhando === m.id ? 'Fechar' : 'Escolher quem recebe'}
              </button>

              {compartilhando === m.id && (
                <div className="mt-md flex flex-wrap gap-sm">
                  {alunos.map((a) => {
                    const compartilhado = m.compartilhadoCom.find((c) => c.alunoId === a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => alternarCompartilhamento(m, a.id)}
                        aria-pressed={Boolean(compartilhado)}
                        className="min-h-toque rounded-md border px-lg text-sm"
                        style={{
                          background: compartilhado
                            ? 'var(--vv-acao-fundo)'
                            : 'var(--vv-superficie)',
                          color: compartilhado
                            ? 'var(--vv-acao-texto)'
                            : 'var(--vv-texto-primario)',
                          borderColor: compartilhado ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
                        }}
                      >
                        {compartilhado ? '✓ ' : ''}
                        {a.nome}
                        {compartilhado?.vistoEm && ' · viu'}
                      </button>
                    );
                  })}
                  {alunos.length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      Nenhum aluno ativo na carteira.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-md flex justify-end">
              <button
                onClick={() => remover(m)}
                className="text-sm underline"
                style={{ color: 'var(--vv-texto-secundario)' }}
              >
                Remover
              </button>
            </div>
          </Cartao>
        ))}
      </div>

      {materiais.length === 0 && !abrindo && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>
          {etiqueta
            ? 'Nenhum material com essa etiqueta.'
            : 'Nenhum material ainda. Suba um PDF ou cole um link de vídeo para compartilhar com seus alunos.'}
        </p>
      )}
    </div>
  );
}
