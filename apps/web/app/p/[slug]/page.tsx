'use client';

import { linkDoWhatsapp, type PaginaPublica } from '@vivio/contracts';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marca } from '../../../components/Marca';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

const NOME_DO_PAPEL: Record<string, string> = {
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico',
};

export default function PaginaDoProfissional() {
  const { slug } = useParams<{ slug: string }>();
  const [pagina, setPagina] = useState<PaginaPublica | null>(null);
  const [naoExiste, setNaoExiste] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    sdk.site
      .porSlug(slug)
      .then(setPagina)
      .catch(() => setNaoExiste(true));
  }, [slug]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await sdk.site.enviarPedido(slug, {
        nome: nome.trim(),
        email: email.trim(),
        telefone: telefone.trim() || undefined,
        mensagem: mensagem.trim() || undefined,
      });
      setEnviado(true);
    } catch {
      setErro('Não foi possível enviar agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  if (naoExiste) {
    return (
      <main className="grid min-h-dvh place-items-center p-lg">
        <div className="w-full max-w-sm text-center">
          <Marca tamanho={32} id="404" />
          <p className="mt-xl text-lg font-semibold">Página não encontrada</p>
          <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Este endereço não existe ou saiu do ar.
          </p>
        </div>
      </main>
    );
  }

  if (!pagina) {
    return (
      <main className="grid min-h-dvh place-items-center p-lg">
        <Aviso tipo="info">Carregando…</Aviso>
      </main>
    );
  }

  const zap = linkDoWhatsapp(pagina.whatsapp);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-xl p-lg">
      <header className="pt-xl">
        <p className="text-sm uppercase" style={{ color: 'var(--vv-texto-secundario)' }}>
          {NOME_DO_PAPEL[pagina.profissional.papel] ?? pagina.profissional.papel}
        </p>
        <h1 className="mt-xs text-3xl font-bold">{pagina.titulo}</h1>
        <p className="mt-md text-lg">{pagina.profissional.nome}</p>

        {/* Registro no conselho em destaque: é o que dá confiança a quem não
            conhece o profissional, e a divulgação é exigida pelos conselhos. */}
        <p className="mt-xs text-sm tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
          {pagina.profissional.registroConselho}/{pagina.profissional.ufRegistro}
          {pagina.cidade && ` · ${pagina.cidade}${pagina.uf ? `/${pagina.uf}` : ''}`}
        </p>

        <div className="mt-md flex flex-wrap gap-sm">
          {pagina.atendeOnline && <Etiqueta texto="Atende online" cor="var(--vv-texto-secundario)" />}
          {pagina.atendePresencial && (
            <Etiqueta texto="Atende presencial" cor="var(--vv-texto-secundario)" />
          )}
          {pagina.profissional.especialidades.map((e) => (
            <Etiqueta key={e} texto={e} cor="var(--vv-texto-secundario)" />
          ))}
        </div>
      </header>

      {pagina.apresentacao && (
        <section>
          <p className="whitespace-pre-line text-lg leading-relaxed">{pagina.apresentacao}</p>
        </section>
      )}

      {(zap || pagina.instagram) && (
        <section className="flex flex-wrap gap-md">
          {zap && (
            <a href={zap} target="_blank" rel="noopener noreferrer">
              <Botao>Chamar no WhatsApp</Botao>
            </a>
          )}
          {pagina.instagram && (
            <a
              href={`https://instagram.com/${pagina.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Botao variante="neutra">@{pagina.instagram}</Botao>
            </a>
          )}
        </section>
      )}

      <section>
        <Cartao>
          {enviado ? (
            <>
              <p className="mb-xs text-lg font-semibold">Recebido!</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {pagina.profissional.nome.split(' ')[0]} vai entrar em contato pelo e-mail que você
                deixou.
              </p>
            </>
          ) : (
            <form onSubmit={enviar} className="flex flex-col gap-lg">
              <div>
                <p className="text-lg font-semibold">Quer começar?</p>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Deixe seu contato que retornamos.
                </p>
              </div>

              <Campo
                rotulo="Seu nome"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              <Campo
                rotulo="E-mail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Campo
                rotulo="Telefone (opcional)"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Mensagem (opcional)
                </span>
                <textarea
                  className="min-h-[90px] rounded-md border p-md"
                  style={entrada}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Conte um pouco do seu objetivo."
                />
              </label>

              {erro && <Aviso tipo="erro">{erro}</Aviso>}

              <Botao
                type="submit"
                disabled={enviando || nome.trim().length < 2 || !email.includes('@')}
              >
                {enviando ? 'Enviando…' : 'Enviar contato'}
              </Botao>
            </form>
          )}
        </Cartao>
      </section>

      <footer className="mt-auto flex flex-col items-center gap-sm py-xl">
        <Marca tamanho={22} id="rodape" />
        <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
          Página feita no Vívio Fit
        </p>
      </footer>
    </main>
  );
}
