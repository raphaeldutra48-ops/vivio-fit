import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';

describe('Agenda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenNutri: string;
  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idNutri: string;

  /** 2026-08-05 é uma quarta-feira. */
  const QUARTA = '2026-08-05';
  const url = (c: string) => `/api/v1${c}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    const entrar = async (email: string) =>
      (await request(servidor).post(url('/auth/login')).send({ email, senha })).body.accessToken;
    tokenNutri = await entrar('nutri@viviofit.com.br');
    tokenPersonal = await entrar('personal@viviofit.com.br');
    idNutri = (await prisma.user.findUniqueOrThrow({ where: { email: 'nutri@viviofit.com.br' } })).id;

    const email = `agenda.${sufixo}@exemplo.com`;
    const registro = await request(servidor)
      .post(url('/auth/registrar/aluno'))
      .send({ nome: 'Paciente Agenda', email, senha, dataNascimento: '1992-04-04' })
      .expect(201);
    tokenAluno = registro.body.accessToken;
    idAluno = registro.body.usuario.id;

    // Vínculo só com a nutricionista — o personal fica sem, de propósito.
    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenNutri}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
  });

  afterAll(async () => {
    await prisma.compromisso.deleteMany({ where: { alunoId: idAluno } });
    await prisma.bloqueioAgenda.deleteMany({ where: { profissionalId: idNutri } });
    await prisma.disponibilidadeSlot.deleteMany({ where: { profissionalId: idNutri } });
    await prisma.vinculo.deleteMany({ where: { alunoId: idAluno } });
    await prisma.perfilAluno.deleteMany({ where: { userId: idAluno } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idAluno } });
    await prisma.logAuditoria.deleteMany({
      where: { OR: [{ alunoId: idAluno }, { atorId: idAluno }] },
    });
    await prisma.user.deleteMany({ where: { id: idAluno } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.compromisso.deleteMany({ where: { alunoId: idAluno } });
  });

  const marcar = (inicio: string, fim?: string, tipo = 'AVALIACAO_FISICA') =>
    request(servidor)
      .post(url('/agenda'))
      .set('Authorization', `Bearer ${tokenNutri}`)
      .send({ alunoId: idAluno, tipo, inicioEm: inicio, ...(fim ? { fimEm: fim } : {}) });

  describe('marcação', () => {
    it('marca uma avaliação e usa a duração padrão do tipo', async () => {
      const r = await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);

      expect(r.body.tipo).toBe('AVALIACAO_FISICA');
      expect(r.body.status).toBe('AGENDADO');
      expect(r.body.duracaoMin).toBe(60); // padrão da avaliação física
      expect(r.body.aluno.id).toBe(idAluno);
    });

    it('consulta usa 50 minutos', async () => {
      const r = await marcar(`${QUARTA}T15:00:00.000Z`, undefined, 'CONSULTA').expect(201);
      expect(r.body.duracaoMin).toBe(50);
    });

    it('profissional sem vínculo não marca', async () => {
      const r = await request(servidor)
        .post(url('/agenda'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ alunoId: idAluno, tipo: 'TREINO_ACOMPANHADO', inicioEm: `${QUARTA}T09:00:00.000Z` })
        .expect(403);

      expect(r.body.erro.codigo).toBe('VINCULO_AUSENTE');
    });

    it('recusa fim antes do início', async () => {
      await marcar(`${QUARTA}T13:00:00.000Z`, `${QUARTA}T12:00:00.000Z`).expect(422);
    });
  });

  describe('sobreposição — a regra que a agenda não pode errar', () => {
    it('recusa compromisso que invade um já marcado', async () => {
      await marcar(`${QUARTA}T13:00:00.000Z`, `${QUARTA}T14:00:00.000Z`).expect(201);

      // Começa no meio do anterior
      const r = await marcar(`${QUARTA}T13:30:00.000Z`, `${QUARTA}T14:30:00.000Z`).expect(409);
      expect(r.body.erro.codigo).toBe('CONFLITO');
      expect(r.body.erro.mensagem).toContain('já tem um compromisso');
    });

    it('recusa também quem engloba o horário existente', async () => {
      await marcar(`${QUARTA}T13:00:00.000Z`, `${QUARTA}T14:00:00.000Z`).expect(201);
      await marcar(`${QUARTA}T12:00:00.000Z`, `${QUARTA}T15:00:00.000Z`).expect(409);
    });

    /** Fim de um é início do outro: encosta, não sobrepõe. Tem que passar. */
    it('permite compromissos encostados', async () => {
      await marcar(`${QUARTA}T13:00:00.000Z`, `${QUARTA}T14:00:00.000Z`).expect(201);
      await marcar(`${QUARTA}T14:00:00.000Z`, `${QUARTA}T15:00:00.000Z`).expect(201);
    });

    /**
     * Checagem só na aplicação deixaria as duas passarem na verificação e
     * gravarem. Quem impede é a restrição EXCLUDE no banco.
     */
    it('duas marcações simultâneas no mesmo horário: só uma entra', async () => {
      const [a, b] = await Promise.all([
        marcar(`${QUARTA}T16:00:00.000Z`, `${QUARTA}T17:00:00.000Z`),
        marcar(`${QUARTA}T16:00:00.000Z`, `${QUARTA}T17:00:00.000Z`),
      ]);

      const status = [a.status, b.status].sort();
      expect(status).toEqual([201, 409]);

      const total = await prisma.compromisso.count({
        where: { profissionalId: idNutri, inicioEm: new Date(`${QUARTA}T16:00:00.000Z`) },
      });
      expect(total).toBe(1);
    });

    it('cancelar libera o horário', async () => {
      const criado = await marcar(`${QUARTA}T18:00:00.000Z`, `${QUARTA}T19:00:00.000Z`).expect(201);

      await marcar(`${QUARTA}T18:00:00.000Z`, `${QUARTA}T19:00:00.000Z`).expect(409);

      await request(servidor)
        .patch(url(`/agenda/${criado.body.id}/status`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ status: 'CANCELADO', motivo: 'Paciente pediu' })
        .expect(200);

      // Mesmo horário, agora livre.
      await marcar(`${QUARTA}T18:00:00.000Z`, `${QUARTA}T19:00:00.000Z`).expect(201);
    });
  });

  describe('status', () => {
    it('o aluno confirma presença', async () => {
      const criado = await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);

      const r = await request(servidor)
        .patch(url(`/agenda/${criado.body.id}/status`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ status: 'CONFIRMADO' })
        .expect(200);

      expect(r.body.status).toBe('CONFIRMADO');
    });

    /** Registrar que o atendimento aconteceu é ato clínico — só o profissional. */
    it('o aluno não marca como realizado', async () => {
      const criado = await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);

      const r = await request(servidor)
        .patch(url(`/agenda/${criado.body.id}/status`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ status: 'REALIZADO' })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('estranho não enxerga o compromisso', async () => {
      const criado = await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);

      await request(servidor)
        .patch(url(`/agenda/${criado.body.id}/status`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ status: 'CANCELADO' })
        .expect(404);
    });

    it('remarcar volta o status para AGENDADO', async () => {
      const criado = await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);
      await request(servidor)
        .patch(url(`/agenda/${criado.body.id}/status`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ status: 'CONFIRMADO' })
        .expect(200);

      const r = await request(servidor)
        .patch(url(`/agenda/${criado.body.id}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ inicioEm: `${QUARTA}T20:00:00.000Z`, fimEm: `${QUARTA}T21:00:00.000Z` })
        .expect(200);

      // O aluno confirmou o horário antigo, não o novo.
      expect(r.body.status).toBe('AGENDADO');
    });
  });

  describe('horários livres', () => {
    beforeEach(async () => {
      await prisma.bloqueioAgenda.deleteMany({ where: { profissionalId: idNutri } });
      await request(servidor)
        .put(url('/agenda/disponibilidade'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          janelas: [{ diaSemana: 3, horaInicio: '13:00', horaFim: '17:00', duracaoMin: 60 }],
        })
        .expect(200);
    });

    it('gera as vagas da janela de atendimento', async () => {
      const r = await request(servidor)
        .get(url(`/agenda/horarios-livres?data=${QUARTA}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body).toHaveLength(4); // 13,14,15,16
      expect(r.body[0].inicioEm).toBe(`${QUARTA}T13:00:00.000Z`);
    });

    it('some a vaga já ocupada', async () => {
      await marcar(`${QUARTA}T14:00:00.000Z`, `${QUARTA}T15:00:00.000Z`).expect(201);

      const r = await request(servidor)
        .get(url(`/agenda/horarios-livres?data=${QUARTA}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body).toHaveLength(3);
      expect(r.body.map((h: { inicioEm: string }) => h.inicioEm)).not.toContain(
        `${QUARTA}T14:00:00.000Z`,
      );
    });

    it('bloqueio também tira a vaga da lista', async () => {
      await request(servidor)
        .post(url('/agenda/bloqueios'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          inicioEm: `${QUARTA}T15:00:00.000Z`,
          fimEm: `${QUARTA}T17:00:00.000Z`,
          motivo: 'Reunião',
        })
        .expect(201);

      const r = await request(servidor)
        .get(url(`/agenda/horarios-livres?data=${QUARTA}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body).toHaveLength(2); // sobram 13 e 14
    });

    it('dia sem janela de atendimento não tem vaga', async () => {
      const domingo = '2026-08-09';
      const r = await request(servidor)
        .get(url(`/agenda/horarios-livres?data=${domingo}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body).toHaveLength(0);
    });
  });

  describe('visões', () => {
    it('o profissional lista a agenda do período', async () => {
      await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);

      const r = await request(servidor)
        .get(url(`/agenda?de=${QUARTA}T00:00:00.000Z&ate=${QUARTA}T23:59:59.000Z`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body).toHaveLength(1);
    });

    it('o aluno vê os próprios compromissos', async () => {
      await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);

      const r = await request(servidor)
        .get(url(`/agenda/meus?de=${QUARTA}T00:00:00.000Z&ate=${QUARTA}T23:59:59.000Z`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body).toHaveLength(1);
      expect(r.body[0].profissional.nome).toBe('Eduarda Nutricionista');
    });

    it('cancelado não aparece na lista por padrão', async () => {
      const criado = await marcar(`${QUARTA}T13:00:00.000Z`).expect(201);
      await request(servidor)
        .patch(url(`/agenda/${criado.body.id}/status`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ status: 'CANCELADO' })
        .expect(200);

      const r = await request(servidor)
        .get(url(`/agenda?de=${QUARTA}T00:00:00.000Z&ate=${QUARTA}T23:59:59.000Z`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);
      expect(r.body).toHaveLength(0);

      const comCancelados = await request(servidor)
        .get(
          url(
            `/agenda?de=${QUARTA}T00:00:00.000Z&ate=${QUARTA}T23:59:59.000Z&incluirCancelados=true`,
          ),
        )
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);
      expect(comCancelados.body).toHaveLength(1);
    });
  });
});
