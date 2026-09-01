import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado } from './apoio';

describe('Execução de treino (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'Senha@123';
  let tokenPersonal: string;
  let tokenAna: string;
  let idAna: string;
  let idSessao: string;
  let idItemSupino: string;
  let idExercicioSupino: string;

  const url = (c: string) => `/api/v1${c}`;

  async function logar(email: string): Promise<string> {
    const r = await request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha });
    return r.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);

    tokenPersonal = await logar('personal@viviofit.com.br');

    // Aluno EXCLUSIVO deste teste. Reaproveitar o do seed deixava a suíte
    // instável: qualquer treino feito no app (ou por outro teste) virava "a
    // última execução" e quebrava as asserções da coluna ANTERIOR.
    const emailAluno = `execucao.${Date.now().toString(36)}@exemplo.com`;
    const registro = await criarAlunoVerificado(app.getHttpServer(), {
      nome: 'Aluno de Execução',
      email: emailAluno,
      senha,
      dataNascimento: '1996-02-10',
    });
    tokenAna = registro.accessToken;
    idAna = registro.usuario.id;

    const convite = await request(app.getHttpServer())
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email: emailAluno })
      .expect(201);
    await request(app.getHttpServer())
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ escopo: 'TREINO' })
      .expect(201);

    const supino = await prisma.exercicio.findFirstOrThrow({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });

    // Plano dedicado a este teste, para não depender do estado deixado por outros.
    const plano = await request(app.getHttpServer())
      .post(url(`/alunos/${idAna}/planos-treino`))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({
        nome: `Plano de execução ${Date.now()}`,
        ativar: true,
        sessoes: [
          {
            nome: 'Treino de teste',
            itens: [{ exercicioId: supino.id, series: 3, repsAlvo: '10', cargaSugeridaKg: 40 }],
          },
        ],
      });

    idSessao = plano.body.sessoes[0].id;
    idItemSupino = plano.body.sessoes[0].itens[0].id;
    idExercicioSupino = supino.id;
  });

  afterAll(async () => {
    // O aluno é exclusivo deste teste, então apagar tudo dele é seguro.
    await prisma.execucaoTreino.deleteMany({ where: { alunoId: idAna } });
    await prisma.planoTreino.deleteMany({ where: { alunoId: idAna } });
    await prisma.consentimento.deleteMany({ where: { alunoId: idAna } });
    await prisma.vinculo.deleteMany({ where: { alunoId: idAna } });
    await prisma.perfilAluno.deleteMany({ where: { userId: idAna } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idAna } });
    await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: idAna }, { atorId: idAna }] } });
    await prisma.user.deleteMany({ where: { id: idAna } });
    await app.close();
  });

  const treinoRealizado = (clienteUuid: string) => ({
    clienteUuid,
    sessaoId: idSessao,
    iniciadoEm: '2026-07-28T10:00:00.000Z',
    finalizadoEm: '2026-07-28T10:52:00.000Z',
    series: [
      { itemTreinoId: idItemSupino, serieNum: 1, repsFeitas: 12, cargaKg: 40, rpe: 7 },
      { itemTreinoId: idItemSupino, serieNum: 2, repsFeitas: 10, cargaKg: 42.5, rpe: 8 },
      {
        itemTreinoId: idItemSupino,
        serieNum: 3,
        repsFeitas: 8,
        cargaKg: 42.5,
        rpe: 9,
        tipo: 'FALHA',
      },
    ],
    feedback: { dificuldade: 4, teveDor: false, sensacao: 'Boa', comentario: 'Peito bem ativado' },
  });

  describe('registro', () => {
    it('o aluno registra o treino que executou', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(treinoRealizado(randomUUID()))
        .expect(201);

      expect(r.body.totalSeries).toBe(3);
      expect(r.body.duracaoSeg).toBe(52 * 60);
      // 40*12 + 42.5*10 + 42.5*8 = 480 + 425 + 340
      expect(r.body.volumeTotalKg).toBe(1245);
      expect(r.body.feedback.dificuldade).toBe(4);
      expect(r.body.jaRegistrada).toBeUndefined();
    });

    /**
     * O caso que existe por causa do modo offline: a fila local reenvia o mesmo
     * treino. Duplicar aqui estragaria o histórico de carga do aluno.
     */
    it('reenviar o mesmo clienteUuid NÃO duplica', async () => {
      const uuid = randomUUID();
      const primeira = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(treinoRealizado(uuid))
        .expect(201);

      const segunda = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(treinoRealizado(uuid))
        .expect(201);

      expect(segunda.body.id).toBe(primeira.body.id);
      expect(segunda.body.jaRegistrada).toBe(true);

      const total = await prisma.execucaoTreino.count({ where: { clienteUuid: uuid } });
      expect(total).toBe(1);
    });

    it('dois envios simultâneos do mesmo uuid resultam em uma execução só', async () => {
      const uuid = randomUUID();
      const envio = () =>
        request(app.getHttpServer())
          .post(url(`/alunos/${idAna}/execucoes`))
          .set('Authorization', `Bearer ${tokenAna}`)
          .send(treinoRealizado(uuid));

      const [a, b] = await Promise.all([envio(), envio()]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);

      expect(await prisma.execucaoTreino.count({ where: { clienteUuid: uuid } })).toBe(1);
    });

    it('recusa série que não pertence à sessão executada', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({
          ...treinoRealizado(randomUUID()),
          series: [{ itemTreinoId: 'cmxxxxxxxxxxxxxxxxxxxxxxx', serieNum: 1, repsFeitas: 10, cargaKg: 30 }],
        })
        .expect(409);

      expect(r.body.erro.codigo).toBe('CONFLITO');
    });

    it('recusa clienteUuid que não seja UUID', async () => {
      await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({ ...treinoRealizado('nao-e-uuid'), clienteUuid: 'nao-e-uuid' })
        .expect(422);
    });
  });

  describe('coluna ANTERIOR e histórico de carga', () => {
    it('devolve a última execução de cada exercício da sessão', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/sessoes/${idSessao}/anteriores`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      const previas = r.body.porExercicio[idExercicioSupino];
      expect(previas).toHaveLength(3);
      expect(previas[0]).toMatchObject({ serieNum: 1, cargaKg: 40, repsFeitas: 12 });
      expect(previas[2]).toMatchObject({ cargaKg: 42.5, tipo: 'FALHA' });
      expect(r.body.ultimaVezEm[idExercicioSupino]).toBeTruthy();
    });

    it('traz apenas a ÚLTIMA execução, não a soma de todas', async () => {
      // Já existem várias execuções deste teste; o "anterior" precisa ser de uma só.
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/sessoes/${idSessao}/anteriores`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body.porExercicio[idExercicioSupino]).toHaveLength(3);
    });

    it('monta a progressão de carga do exercício', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/exercicios/${idExercicioSupino}/historico-carga`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.exercicioNome).toBe('Supino reto com barra');
      expect(r.body.pontos.length).toBeGreaterThan(0);
      const ponto = r.body.pontos[r.body.pontos.length - 1];
      expect(ponto.cargaMaximaKg).toBe(42.5);
      // Epley com a melhor série: 40 × (1 + 12/30) = 56
      expect(ponto.estimativa1rmKg).toBeGreaterThanOrEqual(56);
    });

    /** Exercício nunca executado não pode quebrar a tela — devolve vazio. */
    it('exercício sem histórico devolve lista vazia', async () => {
      const outro = await prisma.exercicio.findFirstOrThrow({
        where: { nome: 'Prancha abdominal', escopo: 'GLOBAL' },
      });
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/exercicios/${outro.id}/historico-carga`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body.pontos).toHaveLength(0);
    });

    it('sem consentimento de TREINO o personal não vê o histórico', async () => {
      const bruno = await prisma.user.findUniqueOrThrow({
        where: { email: 'bruno@exemplo.com' },
      });
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${bruno.id}/exercicios/${idExercicioSupino}/historico-carga`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
    });
  });

  describe('leitura pelo profissional', () => {
    it('personal vê os treinos executados pela aluna', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body[0].sessaoNome).toBe('Treino de teste');
      expect(r.body[0].feedback.comentario).toBe('Peito bem ativado');
    });

    it('gera trilha de auditoria da leitura', async () => {
      const registro = await prisma.logAuditoria.findFirst({
        where: { alunoId: idAna, recursoTipo: 'EXECUCAO_TREINO', acao: 'LER' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(registro).toBeTruthy();
      expect(registro?.escopo).toBe('TREINO');
    });
  });

  describe('detalhe da dor', () => {
    /*
      "Sentiu dor" sozinho não muda conduta nenhuma. O que faz o personal
      trocar o exercício, baixar a carga ou mandar procurar um médico é saber
      ONDE, QUE TIPO e EM QUAL MOVIMENTO — e ele está online, não do lado para
      perguntar olhando.
    */
    it('guarda onde, que tipo, quando e em qual exercício', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({
          ...treinoRealizado(randomUUID()),
          feedback: {
            dificuldade: 5,
            teveDor: true,
            localDor: 'ombro direito',
            dorTipo: 'FISGADA',
            dorMomento: 'DURANTE',
            dorExercicioId: idExercicioSupino,
            comentario: 'Senti quando estava descendo a barra.',
          },
        })
        .expect(201);

      expect(r.body.feedback.localDor).toBe('ombro direito');
      expect(r.body.feedback.dorTipo).toBe('FISGADA');
      expect(r.body.feedback.dorMomento).toBe('DURANTE');
      expect(r.body.feedback.dorExercicioId).toBe(idExercicioSupino);
    });

    /*
      Nada é obrigatório: quem está com dor não pode ser barrado por não saber
      classificar. "Doeu" e mais nada tem que passar.
    */
    it('aceita dor sem nenhum detalhe', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({
          ...treinoRealizado(randomUUID()),
          feedback: { dificuldade: 3, teveDor: true },
        })
        .expect(201);

      expect(r.body.feedback.teveDor).toBe(true);
      expect(r.body.feedback.dorTipo).toBeNull();
      expect(r.body.feedback.dorExercicioId).toBeNull();
    });

    it('recusa tipo de dor que não existe', async () => {
      await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({
          ...treinoRealizado(randomUUID()),
          feedback: { dificuldade: 3, teveDor: true, dorTipo: 'INVENTADA' },
        })
        .expect(422);
    });
  });

  describe('volume e recordes', () => {
    const enviar = (series: Record<string, unknown>[]) =>
      request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({
          clienteUuid: randomUUID(),
          sessaoId: idSessao,
          iniciadoEm: '2026-08-01T10:00:00.000Z',
          finalizadoEm: '2026-08-01T11:00:00.000Z',
          series: series.map((s, i) => ({ itemTreinoId: idItemSupino, serieNum: i + 1, ...s })),
        });

    /*
      A conta do volume vivia em dois lugares com regras diferentes: aqui somava
      tudo, no gráfico de progressão o aquecimento ficava de fora. A mesma
      sessão tinha dois volumes em duas telas.
    */
    it('aquecimento não entra no volume nem na contagem de séries', async () => {
      const r = await enviar([
        { repsFeitas: 20, cargaKg: 20, tipo: 'AQUECIMENTO' },
        { repsFeitas: 10, cargaKg: 100 },
      ]).expect(201);

      // Só a série de trabalho: 100 × 10. O aquecimento somaria 400.
      expect(r.body.volumeTotalKg).toBe(1000);
      expect(r.body.totalSeries).toBe(1);
    });

    it('bater carga e 1RM devolve as medalhas, com o valor anterior', async () => {
      const r = await enviar([{ repsFeitas: 10, cargaKg: 200 }]).expect(201);

      const tipos = r.body.recordes.map((x: { tipo: string }) => x.tipo);
      expect(tipos).toContain('PESO');
      expect(tipos).toContain('UM_RM');

      const peso = r.body.recordes.find((x: { tipo: string }) => x.tipo === 'PESO');
      expect(peso.valor).toBe(200);
      // Mostrar "de X para Y" vale mais que só "Y".
      expect(peso.anterior).toBeLessThan(200);
      expect(peso.exercicioNome).toBeTruthy();
    });

    /*
      Empate não é recorde. Se fosse, todo treino de manutenção viraria três
      medalhas e o aviso perderia o sentido em duas semanas.
    */
    it('repetir a mesma marca não gera medalha', async () => {
      const r = await enviar([{ repsFeitas: 10, cargaKg: 200 }]).expect(201);
      expect(r.body.recordes).toEqual([]);
    });

    it('treino mais leve não gera medalha', async () => {
      const r = await enviar([{ repsFeitas: 5, cargaKg: 60 }]).expect(201);
      expect(r.body.recordes).toEqual([]);
    });

    /*
      A sugestão viaja junto da coluna ANTERIOR porque é lida no mesmo
      instante: o aluno olha "80 kg × 10" e precisa saber se repete ou sobe.
    */
    it('a sugestão de carga vem junto dos anteriores', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/sessoes/${idSessao}/anteriores`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      const sugestao = r.body.sugestao[idExercicioSupino];
      expect(sugestao).toBeTruthy();
      expect(['AUMENTAR', 'MANTER', 'REDUZIR', 'SEM_DADO']).toContain(sugestao.acao);
      // A frase chega pronta: a tela não remonta o texto.
      expect(sugestao.porque.length).toBeGreaterThan(20);
    });

    /** Listar histórico não apura recorde: seria uma consulta por linha. */
    it('a listagem não traz medalha', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      for (const execucao of r.body) expect(execucao.recordes).toEqual([]);
    });
  });
});
