import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * A leitura automática de dieta, pela função de borda `ler-dieta`.
 *
 * É a única parte do app que manda documento de saúde para FORA — um serviço de
 * terceiro, em outro país, para ser lido por máquina. Por isso o que este
 * arquivo persegue não é a transcrição: são as portas que vêm antes dela, e a
 * ordem em que fecham.
 *
 * ## Por que nenhum teste aqui chega a ler um documento
 *
 * Cada leitura de verdade custa uma chamada paga na conta do dono do projeto. O
 * que dá para provar sem gastar é tudo o que importa em segurança: cada recusa,
 * e o fato de uma chamada legítima atravessar TODAS as travas — ela para no
 * passo seguinte, o arquivo que não existe. Se alguma porta tivesse ficado
 * aberta, a recusa correspondente falharia aqui.
 *
 * ## Os dois consentimentos
 *
 * NUTRICAO autoriza o profissional a ver a dieta. LEITURA_AUTOMATICA autoriza o
 * documento a sair do app. São perguntas diferentes, e a LGPD pede consentimento
 * específico por finalidade: reaproveitar o "sim" da primeira para a segunda
 * seria usar uma resposta dada para outra pergunta.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK: leitura automática de dieta', () => {
  const marca = `prova-leitura-dieta-${Date.now()}`;
  const emailAluno = `${marca}@teste.com`;
  let admin: SupabaseClient;
  let alunoId = '';
  let nutriId = '';

  const cliente = (): VivioClient =>
    new VivioClient({ supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false } });
  const nutri = cliente();
  const medico = cliente();
  const aluno = cliente();

  const pedir = (dados: { chave: string; alunoId?: string | null }): Promise<ErroApi> =>
    nutri.dietas
      .importarDieta({ chave: dados.chave, mimeType: 'application/pdf', alunoId: dados.alunoId })
      .then(() => {
        throw new Error('deveria ter recusado');
      })
      .catch((e: unknown) => e as ErroApi);

  const consentir = (escopo: string, id: string) =>
    admin.from('Consentimento').insert({
      id,
      alunoId,
      profissionalId: nutriId,
      escopo,
      finalidade: 'Prova',
      versaoTermo: '1',
    });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    nutriId = (
      (await admin.from('User').select('id').eq('email', 'nutri@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    const nova = await admin.auth.admin.createUser({
      email: emailAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: `Aluno ${marca}`, papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    alunoId = nova.data.user!.id;

    const vinculo = await admin.from('Vinculo').insert({
      id: `${marca}-v`,
      alunoId,
      profissionalId: nutriId,
      tipo: 'NUTRICIONISTA',
      status: 'ATIVO',
      convidadoPorId: nutriId,
      atualizadoEm: new Date().toISOString(),
    });
    if (vinculo.error) throw new Error(`preparo: ${vinculo.error.message}`);

    await Promise.all([
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: emailAluno, senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('LogAuditoria').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.auth.admin.deleteUser(alunoId);
  });

  it('sem sessão, a função nem lê o pedido', async () => {
    const r = await fetch(`${url}/functions/v1/ler-dieta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'materiais/x/y.pdf', mimeType: 'application/pdf' }),
    });
    expect(r.status).toBe(401);
  });

  it('o aluno não importa dieta — nem a própria', async () => {
    const erro = await aluno.dietas
      .importarDieta({ chave: `materiais/${alunoId}/x.pdf`, mimeType: 'application/pdf' })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.codigo).toBe('PAPEL_NAO_AUTORIZADO');
  });

  it('sem vínculo, o aluno sequer existe para quem pergunta', async () => {
    /*
      404 e não 403: quem não atende a pessoa não recebe confirmação de que ela
      tem conta aqui.
    */
    const erro = await medico.dietas
      .importarDieta({
        chave: `materiais/${nutriId}/x.pdf`,
        mimeType: 'application/pdf',
        alunoId,
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(404);
  });

  it('com vínculo e sem consentimento de nutrição, recusa', async () => {
    const erro = await pedir({ chave: `materiais/${nutriId}/x.pdf`, alunoId });
    expect(erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
    expect(erro.status).toBe(403);
  });

  it('autorizar a nutrição NÃO autoriza o documento a sair do app', async () => {
    /*
      A trava que este arquivo existe para defender. Ver a dieta e mandar o
      documento para uma empresa estrangeira ler são duas coisas, e o "sim" de
      uma não vale pela outra.
    */
    const c = await consentir('NUTRICAO', `${marca}-c1`);
    if (c.error) throw new Error(`preparo: ${c.error.message}`);

    const erro = await pedir({ chave: `materiais/${nutriId}/x.pdf`, alunoId });
    expect(erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
    expect(erro.message).toContain('leitura automática');
    expect(erro.detalhes).toMatchObject({ escopo: 'LEITURA_AUTOMATICA' });
  });

  it('com os dois consentimentos, a chave de outra pessoa continua barrada', async () => {
    const c = await consentir('LEITURA_AUTOMATICA', `${marca}-c2`);
    if (c.error) throw new Error(`preparo: ${c.error.message}`);

    /*
      Sem esta conferência, saber a chave alheia bastaria para mandar ler o
      arquivo de outra pessoa — inclusive um laudo de exame.
    */
    const erro = await pedir({ chave: `materiais/${alunoId}/laudo.pdf`, alunoId });
    expect(erro.status).toBe(409);
    expect(erro.message).toContain('não pertence a você');
  });

  it('com tudo em ordem, atravessa as travas e para no arquivo que não existe', async () => {
    /*
      O caso positivo possível sem gastar uma leitura paga: a chamada é legítima
      em tudo — papel, vínculo, os dois consentimentos e a chave na pasta de
      quem pede — e morre no passo seguinte, o download. É o que prova que
      nenhuma porta anterior ficou fechada por engano.
    */
    const erro = await pedir({ chave: `materiais/${nutriId}/${marca}.pdf`, alunoId });
    expect(erro.status).toBe(404);
    expect(erro.message).toContain('Arquivo não encontrado');
  });

  it('a importação do modelo do próprio profissional dispensa consentimento', async () => {
    // Sem aluno não há dado de terceiro saindo: o documento é dele.
    const erro = await pedir({ chave: `materiais/${nutriId}/${marca}.pdf`, alunoId: null });
    expect(erro.status).toBe(404);
    expect(erro.message).toContain('Arquivo não encontrado');
  });
});
