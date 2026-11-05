import type { Metadata } from 'next';
import Link from 'next/link';
import { Marca } from '../components/Marca';

export const metadata: Metadata = {
  title: 'Página não encontrada — Vívio Fit',
};

/**
 * O 404 do site, em português.
 *
 * Sem este arquivo o Next mostra a página padrão dele: "404: This page could not
 * be found.", em inglês, num produto que fala português em cada botão. Conferido
 * no ar em 05/11/2026. Quem mais cai aqui é quem recebeu um link — o endereço da
 * página de um profissional digitado com uma letra trocada, um convite colado
 * pela metade —, e para essa pessoa a primeira impressão do Vívio Fit era uma
 * frase em outra língua dizendo que nada existe.
 *
 * O botão leva para `/`, que já decide sozinho para onde cada um vai: login,
 * painel do profissional, ou o aviso de que o aluno usa o aplicativo.
 */
export default function NaoEncontrada() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-lg py-xl"
      style={{ background: 'var(--vv-fundo)' }}
    >
      <div className="text-center" style={{ maxWidth: '28rem' }}>
        <Link href="/" className="inline-block mb-lg">
          <Marca />
        </Link>
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          O endereço pode ter sido digitado com algum erro, ou a página saiu do ar. Se alguém te
          mandou este link, vale pedir o endereço de novo.
        </p>
        <Link href="/" className="mt-lg inline-block font-semibold underline">
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
