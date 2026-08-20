import type { Metadata } from 'next';
import { areaTemaClaro, areaTemaEscuro, temaClaro, temaEscuro, type Tema } from '@vivio/ui';
import { SessaoProvider } from '../lib/sessao';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vívio Fit — Painel do profissional',
  description: 'Treino, nutrição e saúde integrados.',
};

const emKebab = (chave: string) => chave.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);

/** Gera as variáveis CSS a partir dos tokens — zero cor escrita à mão no CSS. */
function variaveis(tema: Tema): string {
  return Object.entries(tema)
    .map(([chave, valor]) => `--vv-${emKebab(chave)}:${valor}`)
    .join(';');
}

/**
 * As cores por área também viram variável.
 *
 * Elas existiam em `@vivio/ui` desde o começo e nunca chegavam ao CSS, então a
 * tela de dieta escrevia `#2A8CA3` à mão — e o app do aluno escrevia `#3AA8C1`
 * para a mesma área. A mesma coisa com duas cores, e nenhuma das duas seguindo
 * o tema.
 *
 * `cor` é para preenchimento; `texto` é a variante medida para ler sobre o
 * fundo do tema. Manter as duas evita que alguém use a de preenchimento como
 * texto, que é exatamente como o contraste se perde.
 */
function variaveisDeArea(areas: Record<string, { cor: string; texto: string }>): string {
  return Object.entries(areas)
    .flatMap(([area, { cor, texto }]) => [
      `--vv-area-${emKebab(area)}:${cor}`,
      `--vv-area-${emKebab(area)}-texto:${texto}`,
    ])
    .join(';');
}

const claro = `${variaveis(temaClaro)};${variaveisDeArea(areaTemaClaro)}`;
const escuro = `${variaveis(temaEscuro)};${variaveisDeArea(areaTemaEscuro)}`;

const cssDosTemas = `
:root{${claro}}
:root[data-tema="escuro"]{${escuro}}
@media (prefers-color-scheme: dark){
  :root:not([data-tema="claro"]){${escuro}}
}
`;

/**
 * Aplica o tema escolhido ANTES da primeira pintura.
 *
 * O servidor não tem como saber o que está no `localStorage` da pessoa. Sem
 * este script, quem escolheu "claro" num computador configurado no escuro veria
 * a tela nascer escura e virar clara — o piscar acontece em toda navegação, e é
 * pior do que não ter a opção.
 *
 * Roda síncrono no `<head>`, de propósito: é o único ponto em que dá para
 * decidir antes de o navegador pintar. `try/catch` porque armazenamento
 * bloqueado não pode derrubar o carregamento da página.
 */
const scriptDoTema = `
try{
  var t=localStorage.getItem('vivio:tema');
  if(t==='claro'||t==='escuro')document.documentElement.setAttribute('data-tema',t);
}catch(e){}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssDosTemas }} />
        <script dangerouslySetInnerHTML={{ __html: scriptDoTema }} />
      </head>
      <body>
        <SessaoProvider>{children}</SessaoProvider>
      </body>
    </html>
  );
}
