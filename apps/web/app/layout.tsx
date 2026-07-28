import type { Metadata } from 'next';
import { temaClaro, temaEscuro, type Tema } from '@vivio/ui';
import { SessaoProvider } from '../lib/sessao';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vívio Fit — Painel do profissional',
  description: 'Treino, nutrição e saúde integrados.',
};

/** Gera as variáveis CSS a partir dos tokens — zero cor escrita à mão no CSS. */
function variaveis(tema: Tema): string {
  return Object.entries(tema)
    .map(([chave, valor]) => `--vv-${chave.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}:${valor}`)
    .join(';');
}

const cssDosTemas = `
:root{${variaveis(temaClaro)}}
:root[data-tema="escuro"]{${variaveis(temaEscuro)}}
@media (prefers-color-scheme: dark){
  :root:not([data-tema="claro"]){${variaveis(temaEscuro)}}
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssDosTemas }} />
      </head>
      <body>
        <SessaoProvider>{children}</SessaoProvider>
      </body>
    </html>
  );
}
