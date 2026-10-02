/*
  O trabalhador de fundo que deixa o app instalável — e utilizável quando a
  rede oscila.

  ## O que ele NÃO faz, e por quê

  Não guarda nada de dado de aluno. Só passam por aqui os arquivos estáticos da
  interface (JavaScript, CSS, ícones) e uma página de "sem conexão". Resposta de
  API, do Supabase ou de qualquer outra origem passa direto, sem cópia: um cache
  de dado de saúde sobreviveria à saída da conta, e a pessoa seguinte a abrir o
  mesmo celular veria o que não é dela.

  Também não guarda página navegada. O painel é montado no cliente e o conteúdo
  vem por consulta; cachear o HTML só serviria para mostrar uma casca vazia
  parecendo dado velho.

  ## Estratégias

  - Arquivo com hash no nome (`/_next/static/...`): cache primeiro. O nome muda
    a cada build, então cópia velha nunca é servida por engano.
  - Navegação: rede primeiro; se a rede falhar, a página de sem conexão.
  - Todo o resto: rede, sem cache.
*/

const VERSAO = 'vivio-v2';
const ESTATICOS = `${VERSAO}-estaticos`;
const CASCA = `${VERSAO}-casca`;

/*
  Sem o `.html`, e isso não é estilo.

  O Worker que serve o site redireciona `/sem-conexao.html` para `/sem-conexao`
  (307), e `cache.addAll` REJEITA resposta redirecionada — a instalação inteira
  falhava por causa disso. Sem trabalhador instalado não há página de sem
  conexão e o Android não oferece "instalar": o app deixava de ser instalável em
  silêncio, porque nada disso dá erro visível.
*/
const SEM_CONEXAO = '/sem-conexao';

/*
  Guarda um a um, e não em lote.

  `addAll` é tudo ou nada: um arquivo que falhe derruba a instalação e leva
  junto o resto do trabalhador. Nada aqui é essencial a ponto de justificar
  isso — a página de sem conexão é uma cortesia, e o app funciona sem ela. O
  `catch` vazio é a decisão, não um descuido.
*/
/*
  Teto no cache de estáticos.

  Arquivo com hash no nome nunca serve errado, então a estratégia de "cache
  primeiro" está certa — mas nada apagava o que saiu de uso. A limpeza mora no
  `activate`, e `activate` só roda quando o PRÓPRIO trabalhador muda: `VERSAO` é
  constante neste arquivo, que não muda a cada publicação. Resultado: cada
  publicação acrescenta os pedaços novos e os antigos ficam para sempre, no
  armazenamento do celular de quem usa.

  O teto resolve sem depender de versão injetada no build. `cache.keys()` devolve
  na ordem de inserção, então os primeiros são os mais velhos — e apagar um
  pedaço ainda em uso não quebra nada: o `fetch` do navegador o busca de novo e
  ele volta para o cache.
*/
const MAXIMO_ESTATICOS = 150;

async function guardarEstatico(pedido, resposta) {
  const cache = await caches.open(ESTATICOS);
  await cache.put(pedido, resposta);
  const chaves = await cache.keys();
  const sobrando = chaves.length - MAXIMO_ESTATICOS;
  for (const velha of sobrando > 0 ? chaves.slice(0, sobrando) : []) {
    await cache.delete(velha);
  }
}

async function guardarCasca() {
  const cache = await caches.open(CASCA);
  await Promise.all(
    [SEM_CONEXAO, '/icone-192.png'].map(async (caminho) => {
      try {
        const resposta = await fetch(caminho, { cache: 'reload' });
        if (!resposta.ok) return;
        // `resposta.redirected` também é recusado pelo `put`: copiar o corpo
        // para uma resposta nova tira essa marca.
        await cache.put(caminho, new Response(await resposta.blob(), {
          status: 200,
          headers: resposta.headers,
        }));
      } catch {
        /* rede ruim na primeira visita não pode impedir a instalação. */
      }
    }),
  );
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(guardarCasca());
  // Assume o controle na primeira visita, em vez de só na próxima aba.
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((c) => !c.startsWith(VERSAO)).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);

  // Só GET e só a nossa origem. O resto — Supabase, player de vídeo, qualquer
  // API — o trabalhador nem toca.
  if (pedido.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icone-')) {
    evento.respondWith(
      caches.match(pedido).then(
        (guardado) =>
          guardado ??
          fetch(pedido).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              // Sem `await`: guardar é efeito colateral, e a resposta é da pessoa.
              guardarEstatico(pedido, copia).catch(() => undefined);
            }
            return resposta;
          }),
      ),
    );
    return;
  }

  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido).catch(() => caches.match(SEM_CONEXAO).then((r) => r ?? Response.error())),
    );
  }
});
