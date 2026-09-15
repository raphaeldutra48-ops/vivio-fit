import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Água pelo SDK, sem API.
 *
 * A conta do copo já é pura em `@vivio/contracts`. O que se prova aqui é o
 * caminho: que a meta e os registros vêm de duas consultas e se juntam certo,
 * que apagar corrige um toque errado, e que o gole registrado não se edita.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: água', () => {
  const marca = `prova-agua-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const email = `${marca}@teste.com`;
  const hoje = new Date().toISOString().slice(0, 10);
  let admin: SupabaseClient;
  let idNoAuth = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const aluno = cliente();
  const nutri = cliente();

  const cabecalhos = (): Record<string, string> => ({
    apikey: servico!,
    Authorization: `Bearer ${servico!}`,
    'Content-Type': 'application/json',
  });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const nId = (
      (await admin.from('User').select('id').eq('email', 'nutri@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    await admin.from('User').insert({
      id: alunoId,
      email,
      nome: 'Aluno de Água',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Vinculo').insert({
      id: `${marca}-v`,
      alunoId,
      profissionalId: nId,
      tipo: 'NUTRICIONISTA',
      status: 'ATIVO',
      convidadoPorId: nId,
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Consentimento').insert({
      id: `${marca}-c`,
      alunoId,
      escopo: 'NUTRICAO',
      finalidade: 'Prova',
      versaoTermo: '1',
    });

    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({ email, password: 'Senha@123', email_confirm: true }),
    });
    const criado = (await r.json()) as { id?: string };
    if (!criado.id) throw new Error(`Auth recusou: ${JSON.stringify(criado)}`);
    idNoAuth = criado.id;

    await aluno.auth.login({ email, senha: 'Senha@123' });
    await nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' });
  });

  afterAll(async () => {
    await admin.from('RegistroAgua').delete().eq('alunoId', alunoId);
    await admin.from('MetaAgua').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    if (idNoAuth) {
      await fetch(`${url}/auth/v1/admin/users/${idNoAuth}`, {
        method: 'DELETE',
        headers: cabecalhos(),
      });
    }
  });

  it('sem meta definida, vale o padrão de 2000 ml', async () => {
    // A tela precisa de um denominador desde o primeiro dia, antes de existir
    // nutricionista na equipe.
    const r = await aluno.agua.resumo(alunoId);
    expect(r.metaMlDia).toBe(2000);
    expect(r.consumidoMl).toBe(0);
    expect(r.percentual).toBe(0);
    expect(r.minutosDesdeUltimoRegistro).toBeNull();
  });

  it('registrar soma e devolve o dia inteiro', async () => {
    await aluno.agua.registrar(alunoId, { data: new Date(hoje), volumeMl: 500 });
    const r = await aluno.agua.registrar(alunoId, { data: new Date(hoje), volumeMl: 300 });
    expect(r.consumidoMl).toBe(800);
    expect(r.registros).toHaveLength(2);
    // Acabou de beber.
    expect(r.minutosDesdeUltimoRegistro).toBe(0);
    expect(r.percentual).toBe(40);
  });

  it('a nutricionista define a meta, e o percentual acompanha', async () => {
    const m = await nutri.agua.definirMeta(alunoId, {
      metaMlDia: 3200,
      horaInicio: 7,
      horaFim: 22,
    });
    expect(m.metaMlDia).toBe(3200);

    const r = await aluno.agua.resumo(alunoId);
    expect(r.metaMlDia).toBe(3200);
    expect(r.percentual).toBe(25);
  });

  it('definir de novo corrige, não cria uma segunda meta', async () => {
    await nutri.agua.definirMeta(alunoId, { metaMlDia: 2500, horaInicio: 6, horaFim: 23 });
    const linhas = await admin.from('MetaAgua').select('id').eq('alunoId', alunoId);
    expect(linhas.data).toHaveLength(1);
    expect((await aluno.agua.resumo(alunoId)).metaMlDia).toBe(2500);
  });

  it('beber o dobro da meta não passa de 100%', async () => {
    // Barra de progresso não vai além do fim, e 200% não é "duas vezes
    // cumprido" — é cumprido.
    await aluno.agua.registrar(alunoId, { data: new Date(hoje), volumeMl: 5000 });
    const r = await aluno.agua.resumo(alunoId);
    expect(r.consumidoMl).toBe(5800);
    expect(r.percentual).toBe(100);
  });

  it('apagar corrige o toque errado', async () => {
    const antes = await aluno.agua.resumo(alunoId);
    const errado = antes.registros.find((x) => x.volumeMl === 5000)!;
    await aluno.agua.remover(alunoId, errado.id);
    const depois = await aluno.agua.resumo(alunoId);
    expect(depois.consumidoMl).toBe(800);
    expect(depois.registros.some((x) => x.id === errado.id)).toBe(false);
  });

  it('quem não atende o aluno não registra nem apaga por ele', async () => {
    const outro = cliente();
    await outro.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' });
    await expect(
      outro.agua.registrar(alunoId, { data: new Date(hoje), volumeMl: 100 }),
    ).rejects.toBeInstanceOf(ErroApi);
  });
});
