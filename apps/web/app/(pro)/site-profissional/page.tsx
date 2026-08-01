'use client';

import {
  slugSchema,
  sugerirSlug,
  type PedidoResumo,
  type PerfilPublicoResumo,
} from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';
import { useSessao } from '../../../lib/sessao';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export default function SiteProfissional() {
  const { usuario } = useSessao();
  const [perfil, setPerfil] = useState<PerfilPublicoResumo | null>(null);
  const [pedidos, setPedidos] = useState<PedidoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [slug, setSlug] = useState('');
  const [titulo, setTitulo] = useState('');
  const [apresentacao, setApresentacao] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('CE');
  const [atendeOnline, setOnline] = useState(true);
  const [atendePresencial, setPresencial] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [publicado, setPublicado] = useState(false);

  const carregar = async () => {
    const p = await sdk.site.meu().catch(() => null);
    if (p) {
      setPerfil(p);
      setSlug(p.slug);
      setTitulo(p.titulo);
      setApresentacao(p.apresentacao ?? '');
      setCidade(p.cidade ?? '');
      setUf(p.uf ?? 'CE');
      setOnline(p.atendeOnline);
      setPresencial(p.atendePresencial);
      setWhatsapp(p.whatsapp ?? '');
      setInstagram(p.instagram ?? '');
      setPublicado(p.publicado);
    } else if (usuario) {
      // Primeira visita: sugere um endereço a partir do nome.
      setSlug(sugerirSlug(usuario.nome));
      setTitulo(`Acompanhamento com ${usuario.nome.split(' ')[0]}`);
    }
    setPedidos(await sdk.site.listarPedidos().catch(() => []));
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  const erroDoSlug = slug ? slugSchema.safeParse(slug).error?.issues[0]?.message : undefined;
  const podeSalvar = !erroDoSlug && slug.length >= 3 && titulo.trim().length >= 3;

  async function salvar(publicar: boolean) {
    setErro(null);
    setAviso(null);
    setSalvando(true);
    try {
      const salvo = await sdk.site.salvar({
        slug,
        titulo: titulo.trim(),
        apresentacao: apresentacao.trim() || undefined,
        cidade: cidade.trim() || undefined,
        uf: uf || undefined,
        atendeOnline,
        atendePresencial,
        whatsapp: whatsapp.replace(/\D/g, '') || undefined,
        instagram: instagram.trim().replace(/^@/, '') || undefined,
        publicado: publicar,
      });
      setPerfil(salvo);
      setPublicado(salvo.publicado);
      setAviso(salvo.publicado ? 'Página publicada.' : 'Rascunho salvo.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtendido(p: PedidoResumo) {
    await sdk.site.marcarAtendido(p.id).catch(() => undefined);
    setPedidos(await sdk.site.listarPedidos().catch(() => pedidos));
  }

  const enderecoCompleto =
    typeof window !== 'undefined' ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Site profissional</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Uma página para divulgar seu trabalho e receber pedidos de contato.
        </p>
      </div>

      <Cartao>
        <div className="grid gap-md">
          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Endereço da página
            </span>
            <div className="flex flex-wrap items-center gap-sm">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                /p/
              </span>
              <input
                className="min-h-toque flex-1 rounded-md border px-md"
                style={{ ...entrada, borderColor: erroDoSlug ? 'var(--vv-erro)' : 'var(--vv-borda)' }}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
            </div>
            {erroDoSlug ? (
              <span className="text-sm" style={{ color: 'var(--vv-erro)' }} role="alert">
                {erroDoSlug}
              </span>
            ) : (
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {enderecoCompleto}
              </span>
            )}
          </label>

          <Campo
            rotulo="Título da página"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Treino que cabe na sua rotina"
          />

          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Apresentação
            </span>
            <textarea
              className="min-h-[120px] rounded-md border p-md"
              style={entrada}
              value={apresentacao}
              onChange={(e) => setApresentacao(e.target.value)}
              placeholder="Conte como você trabalha e para quem. Quem lê está decidindo se te procura."
            />
          </label>

          <div className="grid gap-md sm:grid-cols-[1fr_100px]">
            <Campo
              rotulo="Cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                UF
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={uf}
                onChange={(e) => setUf(e.target.value)}
              >
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="flex flex-wrap gap-lg">
            <legend className="mb-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Como atende
            </legend>
            <label className="flex items-center gap-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={atendeOnline}
                onChange={(e) => setOnline(e.target.checked)}
              />
              <span>Online</span>
            </label>
            <label className="flex items-center gap-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={atendePresencial}
                onChange={(e) => setPresencial(e.target.checked)}
              />
              <span>Presencial</span>
            </label>
          </fieldset>

          <div className="grid gap-md sm:grid-cols-2">
            <Campo
              rotulo="WhatsApp (só números, com DDD)"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              inputMode="numeric"
              placeholder="85999998888"
            />
            <Campo
              rotulo="Instagram (opcional)"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@seuperfil"
            />
          </div>
        </div>

        {erro && (
          <div className="mt-md">
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}
        {aviso && (
          <div className="mt-md">
            <Aviso tipo="info">{aviso}</Aviso>
          </div>
        )}

        <div className="mt-lg flex flex-wrap items-center justify-between gap-md">
          <div className="flex items-center gap-sm">
            <Etiqueta
              texto={publicado ? 'No ar' : 'Rascunho'}
              cor={publicado ? 'var(--vv-sucesso)' : 'var(--vv-texto-secundario)'}
            />
            {publicado && (
              <a href={`/p/${slug}`} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                Ver página ↗
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-sm">
            <Botao variante="neutra" onClick={() => salvar(false)} disabled={!podeSalvar || salvando}>
              {publicado ? 'Tirar do ar' : 'Salvar rascunho'}
            </Botao>
            <Botao onClick={() => salvar(true)} disabled={!podeSalvar || salvando}>
              {salvando ? 'Salvando…' : publicado ? 'Salvar e manter no ar' : 'Publicar'}
            </Botao>
          </div>
        </div>

        {!publicado && (
          <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Publicar exige que seu registro no conselho já tenha sido verificado pela plataforma.
          </p>
        )}
      </Cartao>

      <div>
        <h2 className="mb-md text-lg font-semibold">
          Pedidos de contato
          {perfil && perfil.pedidosPendentes > 0 && (
            <span className="ml-sm text-sm" style={{ color: 'var(--vv-erro)' }}>
              {perfil.pedidosPendentes} novos
            </span>
          )}
        </h2>

        <div className="flex flex-col gap-md">
          {pedidos.map((p) => (
            <Cartao key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <p className="font-semibold">{p.nome}</p>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    <a href={`mailto:${p.email}`} className="underline">
                      {p.email}
                    </a>
                    {p.telefone && ` · ${p.telefone}`}
                    {' · '}
                    {new Date(p.criadoEm).toLocaleDateString('pt-BR')}
                  </p>
                  {p.mensagem && <p className="mt-sm">{p.mensagem}</p>}
                </div>
                <Botao variante="neutra" onClick={() => alternarAtendido(p)}>
                  {p.atendidoEm ? 'Reabrir' : 'Marcar como atendido'}
                </Botao>
              </div>
            </Cartao>
          ))}

          {pedidos.length === 0 && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>
              Nenhum pedido ainda. Divulgue o endereço da sua página nas redes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
