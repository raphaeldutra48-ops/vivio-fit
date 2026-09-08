import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Todo instante que o SDK devolve carrega fuso.
 *
 * ## O defeito que este arquivo guarda
 *
 * 142 colunas do schema são `timestamp WITHOUT time zone`. O Prisma sempre
 * gravou UTC nelas e sabia lê-las de volta como UTC — a convenção vivia no
 * cliente dele. O PostgREST devolve o texto cru, sem o `Z`, e `new Date()` de
 * uma string sem fuso a interpreta como hora LOCAL.
 *
 * No Brasil isso desloca tudo em três horas, para o lado errado: um registro
 * feito agora aparecia como 181 minutos NO FUTURO. "Último treino há 2 dias"
 * vira 1 ou 3 conforme a hora do dia; um alerta criado às 23h muda de data.
 *
 * Nada disso dá erro. Só mostra a hora errada, e só para quem não vive em UTC
 * — que é todo mundo neste app.
 *
 * O teste roda contra o banco de verdade porque é do formato de saída do
 * PostgREST que se trata; um dublê devolveria o que eu imaginei.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('instantes com fuso', () => {
  const marca = `prova-fuso-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const email = `${marca}@teste.com`;
  let admin: SupabaseClient;
  let idNoAuth = '';

  const aluno = new VivioClient({
    baseUrl: 'http://127.0.0.1:1',
    supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
  });

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
      nome: 'Aluno de Fuso',
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
  });

  afterAll(async () => {
    await admin.from('RegistroAgua').delete().eq('alunoId', alunoId);
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

  it('o PostgREST realmente devolve o instante SEM fuso', async () => {
    /*
      A premissa do arquivo, conferida em vez de suposta. Se um dia as colunas
      virarem `timestamptz`, este teste falha primeiro — e aí a conversão do
      SDK pode sair, em vez de ficar para sempre "por precaução".
    */
    await aluno.agua.registrar(alunoId, { data: new Date(), volumeMl: 250 });
    const cru = await admin
      .from('RegistroAgua')
      .select('registradoEm')
      .eq('alunoId', alunoId)
      .limit(1)
      .single();
    const texto = (cru.data as { registradoEm: string }).registradoEm;
    expect(texto).not.toMatch(/(?:Z|[+-]\d{2}:?\d{2})$/);
  });

  it('e o SDK devolve o mesmo instante COM fuso', async () => {
    const r = await aluno.agua.resumo(alunoId);
    expect(r.registros[0]!.registradoEm).toMatch(/Z$/);
  });

  it('um registro de agora não aparece no futuro', async () => {
    // A forma como o defeito se manifestava: minutos negativos. Sem fuso, no
    // Brasil dava -181.
    const r = await aluno.agua.resumo(alunoId);
    expect(r.minutosDesdeUltimoRegistro).toBe(0);
  });

  it('a distância medida bate com a de verdade', async () => {
    /*
      A prova forte: o instante lido tem de estar a segundos de agora, não a
      horas. Três horas de erro passariam pelo teste acima se o sinal fosse o
      outro — aqui não passam.
    */
    const r = await aluno.agua.resumo(alunoId);
    const distanciaMin =
      Math.abs(Date.now() - new Date(r.registros[0]!.registradoEm).getTime()) / 60_000;
    expect(distanciaMin).toBeLessThan(5);
  });

  it('data pura continua data pura, sem virar meia-noite com fuso', async () => {
    // `AAAA-MM-DD` não é instante. Acrescentar `Z` a ela e deixar a tela
    // formatar deslocaria o DIA para trás em fuso negativo.
    const r = await aluno.agua.resumo(alunoId);
    expect(r.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
