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
  guardados: Map<string, Response>;
}

function carregarTrabalhador(fetchFalso: typeof fetch): AmbienteFalso {
  const codigo = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
  const guardados = new Map<string, Response>();
  const ouvintes = new Map<string, Ouvinte>();

  const cacheFalso = {
    put: (chave: string, resposta: Response) => {
      // O navegador recusa resposta redirecionada aqui — é o defeito que este
      // arquivo existe para não deixar voltar.
      if (resposta.redirected) throw new TypeError('Response is redirected');
      guardados.set(chave, resposta);
      return Promise.resolve();
    },
    addAll: (caminhos: string[]) =>
      Promise.all(
        caminhos.map(async (c) => {
          const r = await fetchFalso(c);
          if (r.redirected) throw new TypeError('Response is redirected');
          guardados.set(c, r);
        }),
      ),
    match: (chave: string) => Promise.resolve(guardados.get(chave)),
  };

  const self = {
    addEventListener: (nome: string, fn: Ouvinte) => ouvintes.set(nome, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://app.viviofit.com.br' },
  };

  const caches = {
    open: () => Promise.resolve(cacheFalso),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    match: (chave: string) => Promise.resolve(guardados.get(chave)),
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
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
  };
}

/** Responde como o Worker da Cloudflare: `.html` vira redirecionamento. */
function servidorComRedirecionamento(): typeof fetch {
  // O parâmetro é `string` porque o trabalhador só pede caminhos: tipá-lo como
  // `RequestInfo` obrigaria a tratar um `Request` que nunca chega aqui.
  return (async (caminho: string) => {
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
