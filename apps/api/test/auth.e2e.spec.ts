import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { CORREIO, type Email } from '../src/modules/auth/correio';
import { criarContaVerificada } from './apoio';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // E-mail único por execução — os testes rodam contra o banco real.
  const sufixo = Date.now().toString(36);
  const email = `teste.${sufixo}@exemplo.com`;
  const senha = 'Senha@123';
  let tokenDeVerificacao: string;

  /*
    O correio vira espião: é assim que o teste alcança o link de redefinição,
    que por desenho não volta em resposta nenhuma (a rota devolve 204 exista o
    e-mail ou não). De quebra, prova que a mensagem sai de verdade e que o link
    dentro dela está inteiro.
  */
  const enviados: Email[] = [];
  const ultimoEmailPara = (para: string) =>
    [...enviados].reverse().find((e) => e.para === para);
  const tokenDoLink = (email: Email | undefined) =>
    email?.texto.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CORREIO)
      .useValue({ enviar: async (e: Email) => void enviados.push(e) })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `.${sufixo}@` } } });
    await app.close();
  });

  const url = (caminho: string) => `/api/v1${caminho}`;

  describe('registro', () => {
    /**
     * O cadastro não pode abrir sessão: se abrisse, quem usasse o e-mail de
     * outra pessoa entraria na hora e a confirmação não protegeria ninguém.
     */
    it('cria conta de aluno SEM devolver tokens', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/registrar/aluno'))
        .send({ nome: 'Teste Aluno', email, senha, dataNascimento: '1995-05-20', alturaCm: 175 })
        .expect(201);

      expect(resposta.body.accessToken).toBeUndefined();
      expect(resposta.body.refreshToken).toBeUndefined();
      expect(resposta.body.precisaConfirmarEmail).toBe(true);
      expect(resposta.body.usuario.papel).toBe('ALUNO');

      tokenDeVerificacao = resposta.body.tokenDeVerificacao;
      expect(tokenDeVerificacao).toBeTruthy();
    });

    it('recusa e-mail duplicado com EMAIL_JA_CADASTRADO', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/registrar/aluno'))
        .send({ nome: 'Outro', email, senha, dataNascimento: '1995-05-20' })
        .expect(409);

      expect(resposta.body.erro.codigo).toBe('EMAIL_JA_CADASTRADO');
    });

    it('recusa senha fraca com DADOS_INVALIDOS', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/registrar/aluno'))
        .send({
          nome: 'Fraco',
          email: `fraco.${sufixo}@exemplo.com`,
          senha: 'abc',
          dataNascimento: '1995-05-20',
        })
        .expect(422);

      expect(resposta.body.erro.codigo).toBe('DADOS_INVALIDOS');
      expect(resposta.body.erro.detalhes.campos.senha).toBeTruthy();
    });

    it('cria profissional como PENDENTE_VERIFICACAO', async () => {
      await request(app.getHttpServer())
        .post(url('/auth/registrar/profissional'))
        .send({
          nome: 'Personal Teste',
          email: `personal.${sufixo}@exemplo.com`,
          senha,
          tipo: 'PERSONAL',
          registroConselho: `CREF ${sufixo}`,
          ufRegistro: 'CE',
        })
        .expect(201);

      const criado = await prisma.user.findUnique({
        where: { email: `personal.${sufixo}@exemplo.com` },
        include: { perfilProfissional: true },
      });

      expect(criado?.status).toBe('PENDENTE_VERIFICACAO');
      // Ninguém vira profissional verificado só se cadastrando.
      expect(criado?.perfilProfissional?.verificadoEm).toBeNull();
    });
  });

  describe('confirmação de e-mail', () => {
    it('bloqueia o login antes da confirmação, mesmo com a senha certa', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha })
        .expect(403);

      expect(resposta.body.erro.codigo).toBe('EMAIL_NAO_VERIFICADO');
    });

    it('recusa token inventado', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/verificar-email'))
        .send({ token: 'token-que-nunca-existiu-mas-tem-tamanho' })
        .expect(401);

      expect(resposta.body.erro.codigo).toBe('TOKEN_INVALIDO');
    });

    it('confirma e já devolve a sessão', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/verificar-email'))
        .send({ token: tokenDeVerificacao })
        .expect(200);

      expect(resposta.body.accessToken).toBeTruthy();
      expect(resposta.body.usuario.emailVerificado).toBe(true);
    });

    /** Link em e-mail circula: caixa encaminhada, histórico, log de proxy. */
    it('o mesmo link não vale duas vezes', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/verificar-email'))
        .send({ token: tokenDeVerificacao })
        .expect(401);

      expect(resposta.body.erro.codigo).toBe('TOKEN_INVALIDO');
    });

    it('recusa token expirado', async () => {
      const alvo = `expirado.${sufixo}@exemplo.com`;
      const registro = await request(app.getHttpServer())
        .post(url('/auth/registrar/aluno'))
        .send({ nome: 'Expirado', email: alvo, senha, dataNascimento: '1990-01-01' })
        .expect(201);

      await prisma.tokenVerificacaoEmail.updateMany({
        where: { user: { email: alvo } },
        data: { expiraEm: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer())
        .post(url('/auth/verificar-email'))
        .send({ token: registro.body.tokenDeVerificacao })
        .expect(401);
    });

    it('pedir um link novo invalida o anterior', async () => {
      const alvo = `reenvio.${sufixo}@exemplo.com`;
      const registro = await request(app.getHttpServer())
        .post(url('/auth/registrar/aluno'))
        .send({ nome: 'Reenvio', email: alvo, senha, dataNascimento: '1990-01-01' })
        .expect(201);

      // O intervalo mínimo entre envios é medido pelo token anterior.
      await prisma.tokenVerificacaoEmail.updateMany({
        where: { user: { email: alvo } },
        data: { criadoEm: new Date(Date.now() - 5 * 60 * 1000) },
      });

      await request(app.getHttpServer())
        .post(url('/auth/reenviar-verificacao'))
        .send({ email: alvo })
        .expect(204);

      await request(app.getHttpServer())
        .post(url('/auth/verificar-email'))
        .send({ token: registro.body.tokenDeVerificacao })
        .expect(401);
    });

    /** Sondar a base pelo reenvio não pode render informação nenhuma. */
    it('reenvio responde 204 para e-mail inexistente e para já confirmado', async () => {
      await request(app.getHttpServer())
        .post(url('/auth/reenviar-verificacao'))
        .send({ email: `fantasma.${sufixo}@exemplo.com` })
        .expect(204);

      await request(app.getHttpServer())
        .post(url('/auth/reenviar-verificacao'))
        .send({ email })
        .expect(204);
    });
  });

  describe('login', () => {
    it('recusa senha errada com CREDENCIAIS_INVALIDAS', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha: 'SenhaErrada9' })
        .expect(401);

      expect(resposta.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    });

    it('devolve o mesmo erro para e-mail inexistente (não confirma se a conta existe)', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: `naoexiste.${sufixo}@exemplo.com`, senha })
        .expect(401);

      expect(resposta.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    });

    it('autentica com credenciais corretas', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha })
        .expect(200);

      expect(resposta.body.accessToken).toBeTruthy();
    });
  });

  /**
   * O cabeçalho `X-Vivio-Cliente: web` é o que separa os dois mundos: navegador
   * recebe o refresh em cookie httpOnly, mobile continua recebendo no corpo.
   */
  describe('refresh em cookie (web)', () => {
    const comoWeb = (requisicao: request.Test) => requisicao.set('X-Vivio-Cliente', 'web');

    /** O `Set-Cookie` inteiro, com os atributos — para asserção. */
    const cookieDe = (resposta: request.Response): string =>
      (resposta.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('vivio_refresh='),
      )!;

    /** Só `nome=valor`: é o formato que o cabeçalho `Cookie` aceita no envio. */
    const enviavel = (resposta: request.Response): string => cookieDe(resposta).split(';')[0];

    it('o login da web não devolve o refresh no corpo, e sim em cookie httpOnly', async () => {
      const resposta = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha }),
      ).expect(200);

      expect(resposta.body.accessToken).toBeTruthy();
      // Vazio no corpo: se estivesse ali, um XSS o leria e o cookie seria inútil.
      expect(resposta.body.refreshToken).toBe('');

      const cookie = cookieDe(resposta);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('renova a sessão só com o cookie, sem nada no corpo', async () => {
      const login = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha }),
      ).expect(200);

      const resposta = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/refresh')).set('Cookie', enviavel(login)),
      )
        .send({})
        .expect(200);

      expect(resposta.body.accessToken).toBeTruthy();
      expect(resposta.body.refreshToken).toBe('');
      // Rotacionou: o cookie novo não é o mesmo que entrou.
      expect(cookieDe(resposta)).not.toBe(cookieDe(login));
    });

    it('sem cookie e sem corpo, recusa', async () => {
      await comoWeb(request(app.getHttpServer()).post(url('/auth/refresh'))).send({}).expect(401);
    });

    /** Reuso derruba a família — e o cookie morto tem de sair do navegador. */
    it('cookie recusado é apagado na resposta', async () => {
      const login = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha }),
      ).expect(200);
      const cookie = enviavel(login);

      await comoWeb(request(app.getHttpServer()).post(url('/auth/refresh')).set('Cookie', cookie))
        .send({})
        .expect(200);

      const reuso = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/refresh')).set('Cookie', cookie),
      )
        .send({})
        .expect(401);

      expect(reuso.body.erro.codigo).toBe('TOKEN_REUTILIZADO');
      expect(cookieDe(reuso)).toMatch(/vivio_refresh=;/);
    });

    it('logout revoga pelo cookie e o apaga', async () => {
      const login = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha }),
      ).expect(200);
      const cookie = enviavel(login);

      const saida = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/logout')).set('Cookie', cookie),
      )
        .send({})
        .expect(204);

      expect(cookieDe(saida)).toMatch(/vivio_refresh=;/);

      // Prova que revogou de verdade: TOKEN_INVALIDO, não "não veio token".
      const depois = await comoWeb(
        request(app.getHttpServer()).post(url('/auth/refresh')).set('Cookie', cookie),
      )
        .send({})
        .expect(401);
      expect(depois.body.erro.codigo).toBe('TOKEN_INVALIDO');
    });

    it('sem o cabeçalho, o refresh continua vindo no corpo (mobile)', async () => {
      const resposta = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha })
        .expect(200);

      expect(resposta.body.refreshToken).toBeTruthy();
      expect(resposta.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('rota protegida', () => {
    it('nega sem token', async () => {
      const resposta = await request(app.getHttpServer()).get(url('/me')).expect(401);
      expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
    });

    it('nega com token forjado', async () => {
      const resposta = await request(app.getHttpServer())
        .get(url('/me'))
        .set('Authorization', 'Bearer token.completamente.invalido')
        .expect(401);

      expect(resposta.body.erro.codigo).toBe('TOKEN_INVALIDO');
    });

    it('permite com token válido', async () => {
      const login = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha });

      const resposta = await request(app.getHttpServer())
        .get(url('/me'))
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      expect(resposta.body.email).toBe(email);
    });

    it('deixa /health aberta', async () => {
      await request(app.getHttpServer()).get(url('/health')).expect(200);
    });
  });

  describe('rotação de refresh token', () => {
    it('troca o refresh por um par novo', async () => {
      const login = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha });

      const resposta = await request(app.getHttpServer())
        .post(url('/auth/refresh'))
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);

      expect(resposta.body.refreshToken).not.toBe(login.body.refreshToken);
    });

    /**
     * O teste que justifica a complexidade toda: reapresentar um refresh já
     * usado indica vazamento, então a família inteira cai — inclusive o token
     * novo, que estava nas mãos do usuário legítimo.
     */
    it('reusar um refresh antigo derruba a família inteira', async () => {
      const login = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha });
      const tokenOriginal = login.body.refreshToken;

      const rotacionado = await request(app.getHttpServer())
        .post(url('/auth/refresh'))
        .send({ refreshToken: tokenOriginal })
        .expect(200);
      const tokenNovo = rotacionado.body.refreshToken;

      // Atacante usa o token antigo, que ele havia capturado
      const reuso = await request(app.getHttpServer())
        .post(url('/auth/refresh'))
        .send({ refreshToken: tokenOriginal })
        .expect(401);
      expect(reuso.body.erro.codigo).toBe('TOKEN_REUTILIZADO');

      // E o token do usuário legítimo também para de valer
      const depois = await request(app.getHttpServer())
        .post(url('/auth/refresh'))
        .send({ refreshToken: tokenNovo })
        .expect(401);
      expect(depois.body.erro.codigo).toBe('TOKEN_INVALIDO');
    });

    it('logout revoga a sessão', async () => {
      const login = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha });

      await request(app.getHttpServer())
        .post(url('/auth/logout'))
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post(url('/auth/refresh'))
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  /**
   * Pendência 4. Fica por último de propósito: o limite por IP é do processo
   * inteiro, e gastar o orçamento de falhas no meio do arquivo faria os testes
   * anteriores começarem a receber 429 em vez do erro que estão verificando.
   */
  describe('limite de tentativas', () => {
    const alvo = `bruteforce.${sufixo}@exemplo.com`;
    const errar = (quem: string) =>
      request(app.getHttpServer()).post(url('/auth/login')).send({ email: quem, senha: 'Errada@1' });

    it('a décima primeira senha errada na mesma conta responde 429', async () => {
      for (let i = 0; i < 10; i++) await errar(alvo).expect(401);

      const bloqueado = await errar(alvo).expect(429);
      expect(bloqueado.body.erro.codigo).toBe('LIMITE_EXCEDIDO');
      expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
    });

    /** Trancar a conta atacada não pode trancar as outras. */
    it('outra conta continua entrando normalmente', async () => {
      await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email, senha })
        .expect(200);
    });

    it('acertar a senha zera a contagem da conta', async () => {
      const emailLimpo = `recupera.${sufixo}@exemplo.com`;
      await criarContaVerificada(app.getHttpServer(), '/auth/registrar/aluno', {
        nome: 'Recupera Conta',
        email: emailLimpo,
        senha,
        dataNascimento: '1993-03-03',
      });

      // Nove erros: um a menos que o limite.
      for (let i = 0; i < 9; i++) await errar(emailLimpo).expect(401);

      await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: emailLimpo, senha })
        .expect(200);

      // Se a contagem não tivesse zerado, o décimo erro já bloquearia.
      await errar(emailLimpo).expect(401);
    });
  });

  describe('recuperação de senha', () => {
    // `recupera.` já é usado pelo teste de limite de login, mais acima.
    const alvo = `redefine.${sufixo}@exemplo.com`;
    const senhaNova = 'NovaSenha@456';

    const pedirLink = (para: string) =>
      request(app.getHttpServer()).post(url('/auth/esqueci-senha')).send({ email: para });

    const redefinir = (token: string, novaSenha: string) =>
      request(app.getHttpServer()).post(url('/auth/redefinir-senha')).send({ token, senha: novaSenha });

    /** Deixa o relógio do intervalo mínimo para trás, sem esperar de verdade. */
    const envelhecerToken = (para: string) =>
      prisma.tokenRedefinicaoSenha.updateMany({
        where: { user: { email: para } },
        data: { criadoEm: new Date(Date.now() - 5 * 60 * 1000) },
      });

    beforeAll(async () => {
      await criarContaVerificada(app.getHttpServer(), '/auth/registrar/aluno', {
        nome: 'Recupera Senha',
        email: alvo,
        senha,
        dataNascimento: '1992-02-02',
      });
    });

    /*
      A defesa central desta rota: ela não pode virar um jeito de descobrir
      quem tem conta. A lista de clientes aqui é uma lista de pessoas em
      tratamento de saúde.
    */
    it('responde 204 para e-mail que não existe, e não manda nada', async () => {
      const fantasma = `fantasma-senha.${sufixo}@exemplo.com`;
      await pedirLink(fantasma).expect(204);
      expect(ultimoEmailPara(fantasma)).toBeUndefined();
    });

    it('manda o link para quem tem conta', async () => {
      await pedirLink(alvo).expect(204);

      const email = ultimoEmailPara(alvo);
      expect(email?.assunto).toContain('Redefinir sua senha');
      // A frase que diz que nada aconteceu ainda: é o que segura quem recebeu
      // sem ter pedido e acha que foi invadido.
      expect(email?.texto).toContain('sua senha continua a mesma');
      expect(tokenDoLink(email)).toHaveLength(43);
    });

    it('recusa token inventado', async () => {
      const r = await redefinir('token-que-nunca-existiu-mas-tem-tamanho', senhaNova).expect(401);
      expect(r.body.erro.codigo).toBe('TOKEN_INVALIDO');
    });

    it('recusa senha fraca — a mesma regra do cadastro', async () => {
      const token = tokenDoLink(ultimoEmailPara(alvo));
      const r = await redefinir(token, '123').expect(422);
      expect(r.body.erro.codigo).toBe('DADOS_INVALIDOS');
      expect(r.body.erro.detalhes.campos.senha).toBeTruthy();
    });

    it('pedir de novo invalida o link anterior', async () => {
      const antigo = tokenDoLink(ultimoEmailPara(alvo));
      await envelhecerToken(alvo);
      await pedirLink(alvo).expect(204);

      const novo = tokenDoLink(ultimoEmailPara(alvo));
      expect(novo).not.toBe(antigo);
      await redefinir(antigo, senhaNova).expect(401);
    });

    it('recusa link expirado', async () => {
      await prisma.tokenRedefinicaoSenha.updateMany({
        where: { user: { email: alvo } },
        data: { expiraEm: new Date(Date.now() - 1000) },
      });

      await redefinir(tokenDoLink(ultimoEmailPara(alvo)), senhaNova).expect(401);
    });

    /*
      O caso completo, e o que ele tem de provar além da troca: a sessão que
      existia ANTES morre. Se a senha precisou ser redefinida, a hipótese é que
      ela estava perdida — e o que está perdido pode estar com outra pessoa.
    */
    it('troca a senha, abre sessão e derruba as sessões antigas', async () => {
      const antes = await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: alvo, senha })
        .expect(200);
      const refreshAntigo = antes.body.refreshToken as string;

      await envelhecerToken(alvo);
      await pedirLink(alvo).expect(204);

      const r = await redefinir(tokenDoLink(ultimoEmailPara(alvo)), senhaNova).expect(200);
      expect(r.body.accessToken).toBeTruthy();
      expect(r.body.usuario.email).toBe(alvo);

      await request(app.getHttpServer())
        .post(url('/auth/refresh'))
        .send({ refreshToken: refreshAntigo })
        .expect(401);
    });

    it('a senha nova entra e a antiga não', async () => {
      await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: alvo, senha: senhaNova })
        .expect(200);

      await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: alvo, senha })
        .expect(401);
    });

    it('o mesmo link não vale duas vezes', async () => {
      await redefinir(tokenDoLink(ultimoEmailPara(alvo)), 'OutraSenha@789').expect(401);
    });

    /*
      O beco sem saída: quem se cadastrou, nunca confirmou e esqueceu a senha.
      Sem isto, ele redefine com sucesso e continua sem conseguir entrar, porque
      o login exige e-mail verificado — e não há nada na tela que explique.
      Abrir este link prova posse da caixa de entrada, que é exatamente o que a
      confirmação prova.
    */
    it('redefinir também confirma o e-mail de quem nunca confirmou', async () => {
      const pendente = `pendente-senha.${sufixo}@exemplo.com`;
      await request(app.getHttpServer())
        .post(url('/auth/registrar/aluno'))
        .send({ nome: 'Nunca Confirmou', email: pendente, senha, dataNascimento: '1991-01-01' })
        .expect(201);

      await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: pendente, senha })
        .expect(403);

      await pedirLink(pendente).expect(204);
      const r = await redefinir(tokenDoLink(ultimoEmailPara(pendente)), senhaNova).expect(200);
      expect(r.body.usuario.emailVerificado).toBe(true);

      await request(app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: pendente, senha: senhaNova })
        .expect(200);
    });
  });
});
