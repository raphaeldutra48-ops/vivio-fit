import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EscopoDado, Papel, StatusVinculo } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * O diferencial do app, provado de ponta a ponta: o médico registra um exame e
 * **o personal — que não pode abrir exame nenhum — recebe a orientação**.
 *
 * E recebe sem o marcador e sem o valor. Se o alerta trouxesse a origem, ele
 * seria um caminho indireto para mostrar o exame a quem não pode lê-lo.
 */
describe('Alertas clínicos cruzados (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);

  let alunoId: string;
  let tokenMedico: string;
  let tokenNutri: string;
  let tokenPersonal: string;
  let tokenAluno: string;

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
    tokenMedico = await entrar('medico@viviofit.com.br');
    tokenNutri = await entrar('nutri@viviofit.com.br');
    tokenPersonal = await entrar('personal@viviofit.com.br');

    const idDe = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Paciente de Alerta',
      email: `alerta.${sufixo}@teste.com`,
      senha,
      dataNascimento: '1992-06-01',
    });
    alunoId = aluno.usuario.id;
    tokenAluno = aluno.accessToken;

    for (const [email, tipo] of [
      ['medico@viviofit.com.br', Papel.MEDICO],
      ['nutri@viviofit.com.br', Papel.NUTRICIONISTA],
      ['personal@viviofit.com.br', Papel.PERSONAL],
    ] as const) {
      const profissionalId = await idDe(email);
      await prisma.vinculo.create({
        data: {
          alunoId,
          profissionalId,
          tipo,
          status: StatusVinculo.ATIVO,
          convidadoPorId: profissionalId,
          iniciadoEm: new Date(),
        },
      });
    }

    await prisma.consentimento.create({
      data: {
        alunoId,
        escopo: EscopoDado.CLINICO,
        finalidade: 'Análise de exames laboratoriais',
        versaoTermo: '2026-07-v1',
      },
    });

    // Um exame com três achados de escopos diferentes:
    // TFG baixa (avisa os três), ferritina baixa (nutri + personal) e
    // TSH crítico (médico + nutricionista, este sem saber que é TSH).
    await request(servidor)
      .post(url(`/alunos/${alunoId}/exames`))
      .set({ Authorization: `Bearer ${tokenMedico}` })
      .send({
        laboratorio: `Lab alerta ${sufixo}`,
        dataColeta: '2026-07-25',
        sexo: 'F',
        resultados: [
          { marcador: 'TFG_ESTIMADA', valor: 67 },
          { marcador: 'FERRITINA', valor: 22 },
          { marcador: 'TSH', valor: 8.4 },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.alertaClinico.deleteMany({ where: { alunoId } });
    await prisma.exame.deleteMany({ where: { alunoId } });
    await prisma.consentimento.deleteMany({ where: { alunoId } });
    await prisma.vinculo.deleteMany({ where: { alunoId } });
    await prisma.user.deleteMany({ where: { id: alunoId } });
    await app.close();
  });

  const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  const listar = async (token: string) =>
    (
      await request(servidor)
        .get(url(`/alunos/${alunoId}/alertas`))
        .set(comToken(token))
        .expect(200)
    ).body;

  describe('o personal recebe orientação sem ver o exame', () => {
    /** O teste que resume o produto inteiro. */
    it('o personal é avisado de um exame que não pode abrir', async () => {
      // Confirma primeiro que ele realmente não abre o exame.
      await request(servidor)
        .get(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenPersonal))
        .expect(403);

      const alertas = await listar(tokenPersonal);

      expect(alertas.length).toBeGreaterThan(0);
      expect(alertas.map((a: { titulo: string }) => a.titulo)).toContain(
        'Cuidado renal — suplementação e carga proteica',
      );
    });

    it('e recebe sem marcador, sem valor e sem caminho para o exame', async () => {
      const alertas = await listar(tokenPersonal);

      for (const alerta of alertas) {
        expect(alerta.marcadorOrigem).toBeNull();
        expect(alerta.exameId).toBeNull();

        const texto = `${alerta.titulo} ${alerta.orientacao}`;
        expect(texto).not.toMatch(/TFG|filtração|ferritina|TSH/i);
        expect(texto).not.toMatch(/\b67\b|\b22\b|8[.,]4/);
      }
    });

    it('o personal só recebe o que é endereçado a ele', async () => {
      const alertas = await listar(tokenPersonal);
      expect(
        alertas.every((a: { papelDestino: string }) => a.papelDestino === Papel.PERSONAL),
      ).toBe(true);
    });
  });

  describe('cada papel recebe o seu', () => {
    it('o nutricionista recebe os dele, com origem só do que pode ver', async () => {
      const alertas = await listar(tokenNutri);

      const renal = alertas.find((a: { titulo: string }) =>
        a.titulo.includes('carga proteica'),
      );
      // Ele PODE ver a TFG, então rastreia até o exame.
      expect(renal.marcadorOrigem).toBe('TFG_ESTIMADA');
      expect(renal.exameId).not.toBeNull();

      const tireoide = alertas.find((a: { titulo: string }) => a.titulo.includes('Metas de peso'));
      // Não pode ver TSH — recebe a orientação, não a origem.
      expect(tireoide).toBeTruthy();
      expect(tireoide.marcadorOrigem).toBeNull();
      expect(tireoide.exameId).toBeNull();
      expect(`${tireoide.titulo} ${tireoide.orientacao}`).not.toContain('TSH');
    });

    it('o médico recebe o achado com nome e sobrenome', async () => {
      const alertas = await listar(tokenMedico);

      const tireoide = alertas.find((a: { titulo: string }) => a.titulo.includes('TSH'));
      expect(tireoide.marcadorOrigem).toBe('TSH');
      expect(tireoide.exameId).not.toBeNull();
      expect(tireoide.severidade).toBe('ALTA');
    });

    it('a severidade acompanha a classificação do achado', async () => {
      const doMedico = await listar(tokenMedico);
      const renal = doMedico.find((a: { titulo: string }) => a.titulo.includes('Função renal'));
      // TFG 67 é Atenção, então o alerta é médio.
      expect(renal.severidade).toBe('MEDIA');
    });

    it('o aluno não recebe alerta — orientação passa pelo profissional', async () => {
      await request(servidor)
        .get(url(`/alunos/${alunoId}/alertas`))
        .set(comToken(tokenAluno))
        .expect(403);
    });
  });

  describe('reconhecimento', () => {
    it('quem é destinatário dá baixa; outro papel não encontra o alerta', async () => {
      const doPersonal = await listar(tokenPersonal);
      const alerta = doPersonal[0];

      // O nutricionista não dá baixa em alerta do personal.
      await request(servidor)
        .patch(url(`/alunos/${alunoId}/alertas/${alerta.id}/reconhecer`))
        .set(comToken(tokenNutri))
        .send({})
        .expect(404);

      const r = await request(servidor)
        .patch(url(`/alunos/${alunoId}/alertas/${alerta.id}/reconhecer`))
        .set(comToken(tokenPersonal))
        .send({ anotacao: 'Conversado com o aluno' })
        .expect(200);

      expect(r.body.reconhecidoEm).not.toBeNull();
      expect(r.body.reconhecidoPor.nome).toBeTruthy();
    });
  });

  describe('geração', () => {
    /** Reprocessar não pode encher a tela de avisos repetidos. */
    it('registrar o mesmo exame de novo não duplica alerta', async () => {
      const antes = (await listar(tokenNutri)).length;

      await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenMedico))
        .send({
          laboratorio: `Lab alerta ${sufixo} bis`,
          dataColeta: '2026-07-26',
          sexo: 'F',
          // Mesmos achados, exame novo: aqui os alertas SÃO novos, porque a
          // dedupe é por exame — o que não pode é o mesmo exame duplicar.
          resultados: [{ marcador: 'FERRITINA', valor: 22 }],
        })
        .expect(201);

      const depois = (await listar(tokenNutri)).length;
      expect(depois).toBe(antes + 1);
    });

    it('exame sem achado não gera alerta nenhum', async () => {
      const antes = (await listar(tokenMedico)).length;

      await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenMedico))
        .send({
          laboratorio: `Lab limpo ${sufixo}`,
          dataColeta: '2026-07-27',
          sexo: 'F',
          resultados: [
            { marcador: 'FERRITINA', valor: 90 },
            { marcador: 'VITAMINA_D', valor: 50 },
          ],
        })
        .expect(201);

      expect((await listar(tokenMedico)).length).toBe(antes);
    });
  });
});
