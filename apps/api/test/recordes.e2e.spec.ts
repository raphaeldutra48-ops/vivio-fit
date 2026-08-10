import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Marcas pessoais — "meus recordes".
 *
 * O que se protege aqui é a **honestidade da data**: o recorde diz quando a
 * pessoa superou a si mesma, e repetir o mesmo peso semanas depois não pode
 * reescrever essa data. E a regra do aquecimento, que já vale no volume e na
 * progressão: série leve de preparo não vira marca.
 */
describe('Marcas pessoais do aluno (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `recordes.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idSessao: string;
  let idItemSupino: string;
  let idItemRosca: string;
  let idSupino: string;
  let idRosca: string;

  const buscar = (token = tokenAluno) =>
    request(servidor)
      .get(url(`/alunos/${idAluno}/recordes`))
      .set('Authorization', `Bearer ${token}`);

  /** Grava um treino com data no passado, direto no banco. */
  const treinar = (
    diasAtras: number,
    series: { item: string; exercicio: string; carga: number; reps: number; tipo?: string }[],
  ) => {
    const quando = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
    return prisma.execucaoTreino.create({
      data: {
        alunoId: idAluno,
        sessaoId: idSessao,
        clienteUuid: randomUUID(),
        iniciadoEm: quando,
        finalizadoEm: new Date(quando.getTime() + 40 * 60 * 1000),
        duracaoSeg: 40 * 60,
        series: {
          create: series.map((s, i) => ({
            itemTreinoId: s.item,
            exercicioId: s.exercicio,
            serieNum: i + 1,
            repsFeitas: s.reps,
            cargaKg: s.carga,
            tipo: (s.tipo ?? 'NORMAL') as never,
          })),
        },
      },
    });
  };

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

    const conta = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Recordista',
      email: emailAluno,
      senha,
      dataNascimento: '1994-05-05',
    });
    tokenAluno = conta.accessToken;
    idAluno = conta.usuario.id;

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
      .send({ escopo: 'TREINO' })
      .expect(201);

    const [supino, rosca] = await Promise.all([
      prisma.exercicio.findFirstOrThrow({
        where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
      }),
      prisma.exercicio.findFirstOrThrow({ where: { nome: 'Rosca direta com barra', escopo: 'GLOBAL' } }),
    ]);
    idSupino = supino.id;
    idRosca = rosca.id;

    const plano = await request(servidor)
      .post(url(`/alunos/${idAluno}/planos-treino`))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({
        nome: `Plano de recordes ${sufixo}`,
        ativar: true,
        sessoes: [
          {
            nome: 'Treino de teste',
            itens: [
              { exercicioId: supino.id, series: 3, repsAlvo: '8', cargaSugeridaKg: 40 },
              { exercicioId: rosca.id, series: 3, repsAlvo: '12', cargaSugeridaKg: 10 },
            ],
          },
        ],
      })
      .expect(201);
    idSessao = plano.body.sessoes[0].id;
    idItemSupino = plano.body.sessoes[0].itens[0].id;
    idItemRosca = plano.body.sessoes[0].itens[1].id;

    /*
      Linha do tempo: o supino chega a 50 kg há 40 dias e a pessoa REPETE os
      mesmos 50 kg há 2 dias. A rosca sobe para 14 kg há 3 dias.
    */
    await treinar(60, [{ item: idItemSupino, exercicio: idSupino, carga: 40, reps: 8 }]);
    await treinar(40, [{ item: idItemSupino, exercicio: idSupino, carga: 50, reps: 6 }]);
    await treinar(3, [{ item: idItemRosca, exercicio: idRosca, carga: 14, reps: 10 }]);
    await treinar(2, [{ item: idItemSupino, exercicio: idSupino, carga: 50, reps: 5 }]);
  });

  afterAll(async () => {
    const u = await prisma.user.findUnique({ where: { email: emailAluno } });
    if (u) {
      await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
      await prisma.serieExecutada.deleteMany({ where: { execucao: { alunoId: u.id } } });
      await prisma.execucaoTreino.deleteMany({ where: { alunoId: u.id } });
      await prisma.planoTreino.deleteMany({ where: { alunoId: u.id } });
      await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
      await prisma.vinculo.deleteMany({ where: { alunoId: u.id } });
      await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
      await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  const marcaDe = (corpo: { marcas: { exercicioId: string }[] }, exercicioId: string) =>
    corpo.marcas.find((m) => m.exercicioId === exercicioId) as
      | {
          cargaMaximaKg: number;
          cargaMaximaEm: string;
          melhor1rmKg: number;
          volumeMaximoSerieKg: number;
          diasTreinados: number;
          ultimaEm: string;
          exercicioNome: string;
        }
      | undefined;

  describe('as marcas', () => {
    it('traz uma marca por exercício', async () => {
      const r = await buscar().expect(200);
      expect(r.body.total).toBe(2);
      expect(marcaDe(r.body, idSupino)?.exercicioNome).toBe('Supino reto com barra');
    });

    it('a carga máxima é a maior de todas as séries', async () => {
      const r = await buscar().expect(200);
      expect(marcaDe(r.body, idSupino)?.cargaMaximaKg).toBe(50);
      expect(marcaDe(r.body, idRosca)?.cargaMaximaKg).toBe(14);
    });

    /*
      A defesa central. A pessoa repetiu 50 kg há 2 dias, mas conquistou os
      50 kg há 40. Dizer que o recorde é de anteontem transformaria "eu
      superei" em "eu mantive", que é outra coisa.
    */
    it('a data é a da conquista, não a da última repetição', async () => {
      const r = await buscar().expect(200);
      const supino = marcaDe(r.body, idSupino)!;

      const quarentaDias = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      expect(supino.cargaMaximaEm).toBe(quarentaDias);

      // A última vez que treinou o exercício é outro campo, e esse sim é recente.
      const doisDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(supino.ultimaEm).toBe(doisDias);
    });

    it('conta os dias em que treinou cada exercício', async () => {
      const r = await buscar().expect(200);
      expect(marcaDe(r.body, idSupino)?.diasTreinados).toBe(3);
      expect(marcaDe(r.body, idRosca)?.diasTreinados).toBe(1);
    });

    it('o 1RM sai da melhor série, não da mais pesada', async () => {
      const r = await buscar().expect(200);
      // 50 × (1 + 6/30) = 60; a série de 5 reps dá 58,3.
      expect(marcaDe(r.body, idSupino)?.melhor1rmKg).toBe(60);
    });

    it('o volume é o da melhor série, não o da sessão', async () => {
      const r = await buscar().expect(200);
      // 50 × 6 = 300 é maior que 40 × 8 = 320? Não: 320 vence.
      expect(marcaDe(r.body, idSupino)?.volumeMaximoSerieKg).toBe(320);
    });
  });

  describe('ordem', () => {
    /*
      Conquista mais recente primeiro. A rosca (há 3 dias) tem carga muito
      menor que o supino (há 40) e mesmo assim abre a lista — ordenar por peso
      faria a tela virar ranking de exercício.
    */
    it('a conquista mais recente vem primeiro, mesmo sendo mais leve', async () => {
      const r = await buscar().expect(200);
      expect(r.body.marcas[0].exercicioId).toBe(idRosca);
    });
  });

  describe('aquecimento', () => {
    /*
      Mesma regra do volume e da progressão: série de preparo não vira marca.
      Sem isso, quem aquecesse com 60 kg numa barra guiada teria um "recorde"
      que nunca levantou de verdade.
    */
    it('série de aquecimento não vira recorde', async () => {
      await treinar(1, [
        { item: idItemRosca, exercicio: idRosca, carga: 30, reps: 15, tipo: 'AQUECIMENTO' },
        { item: idItemRosca, exercicio: idRosca, carga: 12, reps: 10 },
      ]);

      const r = await buscar().expect(200);
      expect(marcaDe(r.body, idRosca)?.cargaMaximaKg).toBe(14);
    });
  });

  describe('quem pode ver', () => {
    it('o personal com consentimento também lê', async () => {
      const r = await buscar(tokenPersonal).expect(200);
      expect(r.body.total).toBe(2);
    });

    it('sem vínculo não lê', async () => {
      const estranho = await criarAlunoVerificado(servidor, {
        nome: 'Estranho Recordes',
        email: `estranho-rec.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1990-01-01',
      });

      await buscar(estranho.accessToken).expect(403);

      const u = await prisma.user.findUnique({ where: { email: `estranho-rec.${sufixo}@exemplo.com` } });
      if (u) {
        await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
        await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
        await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    });
  });

  describe('sem treino nenhum', () => {
    it('devolve lista vazia, não erro', async () => {
      const novo = await criarAlunoVerificado(servidor, {
        nome: 'Aluno Sem Treino',
        email: `sem-treino.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1991-02-02',
      });

      const r = await request(servidor)
        .get(url(`/alunos/${novo.usuario.id}/recordes`))
        .set('Authorization', `Bearer ${novo.accessToken}`)
        .expect(200);

      expect(r.body).toEqual({ total: 0, marcas: [] });

      const u = await prisma.user.findUnique({ where: { email: `sem-treino.${sufixo}@exemplo.com` } });
      if (u) {
        await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
        await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
        await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    });
  });
});
