import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { estaNaHora, momentoLocal } from '../src/modules/notificacoes/agenda';
import { NotificacoesService } from '../src/modules/notificacoes/notificacoes.service';

describe('Lembretes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificacoes: NotificacoesService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let token: string;
  let idAluno: string;

  const url = (c: string) => `/api/v1${c}`;

  /** 2026-07-29 é uma quarta-feira. 13:30 UTC = 10:30 em São Paulo (UTC-3). */
  const QUARTA_1030_SP = new Date('2026-07-29T13:30:00.000Z');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    notificacoes = app.get(NotificacoesService);
    servidor = app.getHttpServer();

    const registro = await request(servidor)
      .post(url('/auth/registrar/aluno'))
      .send({
        nome: 'Aluno Lembrete',
        email: `lembrete.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1997-06-01',
      })
      .expect(201);
    token = registro.body.accessToken;
    idAluno = registro.body.usuario.id;
  });

  afterAll(async () => {
    await prisma.notificacao.deleteMany({ where: { userId: idAluno } });
    await prisma.configuracaoLembrete.deleteMany({ where: { alunoId: idAluno } });
    await prisma.tokenDispositivo.deleteMany({ where: { userId: idAluno } });
    await prisma.perfilAluno.deleteMany({ where: { userId: idAluno } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idAluno } });
    await prisma.user.deleteMany({ where: { id: idAluno } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notificacao.deleteMany({ where: { userId: idAluno } });
  });

  describe('cálculo de horário local', () => {
    it('converte UTC para o fuso do aluno', () => {
      const sp = momentoLocal(QUARTA_1030_SP, 'America/Sao_Paulo');
      expect(sp.horario).toBe('10:30');
      expect(sp.diaDaSemana).toBe(3); // quarta
      expect(sp.data).toBe('2026-07-29');
    });

    /** O mesmo instante é outro horário em outro fuso — por isso nada usa o relógio do servidor. */
    it('o mesmo instante dá horário diferente em Rio Branco', () => {
      const acre = momentoLocal(QUARTA_1030_SP, 'America/Rio_Branco');
      expect(acre.horario).toBe('08:30');
    });

    it('lista de dias vazia significa todos os dias', () => {
      const momento = momentoLocal(QUARTA_1030_SP, 'America/Sao_Paulo');
      expect(estaNaHora(momento, ['10:30'], [])).toBe(true);
      expect(estaNaHora(momento, ['10:30'], [3])).toBe(true);
      expect(estaNaHora(momento, ['10:30'], [1, 5])).toBe(false);
      expect(estaNaHora(momento, ['11:00'], [])).toBe(false);
    });
  });

  describe('configuração', () => {
    it('recusa horário fora do formato HH:MM', async () => {
      const r = await request(servidor)
        .put(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'TREINO', horarios: ['7h da manhã'] })
        .expect(422);

      expect(r.body.erro.codigo).toBe('DADOS_INVALIDOS');
    });

    it('salva e sobrescreve a configuração do mesmo tipo', async () => {
      await request(servidor)
        .put(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'TREINO', horarios: ['07:00'], diasDaSemana: [1] })
        .expect(200);

      const r = await request(servidor)
        .put(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'TREINO', horarios: ['10:30'], diasDaSemana: [3] })
        .expect(200);

      expect(r.body.horarios).toEqual(['10:30']);

      const lista = await request(servidor)
        .get(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(lista.body).toHaveLength(1);
    });
  });

  describe('disparo', () => {
    beforeEach(async () => {
      await prisma.configuracaoLembrete.deleteMany({ where: { alunoId: idAluno } });
      await request(servidor)
        .put(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'TREINO', horarios: ['10:30'], diasDaSemana: [] })
        .expect(200);
    });

    it('dispara no horário configurado', async () => {
      const { enviados } = await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      expect(enviados).toBe(1);

      const criadas = await prisma.notificacao.findMany({ where: { userId: idAluno } });
      expect(criadas).toHaveLength(1);
      expect(criadas[0]!.tipo).toBe('TREINO');
      expect(criadas[0]!.deeplink).toBe('viviofit://treino');
    });

    it('não dispara fora do horário', async () => {
      const umaHoraDepois = new Date(QUARTA_1030_SP.getTime() + 3600_000);
      const { enviados } = await notificacoes.dispararLembretesDevidos(umaHoraDepois);
      expect(enviados).toBe(0);
    });

    /**
     * A varredura roda a cada minuto e pode haver mais de uma instância da API.
     * A unique (userId, tipo, referenteA) é o que impede o aluno de receber o
     * mesmo lembrete várias vezes.
     */
    it('rodar duas vezes no mesmo minuto envia uma vez só', async () => {
      await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      const segunda = await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);

      expect(segunda.enviados).toBe(0);
      expect(await prisma.notificacao.count({ where: { userId: idAluno } })).toBe(1);
    });

    it('varreduras simultâneas também geram uma notificação só', async () => {
      await Promise.all([
        notificacoes.dispararLembretesDevidos(QUARTA_1030_SP),
        notificacoes.dispararLembretesDevidos(QUARTA_1030_SP),
      ]);
      expect(await prisma.notificacao.count({ where: { userId: idAluno } })).toBe(1);
    });

    it('respeita os dias da semana escolhidos', async () => {
      await request(servidor)
        .put(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'TREINO', horarios: ['10:30'], diasDaSemana: [1, 5] }) // seg e sex
        .expect(200);

      const { enviados } = await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      expect(enviados).toBe(0); // quarta não está na lista
    });

    it('lembrete desativado não dispara', async () => {
      await request(servidor)
        .put(url('/me/lembretes'))
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'TREINO', horarios: ['10:30'], ativo: false })
        .expect(200);

      const { enviados } = await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      expect(enviados).toBe(0);
    });

    it('sem dispositivo, registra a notificação mas marca falha de entrega', async () => {
      await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      const criada = await prisma.notificacao.findFirstOrThrow({ where: { userId: idAluno } });

      expect(criada.enviadaEm).toBeNull();
      expect(criada.erro).toBe('SEM_DISPOSITIVO');
    });

    it('com dispositivo registrado, marca como enviada', async () => {
      await request(servidor)
        .put(url('/me/dispositivos'))
        .set('Authorization', `Bearer ${token}`)
        .send({ token: `token-de-teste-${sufixo}`, plataforma: 'ANDROID' })
        .expect(204);

      await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      const criada = await prisma.notificacao.findFirstOrThrow({ where: { userId: idAluno } });

      expect(criada.enviadaEm).not.toBeNull();
      expect(criada.erro).toBeNull();
    });
  });

  describe('não incomodar quem já treinou', () => {
    it('quem treinou no dia não recebe lembrete de treino', async () => {
      const personal = await request(servidor)
        .post(url('/auth/login'))
        .send({ email: 'personal@viviofit.com.br', senha });
      const tokenPersonal = personal.body.accessToken;

      const convite = await request(servidor)
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ email: `lembrete.${sufixo}@exemplo.com` })
        .expect(201);
      await request(servidor)
        .patch(url(`/vinculos/${convite.body.id}/aceitar`))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(servidor)
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${token}`)
        .send({ escopo: 'TREINO' })
        .expect(201);

      const exercicio = await prisma.exercicio.findFirstOrThrow({
        where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
      });
      const plano = await request(servidor)
        .post(url(`/alunos/${idAluno}/planos-treino`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          nome: `Plano lembrete ${sufixo}`,
          ativar: true,
          sessoes: [
            { nome: 'A', itens: [{ exercicioId: exercicio.id, series: 1, repsAlvo: '10' }] },
          ],
        })
        .expect(201);

      // Treino registrado no MESMO dia local do lembrete
      await request(servidor)
        .post(url(`/alunos/${idAluno}/execucoes`))
        .set('Authorization', `Bearer ${token}`)
        .send({
          clienteUuid: randomUUID(),
          sessaoId: plano.body.sessoes[0].id,
          iniciadoEm: '2026-07-29T11:00:00.000Z',
          finalizadoEm: '2026-07-29T12:00:00.000Z',
          series: [
            {
              itemTreinoId: plano.body.sessoes[0].itens[0].id,
              serieNum: 1,
              repsFeitas: 10,
              cargaKg: 40,
            },
          ],
        })
        .expect(201);

      const { enviados } = await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);
      expect(enviados).toBe(0);

      await prisma.execucaoTreino.deleteMany({ where: { alunoId: idAluno } });
      await prisma.planoTreino.deleteMany({ where: { alunoId: idAluno } });
      await prisma.consentimento.deleteMany({ where: { alunoId: idAluno } });
      await prisma.vinculo.deleteMany({ where: { alunoId: idAluno } });
      await prisma.logAuditoria.deleteMany({
        where: { OR: [{ alunoId: idAluno }, { atorId: idAluno }] },
      });
    });
  });

  describe('histórico', () => {
    it('lista as notificações e marca como lida', async () => {
      await notificacoes.dispararLembretesDevidos(QUARTA_1030_SP);

      const lista = await request(servidor)
        .get(url('/me/notificacoes'))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(lista.body.length).toBeGreaterThan(0);
      expect(lista.body[0].lidaEm).toBeNull();

      await request(servidor)
        .patch(url(`/me/notificacoes/${lista.body[0].id}/lida`))
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const depois = await request(servidor)
        .get(url('/me/notificacoes'))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(depois.body[0].lidaEm).not.toBeNull();
    });
  });
});
