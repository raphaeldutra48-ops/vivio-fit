import Link from 'next/link';
import type { ReactNode } from 'react';
import { Marca } from './Marca';

/**
 * A moldura dos documentos legais (termos e privacidade).
 *
 * Eles são públicos de propósito: quem vai decidir se cria conta precisa ler
 * antes de entrar, e o aluno que recebe um convite precisa poder ler sem ter
 * conta nenhuma. Por isso ficam fora da área logada e não dependem do SDK.
 *
 * ## O aviso de rascunho, e quando tirá-lo
 *
 * O texto foi escrito a partir do que o sistema FAZ — as tabelas que existem,
 * os consentimentos que as políticas exigem, os serviços que recebem dado. Isso
 * é o que um advogado não tem como adivinhar, e é a parte difícil. O que falta é
 * o contrário: identificação do controlador, prazos de guarda, foro — que o
 * dono preenche — e a revisão de quem responde por isso profissionalmente.
 *
 * Enquanto houver `[PREENCHER]` no texto, o aviso fica. Ele existe para que
 * ninguém leia um rascunho achando que é compromisso firmado.
 */
export function DocumentoLegal({
  titulo,
  atualizadoEm,
  versao,
  children,
}: {
  titulo: string;
  atualizadoEm: string;
  versao: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen px-lg py-xl" style={{ background: 'var(--vv-fundo)' }}>
      <div className="mx-auto" style={{ maxWidth: '46rem' }}>
        <Link href="/login" className="inline-block mb-lg">
          <Marca />
        </Link>

        <div
          className="mb-lg rounded-lg p-md text-sm"
          style={{
            background: 'var(--vv-atencao-fundo, #FFF7E6)',
            color: 'var(--vv-texto-primario)',
            border: '1px solid var(--vv-borda)',
          }}
        >
          <strong>Rascunho.</strong> Este documento descreve fielmente como o sistema trata os
          dados, mas ainda não passou por revisão jurídica e tem trechos marcados como{' '}
          <code>[PREENCHER]</code>. Não use como compromisso firmado até a revisão.
        </div>

        <h1 className="text-2xl font-semibold mb-xs">{titulo}</h1>
        <p className="text-sm mb-xl" style={{ color: 'var(--vv-texto-secundario)' }}>
          Versão {versao} · atualizado em {atualizadoEm}
        </p>

        <article className="documento-legal">{children}</article>

        <nav className="mt-xl pt-lg text-sm" style={{ borderTop: '1px solid var(--vv-borda)' }}>
          <Link href="/termos" className="underline mr-lg">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="underline mr-lg">
            Política de privacidade
          </Link>
          <Link href="/login" className="underline">
            Entrar
          </Link>
        </nav>
      </div>
    </main>
  );
}

/** Uma seção numerada do documento. */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-lg">
      <h2 className="text-lg font-semibold mb-xs">{titulo}</h2>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--vv-texto-secundario)' }}>
        {children}
      </div>
    </section>
  );
}
