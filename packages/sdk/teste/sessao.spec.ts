import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * O aviso de sessão perdida.
 *
 * Ele vivia dentro do cliente HTTP da API: um 401, uma tentativa de renovar, e
 * se falhasse, `aoPerderSessao` — que na web manda para o login. Quando o
 * último grupo saiu da API, esse caminho ficou sem ninguém que o percorresse, e
 * o aviso parou de disparar **em silêncio**: a sessão morria e a tela seguia
 * mostrando a pessoa como logada, com cada consulta voltando vazia ou recusada.
 *
 * Nada quebrava de forma visível, e é por isso que precisa de prova. Os dois
 * lados importam: a sessão revogada TEM de avisar, e o "sair" que a pessoa
 * pediu NÃO pode avisar — senão a web recarregaria a página inteira em cima da
 * navegação que ela mesma já fez.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK: sessão perdida', () => {
  const marca = `prova-sessao-${Date.now()}`;
  const email = `${marca}@teste.com`;
  let admin: SupabaseClient;
  let usuarioId = '';

  const cliente = (aoPerderSessao: () => void): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
      aoPerderSessao,
    });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const nova = await admin.auth.admin.createUser({
      email,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: `Sessão ${marca}`, papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    usuarioId = nova.data.user!.id;
  });

  afterAll(async () => {
    await admin.from('PerfilAluno').delete().eq('userId', usuarioId);
    await admin.from('User').delete().eq('id', usuarioId);
    await admin.auth.admin.deleteUser(usuarioId);
  });

  it('sair porque pediu NÃO conta como sessão perdida', async () => {
    const aviso = vi.fn();
    const c = cliente(aviso);
    await c.auth.login({ email, senha: 'Senha@123' });

    await c.auth.logout();
    // O evento de saída é assíncrono: dá a ele a chance de chegar antes de
    // afirmar que não chegou.
    await new Promise((r) => setTimeout(r, 300));

    expect(aviso).not.toHaveBeenCalled();
  });

  it('sessão revogada e vencida avisa na renovação seguinte', async () => {
    /*
      O estado que precisa ser reproduzido é específico, e foi a primeira
      versão deste teste que o ensinou.

      O `supabase-js` NÃO derruba a sessão só porque a renovação foi recusada:
      se o token de acesso ainda vale, ele a preserva até o vencimento de
      verdade (a renovação era "proativa", e a pessoa ainda consegue consultar).
      A sessão só é dada como morta quando as duas coisas acontecem juntas — o
      token de acesso venceu E o refresh foi recusado. É esse o momento em que o
      aviso tem de disparar, e é esse o estado montado aqui.

      Esperar os 15 minutos do token não cabe num teste. Então o armazenamento é
      nosso, e o vencimento é antecipado na mão, depois de o refresh ter sido
      revogado no servidor — como acontece quando a pessoa troca a senha em
      outro aparelho ou a conta é desativada.
    */
    const guardado = new Map<string, string>();
    const aviso = vi.fn();
    const c = new VivioClient({
      supabase: {
        url: url!,
        chaveAnonima: anon!,
        persistirSessao: true,
        armazenamento: {
          getItem: (k) => guardado.get(k) ?? null,
          setItem: (k, v) => {
            guardado.set(k, v);
          },
          removeItem: (k) => {
            guardado.delete(k);
          },
        },
      },
      aoPerderSessao: aviso,
    });
    await c.auth.login({ email, senha: 'Senha@123' });
    // O relógio de renovação automática ficaria vivo depois do teste.
    await c.supabase.db.auth.stopAutoRefresh();

    const { data } = await c.supabase.db.auth.getSession();
    const revogacao = await admin.auth.admin.signOut(data.session!.access_token, 'global');
    expect(revogacao.error).toBeNull();

    for (const [chave, valor] of guardado) {
      const sessao = JSON.parse(valor) as { expires_at?: number };
      if (typeof sessao.expires_at !== 'number') continue;
      guardado.set(chave, JSON.stringify({ ...sessao, expires_at: Math.floor(Date.now() / 1000) - 60 }));
    }

    // Qualquer leitura da sessão tenta renovar um token vencido.
    await c.supabase.db.auth.getSession();

    await vi.waitFor(() => expect(aviso).toHaveBeenCalledTimes(1), { timeout: 5000 });
    // E quem perguntar quem está logado recebe "ninguém", e não um usuário
    // fantasma com cada consulta voltando vazia.
    expect(await c.supabase.usuarioAtual()).toBeNull();
  });
});
