import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Catálogo de alimentos pelo SDK, sem API.
 *
 * É o único grupo que não é de ninguém: conteúdo do produto, igual para todo
 * mundo autenticado. Por isso o que se prova aqui é diferente do resto — não
 * "quem vê o quê", mas se o número chega como NÚMERO e se a busca acha.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

describe.skipIf(!url || !anon)('SDK sem API: catálogo de alimentos', () => {
  const sdk = new VivioClient({
    baseUrl: 'http://127.0.0.1:1',
    supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
  });

  beforeAll(async () => {
    await sdk.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' });
  });

  it('lista alimentos com os macros como número', async () => {
    /*
      `numeric` volta do PostgREST como texto. Se escapasse assim, a soma da
      dieta viraria concatenação: "120" + "89" daria "12089" kcal em vez de
      209, e a tela mostraria o número sem reclamar de nada.
    */
    const lista = await sdk.alimentos.listar({ limit: 5 });
    expect(lista.length).toBeGreaterThan(0);
    for (const a of lista) {
      expect(typeof a.porcao100g.kcal).toBe('number');
      expect(typeof a.porcao100g.proteinaG).toBe('number');
      // Fibra ausente conta como zero, e não como nulo: a soma da dieta não
      // pode virar NaN por causa de um alimento sem o campo.
      expect(a.porcao100g.fibraG).not.toBeNull();
      expect(Number.isNaN(a.porcao100g.fibraG)).toBe(false);
    }
  });

  it('a busca por pedaço do nome ignora a caixa', async () => {
    const maiuscula = await sdk.alimentos.listar({ q: 'ARROZ', limit: 20 });
    const minuscula = await sdk.alimentos.listar({ q: 'arroz', limit: 20 });
    expect(maiuscula.length).toBeGreaterThan(0);
    expect(maiuscula.map((a) => a.id)).toEqual(minuscula.map((a) => a.id));
    expect(maiuscula.every((a) => a.nome.toLowerCase().includes('arroz'))).toBe(true);
  });

  it('filtra por grupo', async () => {
    const grupos = await sdk.alimentos.grupos();
    expect(grupos.length).toBeGreaterThan(0);
    // A função devolve os grupos distintos, em ordem.
    expect([...grupos].sort()).toEqual(grupos);
    expect(new Set(grupos).size).toBe(grupos.length);

    const doGrupo = await sdk.alimentos.listar({ grupo: grupos[0]!, limit: 10 });
    expect(doGrupo.every((a) => a.grupo === grupos[0])).toBe(true);
  });

  it('o limite é respeitado', async () => {
    expect(await sdk.alimentos.listar({ limit: 3 })).toHaveLength(3);
  });

  it('o catálogo é só de leitura, mesmo para o nutricionista', async () => {
    // Entrar no catálogo global é curadoria, não consequência de alguém
    // salvar: o importador da TACO escreve, com a chave de serviço.
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'nutri@viviofit.com.br',
      password: 'Senha@123',
    });
    const r = await bruto.from('Alimento').insert({
      id: `prova-${Date.now()}`,
      nome: 'Inventado',
      grupo: 'Nenhum',
      kcal: 1,
      proteinaG: 1,
      carboidratoG: 1,
      gorduraG: 1,
    });
    expect(r.error).not.toBeNull();
  });

  it('sem sessão, o catálogo não sai', async () => {
    // Nem o conteúdo do produto é público: a política exige sessão.
    const semSessao: SupabaseClient = createClient(url!, anon!, {
      auth: { persistSession: false },
    });
    const r = await semSessao.from('Alimento').select('id').limit(1);
    expect(r.data ?? []).toEqual([]);
  });
});
