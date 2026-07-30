import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacotes do monorepo são TypeScript compilado localmente, não publicados.
  transpilePackages: ['@vivio/sdk', '@vivio/ui', '@vivio/contracts'],
  // Empacota só o necessário para rodar, com as dependências resolvidas do
  // workspace inteiro — sem isso a imagem carregaria o node_modules do monorepo.
  output: 'standalone',
  // fileURLToPath e não `new URL(...).pathname`: no Windows o pathname vem como
  // "/C:/Users/..." e o Next não resolve esse caminho.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
};

export default nextConfig;
