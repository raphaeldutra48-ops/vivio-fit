import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * A instalação do trabalhador de fundo.
 *
 * Vale teste por causa do modo como ele falha: **em silêncio**. Trabalhador que
 * não instala não dá erro na tela, não aparece no console de quem usa e não
 * quebra nada visível — o Android simplesmente deixa de oferecer "instalar", e
 * a página de sem conexão nunca existe. Foi exatamente o que aconteceu em
 * produção: o Worker que serve o site redireciona `/sem-conexao.html` para
 * `/sem-conexao`, e `cache.addAll` recusa resposta redirecionada.
 *
 * O arquivo é JavaScript puro, sem `import`, então roda aqui dentro de um
 * ambiente de mentira — com `caches` e `fetch` que a gente controla.
 */
type Ouvinte = (evento: { waitUntil: (p: Promise<unknown>) => void }) => void;

interface AmbienteFalso {
  instalar: () => Promise<void>;
  /** Dispara o ouvinte de `fetch` como o navegador faria, e espera o efeito. */
  pedir: (url: string) => Promise<void>;
  guardados: Map<string, Response>;
}

function carregarTrabalhador(fetchFalso: typeof fetch): AmbienteFalso {
  const codigo = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
  const guardados = new Map<string, Response>();
  const ouvintes = new Map<string, Ouvinte>();

  /*
    O trabalhador guarda por CAMINHO na instalação e por PEDIDO no `fetch` — o
    navegador aceita os dois, e o cache de mentira precisa aceitar também. Sem
    isto, as chaves do mapa viravam objetos e nenhuma asserção sobre URL casava.
  */
  const chaveDe = (c: string | { url: string }): string => (typeof c === 'string' ? c : c.url);

  /*
    Um cache POR NOME, como no navegador.

    A primeira versão deste dublê devolvia o mesmo cache para qualquer nome, e a
    prova do teto saiu errada por isso: ao podar os estáticos, a página de sem
    conexão — que vive no cache da casca — ia junto. O defeito era do dublê, não
    do trabalhador. Cache compartilhado num teste de cache é simular o contrário
    do que se quer provar.
  */
  const porCache = new Map<string, Map<string, Response>>();
  const abrir = (nome: string) => {
    const meu = porCache.get(nome) ?? new Map<string, Response>();
    porCache.set(nome, meu);
    return {
      put: (bruta: string | { url: string }, resposta: Response) => {
        const chave = chaveDe(bruta);
        // O navegador recusa resposta redirecionada aqui — é o defeito que este
        // arquivo existe para não deixar voltar.
        if (resposta.redirected) throw new TypeError('Response is redirected');
        meu.set(chave, resposta);
        guardados.set(chave, resposta);
        return Promise.resolve();
      },
      addAll: (caminhos: string[]) =>
        Promise.all(
          caminhos.map(async (c) => {
            const r = await fetchFalso(c);
            if (r.redirected) throw new TypeError('Response is redirected');
            meu.set(c, r);
            guardados.set(c, r);
          }),
        ),
      match: (chave: string | { url: string }) => Promise.resolve(meu.get(chaveDe(chave))),
      // `keys()` na ordem de inserção, como o navegador — é dela que o teto
      // depende para saber quem é o mais velho.
      keys: () => Promise.resolve([...meu.keys()]),
      delete: (chave: string | { url: string }) => {
        const k = chaveDe(chave);
        guardados.delete(k);
        return Promise.resolve(meu.delete(k));
      },
    };
  };

  const self = {
    addEventListener: (nome: string, fn: Ouvinte) => ouvintes.set(nome, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://app.viviofit.com.br' },
  };

  const caches = {
    open: (nome: string) => Promise.resolve(abrir(nome)),
    keys: () => Promise.resolve([...porCache.keys()]),
    delete: (nome: string) => Promise.resolve(porCache.delete(nome)),
    // `caches.match` procura em TODOS os caches, e é assim que o trabalhador
    // acha a página de sem conexão sem saber em qual ela está.
    match: (chave: string) => Promise.resolve(guardados.get(chave)),
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'Response', 'URL', codigo)(
    self,
    caches,
    fetchFalso,
    Response,
    URL,
  );

  return {
    guardados,
    instalar: async () => {
      const pendentes: Promise<unknown>[] = [];
      ouvintes.get('install')!({ waitUntil: (p) => pendentes.push(p) });
      await Promise.all(pendentes);
    },
    pedir: async (url: string) => {
      let resposta: Promise<unknown> = Promise.resolve();
      const evento = {
        request: { method: 'GET', url, mode: 'no-cors' },
        waitUntil: (p: Promise<unknown>) => p,
        respondWith: (p: Promise<unknown>) => {
          resposta = p;
        },
      };
      (ouvintes.get('fetch') as unknown as (e: typeof evento) => void)(evento);
      await resposta;
      // O guardar é efeito colateral solto: uma volta na fila basta para ele
      // terminar, e é assim que o navegador também se comporta.
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** Responde como o Worker da Cloudflare: `.html` vira redirecionamento. */
function servidorComRedirecionamento(): typeof fetch {
  // O parâmetro é `string` porque o trabalhador só pede caminhos: tipá-lo como
  // `RequestInfo` obrigaria a tratar um `Request` que nunca chega aqui.
  return (async (alvo: string | { url: string }) => {
    const caminho = typeof alvo === 'string' ? alvo : alvo.url;
    if (caminho.endsWith('.html')) {
      const r = new Response('<html>offline</html>', { status: 200 });
      // `fetch` segue o 307 sozinho e devolve a resposta final MARCADA.
      Object.defineProperty(r, 'redirected', { value: true });
      return r;
    }
    return new Response('conteúdo', { status: 200 });
  }) as unknown as typeof fetch;
}

describe('instalação do trabalhador de fundo', () => {
  it('guarda a página de sem conexão sem esbarrar no redirecionamento', async () => {
    const amb = carregarTrabalhador(servidorComRedirecionamento());
    await amb.instalar();

    /*
      O caminho pedido não tem `.html` — é o endereço que o Worker serve sem
      redirecionar. E o que foi guardado é uma resposta NOVA, sem a marca de
      redirecionada, porque `cache.put` recusa a original.
    */
    expect([...amb.guardados.keys()]).toContain('/sem-conexao');
    expect([...amb.guardados.keys()]).not.toContain('/sem-conexao.html');
    expect(amb.guardados.get('/sem-conexao')!.redirected).toBe(false);
  });

  it('um arquivo que falha não derruba a instalação inteira', async () => {
    /*
      `addAll` é tudo ou nada, e nada aqui é essencial a ponto de justificar
      isso: a página de sem conexão é cortesia, e o app funciona sem ela. O que
      NÃO pode acontecer é o trabalhador não instalar — aí some também a
      possibilidade de instalar o app.
    */
    const soIconeFalha = (async (caminho: string) => {
      if (caminho.includes('icone')) throw new TypeError('rede caiu');
      return new Response('<html>offline</html>', { status: 200 });
    }) as unknown as typeof fetch;

    const amb = carregarTrabalhador(soIconeFalha);
    await expect(amb.instalar()).resolves.toBeUndefined();
    expect([...amb.guardados.keys()]).toContain('/sem-conexao');
  });

  it('assume o controle na primeira visita', async () => {
    // Sem isto, a primeira visita fica sem trabalhador nenhum e a instalação só
    // valeria na próxima aba — que muita gente nunca abre.
    const codigo = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
    expect(codigo).toContain('skipWaiting');
    expect(codigo).toContain('clients.claim');
  });

  it('o cache de estáticos tem teto, e apaga o mais velho primeiro', async () => {
    /*
      O defeito que esta prova fixa, e o motivo de ele ser invisível: a limpeza
      do cache mora no `activate`, e `activate` só roda quando o PRÓPRIO
      trabalhador muda. `VERSAO` é constante no arquivo, que não muda a cada
      publicação — então nada nunca apagava, e cada publicação acrescentava os
      pedaços novos no armazenamento do celular de quem usa, para sempre.

      Apagar um pedaço ainda em uso não quebra nada: o navegador o busca de novo
      e ele volta para o cache. O que não volta é o de duas publicações atrás.
    */
    const amb = carregarTrabalhador(servidorComRedirecionamento());
    await amb.instalar();
    const daCasca = amb.guardados.size;

    // 160 pedaços com hash, acima do teto de 150.
    for (let i = 0; i < 160; i++) {
      await amb.pedir(`https://app.viviofit.com.br/_next/static/chunks/${i}-abc.js`);
    }

    const estaticos = [...amb.guardados.keys()].filter((k) => k.includes('/_next/static/'));
    expect(estaticos.length).toBeLessThanOrEqual(150);
    // Os mais velhos saíram; os mais novos ficaram.
    expect(estaticos.some((k) => k.includes('/0-abc.js'))).toBe(false);
    expect(estaticos.some((k) => k.includes('/159-abc.js'))).toBe(true);
    // E a casca não foi levada junto: ela vive em outro cache.
    expect(amb.guardados.has('/sem-conexao')).toBe(true);
    expect(daCasca).toBeGreaterThan(0);
  });

  it('não guarda nada que não seja estático da interface', async () => {
    /*
      A regra que protege o dado: cache de resposta do Supabase sobreviveria à
      saída da conta, e a pessoa seguinte a abrir o mesmo celular veria o que
      não é dela. O trabalhador só toca `/_next/static/` e `/icone-`.
    */
    const codigo = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
    expect(codigo).toContain("url.origin !== self.location.origin");
    expect(codigo).toContain("pedido.method !== 'GET'");
    expect(codigo).toMatch(/_next\/static\//);
  });
});
