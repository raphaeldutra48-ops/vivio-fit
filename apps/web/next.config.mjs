import { fileURLToPath } from 'node:url';

/**
 * Cabeçalhos de segurança.
 *
 * A auditoria de 22/09 achou o site sem nenhum deles. Nada aqui muda o que a
 * tela faz; muda o que o navegador aceita fazer com ela.
 *
 * O que NÃO está aqui, de propósito: uma `Content-Security-Policy` completa.
 * Ela exigiria nonce em cada script que o Next injeta, e uma política mal
 * ajustada quebra a aplicação inteira em produção sem avisar em teste. O que
 * entra é a parte que não depende de nonce e que fecha os buracos clássicos:
 * quem pode embutir a página, para onde um formulário pode enviar, e qual é a
 * base de URL relativa. O resto fica para quando houver CSP com nonce.
 */
const CABECALHOS = [
  // Um ano de HTTPS obrigatório, subdomínios inclusos. Sem `preload`: essa
  // lista é difícil de desfazer e vale o domínio inteiro, decisão do dono.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // O navegador não adivinha o tipo do arquivo — é o que transforma um upload
  // em script executável.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Ninguém embute o app num iframe: sem isso, uma página de fora sobrepõe
  // botões invisíveis aos nossos (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  /*
    Câmera liberada só para o próprio site (a tela de foto de evolução), e o
    resto fechado. `frame-ancestors` repete o X-Frame-Options para quem só
    entende CSP; `form-action` impede que um formulário nosso poste para fora.
  */
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacotes do monorepo são TypeScript compilado localmente, não publicados.
  transpilePackages: ['@vivio/sdk', '@vivio/ui', '@vivio/contracts'],
  /*
    Exigido pelo empacotador da Cloudflare, e não pela imagem Docker que já não
    existe: `opennextjs-cloudflare` lê `.next/standalone` para montar o Worker.
    Tirar esta linha derruba o build com "pages-manifest.json não encontrado" —
    foi o que aconteceu ao tentar removê-la junto com o Dockerfile.
  */
  output: 'standalone',
  // fileURLToPath e não `new URL(...).pathname`: no Windows o pathname vem como
  // "/C:/Users/..." e o Next não resolve esse caminho.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  /*
    O otimizador de imagens fica DESLIGADO.

    Ele foi o alvo de uma falha crítica do Next (execução remota de código,
    corrigida na 15.5.24 — a produção rodava 15.5.22 e o endpoint respondia).
    A versão subiu, e o endpoint sai junto: nenhuma tela usa `next/image`, e
    porta que não existe não precisa de correção na próxima vez.
  */
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: CABECALHOS }];
  },
};

export default nextConfig;
