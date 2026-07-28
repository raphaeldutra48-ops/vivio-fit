/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacotes do monorepo são TypeScript compilado localmente, não publicados.
  transpilePackages: ['@vivio/sdk', '@vivio/ui', '@vivio/contracts'],
};

export default nextConfig;
