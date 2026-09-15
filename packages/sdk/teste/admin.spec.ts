import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * A verificação de registro no conselho pelo SDK, sem API.
 *
 * É a porta de entrada de todo o resto: sem verificação, o profissional não
 * recebe vínculo, e sem vínculo não alcança dado de saúde de ninguém. Por isso
 * os dois casos que este arquivo persegue são o alcance e a atomicidade.
 *
 * **Alcance.** A tela lê o cadastro de profissionais que não têm relação
 * nenhuma com quem olha. Quem não é admin não pode chegar perto — e o teste vai
 * pela função do banco, que é o único caminho que existe.
 *
 * **Atomicidade.** Aprovar carimba o perfil E destrava a conta. Perfil
 * verificado com conta travada deixa o profissional vendo "aprovado" numa tela
 * que não abre; conta ativa com perfil pendente o faz receber vínculo sem
 * ninguém ter conferido o registro dele.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: verificação de profissional', () => {
  const marca = `prova-admin-${Date.now()}`;
  const emailCandidato = `${marca}@teste.com`;

  let admin: SupabaseClient;
  let adminId = '';
  let candidatoId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const gestor = cliente();
  const personal = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    adminId = (
      (await admin.from('User').select('id').eq('email', 'admin@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    const nova = await admin.auth.admin.createUser({
      email: emailCandidato,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: `Candidato ${marca}`, papel: 'PERSONAL' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    candidatoId = nova.data.user!.id;

    // Conta travada esperando verificação — o estado de quem acabou de se
    // cadastrar como profissional.
    await admin.from('User').update({ status: 'PENDENTE_VERIFICACAO' }).eq('id', candidatoId);
    await admin.from('PerfilProfissional').upsert({
      userId: candidatoId,
      tipo: 'PERSONAL',
      registroConselho: `CREF-${marca.slice(-6)}`,
      ufRegistro: 'SP',
      especialidades: ['Hipertrofia'],
      atualizadoEm: new Date().toISOString(),
    });

    await Promise.all([
      gestor.auth.login({ email: 'admin@viviofit.com.br', senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('PerfilProfissional').delete().eq('userId', candidatoId);
    await admin.from('User').delete().eq('id', candidatoId);
    await admin.auth.admin.deleteUser(candidatoId);
  });

  it('o candidato aparece como PENDENTE, e a fila o conta', async () => {
    const fila = await gestor.admin.listarProfissionais({ status: 'PENDENTE', limit: 100 });
    const meu = fila.find((p) => p.id === candidatoId)!;

    expect(meu).toBeDefined();
    expect(meu.nome).toBe(`Candidato ${marca}`);
    expect(meu.registroConselho).toContain('CREF');
    expect(meu.status).toBe('PENDENTE');
    expect(meu.verificadoPor).toBeNull();

    const { total } = await gestor.admin.contarPendentes();
    expect(total).toBeGreaterThan(0);
  });

  it('quem não é admin não alcança o cadastro de ninguém', async () => {
    /*
      É a regra que sustenta o resto: o cadastro é de profissionais sem relação
      nenhuma com quem pergunta. Um personal curioso veria o telefone e o
      registro de todos os colegas do app.
    */
    const lista = await personal.admin.listarProfissionais({ limit: 100 });
    expect(lista).toEqual([]);

    const erro = await personal.admin
      .verificar(candidatoId)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(403);

    // E o candidato continua pendente, que é o que importa.
    const { data } = await admin
      .from('PerfilProfissional')
      .select('verificadoEm')
      .eq('userId', candidatoId)
      .single();
    expect((data as { verificadoEm: string | null }).verificadoEm).toBeNull();
  });

  it('recusar exige motivo, e o motivo fica registrado', async () => {
    const semMotivo = await gestor.admin
      .recusar(candidatoId, { motivo: '   ' })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    // Sem motivo, o profissional não saberia o que corrigir.
    expect(semMotivo?.status).toBe(422);

    const recusado = await gestor.admin.recusar(candidatoId, {
      motivo: 'O número do CREF não confere com o conselho.',
    });
    expect(recusado.status).toBe('RECUSADO');
    expect(recusado.motivoRecusa).toContain('CREF');
    expect(recusado.recusadoEm).not.toBeNull();

    // Recusa não desativa a conta: seria punir cadastro errado como fraude.
    const { data } = await admin.from('User').select('status').eq('id', candidatoId).single();
    expect((data as { status: string }).status).toBe('PENDENTE_VERIFICACAO');
  });

  it('aprovar depois de recusar limpa a recusa e destrava a conta', async () => {
    const aprovado = await gestor.admin.verificar(candidatoId);

    // Verificado vence recusa: reaprovar é caminho normal, o profissional
    // corrige o registro e reenvia.
    expect(aprovado.status).toBe('VERIFICADO');
    expect(aprovado.recusadoEm).toBeNull();
    expect(aprovado.motivoRecusa).toBeNull();
    // Quem aprovou fica registrado, com nome: responsabilidade sem nome não
    // existe.
    expect(aprovado.verificadoPor?.id).toBe(adminId);
    expect(aprovado.verificadoPor?.nome).toBeTruthy();

    // A outra metade da mesma decisão: a conta destravou.
    const { data } = await admin.from('User').select('status').eq('id', candidatoId).single();
    expect((data as { status: string }).status).toBe('ATIVA');
  });

  it('a porta que a aprovação abriu continua estreita', async () => {
    /*
      Aprovar mexe em `User.status`, e por isso o gatilho do cadastro ganhou uma
      exceção para o admin. Uma exceção num gatilho que protege `papel` merece
      teste próprio — é a coluna que TODA política lê para decidir, e trocá-la
      seria escalonamento de privilégio pela porta da frente.

      As tentativas vão pelo PostgREST cru, que é onde a regra precisa valer.
    */
    const comoAdmin = await gestor.supabase.db.auth.getSession();
    const escrever = async (
      quem: string,
      alvo: string,
      corpo: Record<string, unknown>,
    ): Promise<number> => {
      const r = await fetch(`${url}/rest/v1/User?id=eq.${alvo}`, {
        method: 'PATCH',
        headers: {
          apikey: anon!,
          Authorization: `Bearer ${quem}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(corpo),
      });
      return r.status;
    };

    const token = comoAdmin.data.session!.access_token;

    // O papel continua intocável até para o admin.
    expect(await escrever(token, candidatoId, { papel: 'ADMIN' })).toBeGreaterThanOrEqual(400);
    // E o admin não destrava a própria conta — o caminho mais curto de todos.
    expect(await escrever(token, adminId, { status: 'ATIVA' })).toBeGreaterThanOrEqual(400);

    // Quem não é admin não mexe no status de ninguém.
    const doPersonal = await personal.supabase.db.auth.getSession();
    expect(
      await escrever(doPersonal.data.session!.access_token, candidatoId, { status: 'SUSPENSA' }),
    ).toBeGreaterThanOrEqual(400);

    // E nada disso passou: o candidato continua como a aprovação o deixou.
    const { data } = await admin
      .from('User')
      .select('status,papel')
      .eq('id', candidatoId)
      .single();
    expect(data).toEqual({ status: 'ATIVA', papel: 'PERSONAL' });
  });

  it('a busca acha por nome e por e-mail', async () => {
    const porNome = await gestor.admin.listarProfissionais({ q: marca, limit: 50 });
    expect(porNome.map((p) => p.id)).toContain(candidatoId);

    const porEmail = await gestor.admin.listarProfissionais({ q: emailCandidato, limit: 50 });
    expect(porEmail.map((p) => p.id)).toContain(candidatoId);

    const semNada = await gestor.admin.listarProfissionais({ q: 'inexistente-xyz', limit: 50 });
    expect(semNada).toEqual([]);
  });
});
