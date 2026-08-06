import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Check-in diário.
 *
 * O que estes testes protegem, além do caminho feliz, são duas decisões que
 * dariam número errado em silêncio se mudassem sem querer: **quem pode
 * escrever** e **qual é o denominador da adesão**.
 */
describe('Check-in diário (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `checkin.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;

  /** `AAAA-MM-DD` de N dias atrás, em UTC — mesmo relógio do serviço. */
  const diaAtras = (n: number): string => {
    const hoje = new Date();
    const d = new Date(
      Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - n),
    );
    return d.toISOString().slice(0, 10);
  };

  const enviar = (corpo: Record<string, unknown>, token = tokenAluno) =>
    request(servidor)
      .post(url(`/alunos/${idAluno}/checkins`))
      .set('Authorization', `Bearer ${token}`)
      .send(corpo);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    const login = await request(servidor)
      .post(url('/auth/login'))
      .send({ email: 'personal@viviofit.com.br', senha });
    tokenPersonal = login.body.accessToken;

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Checkin',
      email: emailAluno,
      senha,
      dataNascimento: '1994-04-04',
    });
    tokenAluno = aluno.accessToken;
    idAluno = aluno.usuario.id;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email: emailAluno })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
    await request(servidor)
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ escopo: 'EVOLUCAO' })
      .expect(201);
  });

  /**
   * Apaga a conta e o que aponta para ela.
   *
   * O check-in some sozinho (cascade), mas vínculo, consentimento, perfil e
   * auditoria não — e a auditoria guarda até as tentativas NEGADAS, que é
   * justamente o que o teste de isolamento produz.
   */
  const apagarConta = async (email: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
    await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
    await prisma.vinculo.deleteMany({ where: { OR: [{ alunoId: u.id }, { profissionalId: u.id }] } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
    await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  };

  afterAll(async () => {
    await apagarConta(emailAluno);
    await app.close();
  });

  describe('registro', () => {
    it('o aluno registra o dia', async () => {
      const r = await enviar({ data: diaAtras(0), treinou: true, energia: 4 }).expect(201);

      expect(r.body).toMatchObject({ data: diaAtras(0), treinou: true, energia: 4 });
      expect(r.body.teveDor).toBe(false);
    });

    /*
      A correção é o caso comum: marcou "não treinei" de manhã e treinou à
      noite. Se virasse um segundo registro, o mesmo dia contaria duas vezes na
      adesão.
    */
    it('registrar de novo no mesmo dia corrige, não duplica', async () => {
      await enviar({ data: diaAtras(0), treinou: false, energia: 2 }).expect(201);

      const lista = await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins?dias=7`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const doDia = lista.body.filter((c: { data: string }) => c.data === diaAtras(0));
      expect(doDia).toHaveLength(1);
      expect(doDia[0]).toMatchObject({ treinou: false, energia: 2 });
    });

    /*
      Deixar o profissional registrar destruiria o valor do dado: ele deixaria
      de dizer o que o aluno fez e passaria a dizer o que o profissional acha
      que ele fez.
    */
    it('o profissional NÃO registra check-in pelo aluno', async () => {
      const r = await enviar({ data: diaAtras(1), treinou: true, energia: 5 }, tokenPersonal).expect(
        403,
      );
      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('recusa dia no futuro', async () => {
      await enviar({ data: diaAtras(-5), treinou: true, energia: 3 }).expect(409);
    });

    /** Preencher o mês todo de uma vez viraria adesão escrita, não vivida. */
    it('recusa retroativo além da janela', async () => {
      await enviar({ data: diaAtras(30), treinou: true, energia: 3 }).expect(409);
    });

    it('recusa energia fora da escala', async () => {
      await enviar({ data: diaAtras(0), treinou: true, energia: 9 }).expect(422);
      await enviar({ data: diaAtras(0), treinou: true, energia: 0 }).expect(422);
    });

    /** Local de dor sem dor é contradição, e ficaria guardado para sempre. */
    it('local da dor é descartado quando não houve dor', async () => {
      const r = await enviar({
        data: diaAtras(0),
        treinou: true,
        energia: 4,
        teveDor: false,
        localDor: 'joelho',
      }).expect(201);

      expect(r.body.localDor).toBeNull();
    });

    it('guarda o local quando houve dor', async () => {
      const r = await enviar({
        data: diaAtras(1),
        treinou: true,
        energia: 3,
        teveDor: true,
        localDor: 'ombro direito',
        observacao: 'incomodou no supino',
      }).expect(201);

      expect(r.body).toMatchObject({ teveDor: true, localDor: 'ombro direito' });
      expect(r.body.observacao).toBe('incomodou no supino');
    });
  });

  describe('resumo para o profissional', () => {
    beforeAll(async () => {
      // Três dias registrados: treinou, treinou, não treinou.
      await enviar({ data: diaAtras(0), treinou: true, energia: 5 }).expect(201);
      await enviar({ data: diaAtras(1), treinou: true, energia: 3, teveDor: true }).expect(201);
      await enviar({ data: diaAtras(2), treinou: false, energia: 2 }).expect(201);
    });

    /*
      O denominador é dias COM CHECK-IN, não dias do período. Usar o período
      inteiro daria 7% de adesão (2 de 30) para quem treinou 2 dos 3 dias que
      registrou — e o personal cobraria a pessoa errada.
    */
    it('adesão usa os dias registrados como denominador, não o período', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins/resumo?dias=30`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.comCheckin).toBe(3);
      expect(r.body.treinou).toBe(2);
      expect(r.body.aderencia).toBe(67);
      expect(r.body.dias).toBe(30);
    });

    it('traz energia média, dias com dor e o último check-in', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins/resumo?dias=30`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      // (5 + 3 + 2) / 3
      expect(r.body.energiaMedia).toBeCloseTo(3.3, 1);
      expect(r.body.diasComDor).toBe(1);
      expect(r.body.diasSemCheckin).toBe(0);
      expect(r.body.ultimoEm).toBe(diaAtras(0));
    });

    it('o profissional lê a lista do aluno vinculado', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins?dias=7`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThanOrEqual(3);
      // Mais recente primeiro — é a ordem que a tela usa.
      expect(r.body[0].data).toBe(diaAtras(0));
    });

    it('a janela de dias é respeitada', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins?dias=1`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body).toHaveLength(1);
      expect(r.body[0].data).toBe(diaAtras(0));
    });
  });

  describe('isolamento', () => {
    it('profissional sem vínculo não lê', async () => {
      const outro = await criarAlunoVerificado(servidor, {
        nome: 'Sem Vínculo',
        email: `estranho.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1990-01-01',
      });

      await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins`))
        .set('Authorization', `Bearer ${outro.accessToken}`)
        .expect(403);

      await apagarConta(`estranho.${sufixo}@exemplo.com`);
    });

    it('sem token não passa', async () => {
      await request(servidor).get(url(`/alunos/${idAluno}/checkins`)).expect(401);
    });
  });
});
