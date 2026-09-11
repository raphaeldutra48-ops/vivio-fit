'use client';

/**
 * Player de vídeo hospedado fora, dentro da tela.
 *
 * É a demonstração do acervo do Prime: o arquivo não sai da conta deles, e o
 * player oficial é o jeito autorizado de assistir. Para quem está na tela,
 * toca aqui mesmo, sem sair do app.
 *
 * Recebe a URL já aprovada por `videoDeMaiorPrioridade` — lista fechada de
 * hosts e parâmetros de demonstração aplicados. Este componente não decide o
 * que tocar; só mostra.
 *
 * `sandbox` deixa o player rodar (script e o próprio armazenamento) e tira
 * dele o que não precisa: navegar a nossa página, abrir janela, enviar
 * formulário. É página de terceiro rodando ao lado da sessão do usuário.
 */
export function PlayerExterno({ url, titulo }: { url: string; titulo: string }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-md"
      style={{ aspectRatio: '16 / 9', background: '#000' }}
    >
      <iframe
        src={url}
        title={`Demonstração: ${titulo}`}
        loading="lazy"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
