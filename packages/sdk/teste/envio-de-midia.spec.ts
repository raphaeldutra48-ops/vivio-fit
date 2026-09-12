import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * O envio de arquivo pelo SDK, ponta a ponta.
 *
 * As políticas dos compartimentos já têm prova própria em
 * `armazenamento.spec.ts`, com o cliente cru do Supabase. O que falta é o que
 * está NO MEIO: o SDK monta o endereço do arquivo, e a pasta que ele escolhe é
 * exatamente o que a política vai conferir. Um engano ali — a pasta de outro
 * dono, o compartimento trocado — não aparece em teste de unidade nenhum, e em
 * produção vira "não foi possível enviar" sem mais explicação.
 *
 * Também prova a volta: a chave gravada no banco realmente abre o arquivo.
 * Guardar chave que não abre é o defeito que só se descobre semanas depois,
 * quando alguém tenta rever a foto.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

/** PNG de 1x1 — o menor arquivo válido que o compartimento aceita. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe.skipIf(!url || !anon || !servico)('SDK sem API: envio de arquivo', () => {
  let admin: SupabaseClient;
  let personalId = '';
  const enviadas: string[] = [];

  const personal = new VivioClient({
    baseUrl: 'http://127.0.0.1:1',
    supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
  });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;
    await personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' });
  });

  afterAll(async () => {
    for (const chave of enviadas) {
      const corte = chave.indexOf('/');
      await admin.storage.from(chave.slice(0, corte)).remove([chave.slice(corte + 1)]);
    }
  });

  it('a chave começa no compartimento do tipo e na pasta de quem envia', async () => {
    const chave = await personal.midia.enviar('VIDEO_EXERCICIO', new Blob([PNG]), 'video/mp4');
    enviadas.push(chave);

    /*
      A primeira pasta é o dono. Não é enfeite: é o que `dono_do_arquivo` lê
      para decidir quem grava ali, e é o mesmo prefixo que o gatilho do
      exercício exige na hora de vincular o vídeo.
    */
    expect(chave.startsWith(`exercicios/${personalId}/`)).toBe(true);
    expect(chave.endsWith('.mp4')).toBe(true);
  });

  it('o arquivo está lá, e a chave guardada abre — com link que expira', async () => {
    const chave = await personal.midia.enviar('MATERIAL', new Blob([PNG]), 'image/png');
    enviadas.push(chave);

    const { url: link, expiraEm } = await personal.midia.urlDeLeitura(chave);
    const r = await fetch(link);
    expect(r.status).toBe(200);
    expect((await r.arrayBuffer()).byteLength).toBe(PNG.byteLength);

    // Compartimento privado: link assinado, de validade curta.
    expect(link).toContain('token=');
    expect(new Date(expiraEm).getTime()).toBeGreaterThan(Date.now());
  });

  it('formato fora da lista para antes de subir o arquivo', async () => {
    /*
      O compartimento também recusaria, e é ele quem manda. A conferência aqui
      existe para a recusa chegar ANTES de o aparelho gastar a franquia de
      dados subindo 90 MB que não iam servir.
    */
    await expect(
      personal.midia.enviar('VIDEO_EXERCICIO', new Blob([PNG]), 'application/x-msdownload'),
    ).rejects.toMatchObject({ codigo: 'DADOS_INVALIDOS' });
  });

  it('arquivo acima do teto do tipo é recusado pelo tamanho, e a frase diz o limite', async () => {
    // AVATAR tem o menor teto (5 MB), o único que cabe montar em memória.
    const grande = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });
    const erro = await personal.midia
      .enviar('AVATAR', grande)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    expect(erro?.codigo).toBe('DADOS_INVALIDOS');
    expect(erro?.message).toContain('5 MB');
  });

  it('chave sem compartimento não vira pedido de arquivo com caminho vazio', async () => {
    await expect(personal.midia.urlDeLeitura('sembarra')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('o catálogo responde por URL pública, e não por link assinado', async () => {
    /*
      É a figura do acervo, igual para todo mundo: assinar cada uma seria um
      HMAC por item numa lista de cem para esconder o que não é segredo. O par
      importa — a foto de evolução, ao lado, NÃO tem esse caminho.
    */
    const { data } = await admin.from('Exercicio').select('imagemChave').not('imagemChave', 'is', null).limit(1);
    const chave = (data as { imagemChave: string }[] | null)?.[0]?.imagemChave;
    if (!chave?.startsWith('catalogo/')) return;

    const { url: link } = await personal.midia.urlDeLeitura(chave);
    expect(link).toContain('/object/public/catalogo/');
    expect(link).not.toContain('token=');

    const r = await fetch(link);
    expect(r.status).toBe(200);
  });
});
