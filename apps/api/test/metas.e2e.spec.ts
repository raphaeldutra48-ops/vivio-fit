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
 * Metas.
 *
 * O que separa isto de uma lista de tarefas é a **aferição automática**: o
 * sistema lê medidas e execuções e diz sozinho onde a pessoa está. Estes
 * testes protegem essa leitura — e o congelamento do valor inicial, que é a
 * régua sem a qual "faltam 3 kg" não diz se andou 10% ou 90% do caminho.
 */
describe('Metas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `metas.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idExercicio: string;
  let idSessao: string;
  let idItem: string;

  const criarMeta = (corpo: Record<string, unknown>, token = tokenPersonal) =>
    request(servidor)
      .post(url(`/alunos/${idAluno}/metas`))
      .set('Authorization', `Bearer ${token}`)
      .send(corpo);

  const listarMetas = (token = tokenPersonal) =>
    request(servidor)
      .get(url(`/alunos/${idAluno}/metas`))
      .set('Authorization', `Bearer ${token}`);

  const registrarPeso = (pesoKg: number, diasAtras: number) => {
    const d = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
    return request(servidor)
      .post(url(`/alunos/${idAluno}/medidas`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ data: d.toISOString().slice(0, 10), pesoKg })
      .expect(201);
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

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Metas',
      email: emailAluno,
      senha,
      dataNascimento: '1992-02-02',
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

    for (const escopo of ['TREINO', 'EVOLUCAO']) {
      await request(servidor)
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ escopo })
        .expect(201);
    }

    const supino = await prisma.exercicio.findFirstOrThrow({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });
    idExercicio = supino.id;

    const plano = await request(servidor)
      .post(url(`/alunos/${idAluno}/planos-treino`))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({
        nome: 'Plano Metas',
        ativar: true,
        sessoes: [{ nome: 'A', itens: [{ exercicioId: idExercicio, series: 3, repsAlvo: '10' }] }],
      })
      .expect(201);

    idSessao = plano.body.sessoes[0].id;
    idItem = plano.body.sessoes[0].itens[0].id;
  });

  const apagarConta = async (email: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
    await prisma.meta.deleteMany({ where: { alunoId: u.id } });
    await prisma.serieExecutada.deleteMany({ where: { execucao: { alunoId: u.id } } });
    await prisma.execucaoTreino.deleteMany({ where: { alunoId: u.id } });
    await prisma.medida.deleteMany({ where: { alunoId: u.id } });
    await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
    await prisma.vinculo.deleteMany({ where: { OR: [{ alunoId: u.id }, { profissionalId: u.id }] } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
    await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
    await prisma.planoTreino.deleteMany({ where: { alunoId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  };

  afterAll(async () => {
    await apagarConta(emailAluno);
    await app.close();
  });

  describe('quem pode o quê', () => {
    it('o aluno NÃO cria meta para si', async () => {
      const r = await criarMeta(
        { tipo: 'LIVRE', titulo: 'Ficar sarado' },
        tokenAluno,
      ).expect(403);
      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('o aluno lê as próprias metas', async () => {
      await listarMetas(tokenAluno).expect(200);
    });
  });

  describe('validação', () => {
    it('meta mensurável sem alvo é recusada', async () => {
      const r = await criarMeta({ tipo: 'PESO_CORPORAL', titulo: 'Emagrecer' }).expect(422);
      expect(r.body.erro.codigo).toBe('DADOS_INVALIDOS');
    });

    /** "Chegar a 100 kg" sem dizer em quê é impossível de aferir depois. */
    it('meta de carga sem exercício é recusada', async () => {
      await criarMeta({ tipo: 'CARGA_EXERCICIO', titulo: 'Supino forte', alvo: 100 }).expect(422);
    });

    it('meta LIVRE não precisa de alvo', async () => {
      const r = await criarMeta({ tipo: 'LIVRE', titulo: 'Dormir 8 horas' }).expect(201);
      expect(r.body.alvo).toBeNull();
      expect(r.body.progresso).toBeNull();
      expect(r.body.atingida).toBe(false);
    });
  });

  describe('aferição de peso', () => {
    let idMeta: string;

    beforeAll(async () => {
      // A pessoa está em 80 kg quando a meta nasce.
      await registrarPeso(80, 20);

      const r = await criarMeta({
        tipo: 'PESO_CORPORAL',
        titulo: 'Chegar a 75 kg',
        alvo: 75,
      }).expect(201);
      idMeta = r.body.id;
    });

    /** Sem a régua congelada, "faltam 3 kg" não diz se andou 10% ou 90%. */
    it('congela o valor inicial no momento da criação', async () => {
      const metas = await listarMetas().expect(200);
      const meta = metas.body.find((m: { id: string }) => m.id === idMeta);
      expect(meta.valorInicial).toBe(80);
      expect(meta.valorAtual).toBe(80);
      expect(meta.progresso).toBe(0);
    });

    /*
      O caso central: 78 kg com alvo 75 é 40% do caminho, não 97%. A régua é a
      distância percorrida desde o início, não a distância até zero.
    */
    it('progresso mede o caminho andado, não a proximidade do número', async () => {
      await registrarPeso(78, 1);

      const metas = await listarMetas().expect(200);
      const meta = metas.body.find((m: { id: string }) => m.id === idMeta);
      expect(meta.valorAtual).toBe(78);
      expect(meta.progresso).toBe(40);
      expect(meta.atingida).toBe(false);
    });

    it('chegar ao alvo marca como atingida, sem ninguém clicar', async () => {
      await registrarPeso(75, 0);

      const metas = await listarMetas().expect(200);
      const meta = metas.body.find((m: { id: string }) => m.id === idMeta);
      expect(meta.progresso).toBe(100);
      expect(meta.atingida).toBe(true);
      // Não foi marcada à mão: a aferição bastou.
      expect(meta.concluidaEm).toBeNull();
    });
  });

  describe('aferição de carga', () => {
    it('usa a maior carga em série de trabalho, ignorando aquecimento', async () => {
      const criada = await criarMeta({
        tipo: 'CARGA_EXERCICIO',
        titulo: 'Supino 100 kg',
        alvo: 100,
        exercicioId: idExercicio,
      }).expect(201);

      // Aquecimento pesado não pode bater a meta.
      await request(servidor)
        .post(url(`/alunos/${idAluno}/execucoes`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({
          clienteUuid: randomUUID(),
          sessaoId: idSessao,
          iniciadoEm: new Date().toISOString(),
          finalizadoEm: new Date().toISOString(),
          series: [
            { itemTreinoId: idItem, serieNum: 1, repsFeitas: 5, cargaKg: 120, tipo: 'AQUECIMENTO' },
            { itemTreinoId: idItem, serieNum: 2, repsFeitas: 8, cargaKg: 70 },
          ],
        })
        .expect(201);

      const metas = await listarMetas().expect(200);
      const meta = metas.body.find((m: { id: string }) => m.id === criada.body.id);
      expect(meta.valorAtual).toBe(70);
      expect(meta.atingida).toBe(false);
      expect(meta.exercicioNome).toBe('Supino reto com barra');
    });
  });

  describe('conclusão manual', () => {
    let idLivre: string;

    beforeAll(async () => {
      const r = await criarMeta({ tipo: 'LIVRE', titulo: 'Melhorar postura' }).expect(201);
      idLivre = r.body.id;
    });

    it('o profissional marca a meta LIVRE como cumprida', async () => {
      const r = await request(servidor)
        .patch(url(`/alunos/${idAluno}/metas/${idLivre}/concluir`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.atingida).toBe(true);
      expect(r.body.concluidaEm).toBeTruthy();
    });

    it('e pode reabrir', async () => {
      const r = await request(servidor)
        .patch(url(`/alunos/${idAluno}/metas/${idLivre}/reabrir`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.atingida).toBe(false);
      expect(r.body.concluidaEm).toBeNull();
    });

    it('o aluno não marca as próprias metas', async () => {
      await request(servidor)
        .patch(url(`/alunos/${idAluno}/metas/${idLivre}/concluir`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(403);
    });
  });

  describe('remoção', () => {
    it('some da listagem sem apagar do banco', async () => {
      const criada = await criarMeta({ tipo: 'LIVRE', titulo: 'Meta a remover' }).expect(201);

      await request(servidor)
        .delete(url(`/alunos/${idAluno}/metas/${criada.body.id}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(204);

      const metas = await listarMetas().expect(200);
      expect(metas.body.find((m: { id: string }) => m.id === criada.body.id)).toBeUndefined();

      const noBanco = await prisma.meta.findUnique({ where: { id: criada.body.id } });
      expect(noBanco?.deletadoEm).not.toBeNull();
    });
  });
});
