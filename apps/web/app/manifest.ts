import type { MetadataRoute } from 'next';

/**
 * O que faz o site virar aplicativo instalável no celular.
 *
 * O painel é usado em pé, no meio do atendimento: o profissional confere o
 * treino do aluno com o celular na mão. Instalado, ele abre sem barra de
 * endereço, entra na gaveta de aplicativos e guarda a sessão como qualquer
 * outro app — e, principalmente, volta para onde estava sem passar pelo
 * navegador.
 *
 * `display: standalone` é o que tira a barra. `id` fixo evita que uma mudança
 * de `start_url` no futuro faça o Android tratar como um aplicativo NOVO,
 * deixando o antigo instalado e órfão.
 *
 * Os ícones são gerados de `app/icon.svg`. O terceiro é `maskable`: o Android
 * recorta o ícone num formato próprio e come ~10% de cada borda — sem a versão
 * com margem, o desenho chega cortado.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Vívio Fit',
    short_name: 'Vívio',
    description: 'Treino, nutrição e saúde no mesmo lugar.',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FAFAFA',
    theme_color: '#0F9D6D',
    categories: ['health', 'fitness', 'medical'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icone-512-mascara.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
