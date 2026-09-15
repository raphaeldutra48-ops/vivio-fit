import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Meu cadastro, pelo SDK, sem API.
 *
 * O que este arquivo realmente prova não é a edição — é o que a edição NÃO
 * consegue fazer. Três invariantes que não podem morar no cliente, porque o
 * cliente é justamente quem tentaria contorná-las:
 *
 *   1. trocar o registro no conselho revoga a verificação;
 *   2. ninguém se verifica;
 *   3. ninguém troca o próprio papel.
 *
 * Por isso metade das asserções vai pelo `supabase` cru, e não pelo SDK: o SDK
 * não oferece esses caminhos, e o que se quer provar é que o BANCO recusa
 * mesmo quando alguém tenta por fora dele.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: meu cadastro', () => {
  const marca = `prova-perfil-${Date.now()}`;
  const email = `${marca}@teste.com`;
  const userId = `${marca}-pro`;
  let admin: SupabaseClient;
  let idNoAuth = '';
  let bruto: SupabaseClient;

  const pro = new VivioClient({
    supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
  });

  const cabecalhos = (): Record<string, string> => ({
    apikey: servico!,
    Authorization: `Bearer ${servico!}`,
    'Content-Type': 'application/json',
  });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });

    await admin.from('User').insert({
      id: userId,
      email,
      nome: 'Dra. Prova',
      papel: 'MEDICO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('PerfilProfissional').insert({
      userId,
      tipo: 'MEDICO',
      registroConselho: '123456',
      ufRegistro: 'SP',
      especialidades: ['Clínica'],
      // Já verificada: é o estado a partir do qual as regras têm sentido.
      verificadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });

    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({ email, password: 'Senha@123', email_confirm: true }),
    });
    const criado = (await r.json()) as { id?: string };
    if (!criado.id) throw new Error(`Auth recusou: ${JSON.stringify(criado)}`);
    idNoAuth = criado.id;

    await pro.auth.login({ email, senha: 'Senha@123' });
    bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email, password: 'Senha@123' });
  });

  afterAll(async () => {
    await admin.from('PerfilProfissional').delete().eq('userId', userId);
    await admin.from('User').delete().eq('id', userId);
    if (idNoAuth) {
      await fetch(`${url}/auth/v1/admin/users/${idNoAuth}`, {
        method: 'DELETE',
        headers: cabecalhos(),
      });
    }
  });

  it('lê o próprio cadastro com o perfil profissional junto', async () => {
    const p = await pro.me.perfil();
    expect(p.email).toBe(email);
    expect(p.papel).toBe('MEDICO');
    expect(p.profissional?.registroConselho).toBe('123456');
    expect(p.profissional?.verificadoEm).not.toBeNull();
    expect(p.aluno).toBeNull();
  });

  it('edita nome, telefone, bio e especialidades', async () => {
    const p = await pro.me.atualizarPerfil({
      nome: '  Dra. Prova Editada  ',
      telefone: '11988887777',
      bio: 'Endocrinologia',
      especialidades: ['Endocrinologia', 'Nutrologia'],
    });
    expect(p.nome).toBe('Dra. Prova Editada');
    expect(p.telefone).toBe('11988887777');
    expect(p.profissional?.especialidades).toEqual(['Endocrinologia', 'Nutrologia']);
    // Nada disso encosta na verificação.
    expect(p.profissional?.verificadoEm).not.toBeNull();
  });

  it('trocar o registro no conselho REVOGA a verificação', async () => {
    /*
      Sem isto bastaria informar um número válido, ser aprovado pelo admin e
      substituir depois — a checagem do conselho viraria enfeite.
    */
    const p = await pro.me.atualizarPerfil({
      nome: 'Dra. Prova Editada',
      especialidades: [],
      registroConselho: '999999',
    });
    expect(p.profissional?.registroConselho).toBe('999999');
    expect(p.profissional?.verificadoEm).toBeNull();
  });

  it('e revoga mesmo quando o cliente tenta preservá-la', async () => {
    // O SDK não oferece este caminho; a tentativa vai pelo supabase cru,
    // porque é assim que alguém tentaria de verdade.
    await admin
      .from('PerfilProfissional')
      .update({ verificadoEm: new Date().toISOString() })
      .eq('userId', userId);

    const r = await bruto
      .from('PerfilProfissional')
      .update({ registroConselho: '777777', verificadoEm: new Date().toISOString() })
      .eq('userId', userId);
    expect(r.error).toBeNull(); // a escrita passa...

    const p = await pro.me.perfil();
    expect(p.profissional?.registroConselho).toBe('777777');
    // ...e o gatilho derruba a verificação assim mesmo.
    expect(p.profissional?.verificadoEm).toBeNull();
  });

  it('ninguém se verifica', async () => {
    const r = await bruto
      .from('PerfilProfissional')
      .update({ verificadoEm: new Date().toISOString() })
      .eq('userId', userId);
    expect(r.error).not.toBeNull();
    expect((await pro.me.perfil()).profissional?.verificadoEm).toBeNull();
  });

  it('ninguém troca o próprio papel', async () => {
    // Papel é o que TODA política lê para decidir. Trocá-lo seria escalonamento
    // de privilégio pela porta da frente.
    const r = await bruto.from('User').update({ papel: 'ADMIN' }).eq('id', userId);
    expect(r.error).not.toBeNull();
    expect((await pro.me.perfil()).papel).toBe('MEDICO');
  });

  it('ninguém edita o cadastro de outra pessoa', async () => {
    const outro = await admin
      .from('User')
      .select('id')
      .eq('email', 'personal@viviofit.com.br')
      .single();
    const alvo = (outro.data as { id: string }).id;

    // Sem política de UPDATE que alcance a linha, o Postgres não lança: ele
    // simplesmente não atinge linha nenhuma. A prova é o nome continuar igual.
    const antes = (await admin.from('User').select('nome').eq('id', alvo).single()).data as {
      nome: string;
    };
    await bruto.from('User').update({ nome: 'Invadido' }).eq('id', alvo);
    const depois = (await admin.from('User').select('nome').eq('id', alvo).single()).data as {
      nome: string;
    };
    expect(depois.nome).toBe(antes.nome);
  });
});
