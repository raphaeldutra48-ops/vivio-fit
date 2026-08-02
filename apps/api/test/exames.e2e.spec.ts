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
 * O que este arquivo protege é exposição de dado de saúde.
 *
 * O caso central: **médico e nutricionista lendo o MESMO exame recebem
 * conteúdos diferentes**. Não é filtro de tela — é o servidor que não manda o
 * que o papel não pode ver. E o personal não abre a rota, nem para ler.
 *
 * Cria o próprio aluno: mexer nas contas do seed já custou caro uma vez.
 */
describe('Exames — faixa funcional e escopo por papel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);

  let alunoId: string;
  let tokenAluno: string;
  let tokenMedico: string;
  let tokenNutri: string;
  let tokenPersonal: string;
  let idMedico: string;
  let idNutri: string;
  let idPersonal: string;
  let exameId: string;

  const corpoCompleto = {
    laboratorio: 'Laboratório de teste',
    dataColeta: '2026-07-25',
    sexo: 'F',
    resultados: [
      { marcador: 'VITAMINA_D', valor: 34.5 }, // normal no laudo, abaixo do alvo
      { marcador: 'TFG_ESTIMADA', valor: 67 }, // G2 pela KDIGO
      { marcador: 'GLICOSE_JEJUM', valor: 118 }, // fora do laudo
      { marcador: 'FERRITINA', valor: 80 },
      { marcador: 'TSH', valor: 3.2 }, // escopo médico
      { marcador: 'PROLACTINA', valor: 18 }, // escopo médico
    ],
  };

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
    idMedico = await idDe('medico@viviofit.com.br');
    idNutri = await idDe('nutri@viviofit.com.br');
    idPersonal = await idDe('personal@viviofit.com.br');

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Paciente de Exame',
      email: `exame.${sufixo}@teste.com`,
      senha,
      dataNascimento: '1994-03-10',
    });
    alunoId = aluno.usuario.id;
    tokenAluno = aluno.accessToken;

    for (const [profissionalId, tipo] of [
      [idMedico, Papel.MEDICO],
      [idNutri, Papel.NUTRICIONISTA],
      [idPersonal, Papel.PERSONAL],
    ] as const) {
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

    // Consentimento para a equipe inteira: assim o 403 do personal vem do
    // PAPEL, e não de falta de consentimento — que testaria outra coisa.
    await prisma.consentimento.create({
      data: {
        alunoId,
        escopo: EscopoDado.CLINICO,
        finalidade: 'Análise de exames laboratoriais',
        versaoTermo: '2026-07-v1',
      },
    });
  });

  afterAll(async () => {
    await prisma.exame.deleteMany({ where: { alunoId } });
    await prisma.consentimento.deleteMany({ where: { alunoId } });
    await prisma.vinculo.deleteMany({ where: { alunoId } });
    await prisma.user.deleteMany({ where: { id: alunoId } });
    await app.close();
  });

  const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('registro', () => {
    it('o médico registra o exame e a classificação sai congelada', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenMedico))
        .send(corpoCompleto)
        .expect(201);

      exameId = r.body.id;
      const porMarcador = Object.fromEntries(
        r.body.resultados.map((m: { marcador: string; classificacao: string }) => [
          m.marcador,
          m.classificacao,
        ]),
      );

      // Normal para o laudo, fora do ideal: é o caso que justifica o produto.
      expect(porMarcador.VITAMINA_D).toBe('ATENCAO');
      // G2 pela KDIGO — reduzido, não doente.
      expect(porMarcador.TFG_ESTIMADA).toBe('ATENCAO');
      // Fora da faixa do laboratório.
      expect(porMarcador.GLICOSE_JEJUM).toBe('CRITICO');
      expect(porMarcador.FERRITINA).toBe('OTIMO');
    });

    it('devolve a contagem por classificação para os chips da tela', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/${exameId}`))
        .set(comToken(tokenMedico))
        .expect(200);

      // Ótimo: ferritina 80 e prolactina 18. Atenção: vitamina D, TFG e TSH.
      // Crítico: glicose 118.
      expect(r.body.contagem).toEqual({ OTIMO: 2, ATENCAO: 3, CRITICO: 1 });
      expect(r.body.resultados).toHaveLength(6);
    });

    /**
     * TSH 3,2 é o mesmo fenômeno da vitamina D, do outro lado do corpo: a ATA
     * aceita até 4,0, e a prática funcional trabalha até 2,5. Laudo normal,
     * conversa a ter.
     */
    it('TSH dentro da ATA e acima do alvo funcional sai como Atenção', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/${exameId}`))
        .set(comToken(tokenMedico))
        .expect(200);

      const tsh = r.body.resultados.find((m: { marcador: string }) => m.marcador === 'TSH');

      expect(tsh.classificacao).toBe('ATENCAO');
      expect(tsh.laboratorial).toEqual({ min: 0.4, max: 4 });
      expect(tsh.funcional).toEqual({ min: 0.5, max: 2.5 });
    });

    it('cada marcador vem com as duas faixas e as duas fontes', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/${exameId}`))
        .set(comToken(tokenMedico))
        .expect(200);

      const vitD = r.body.resultados.find(
        (m: { marcador: string }) => m.marcador === 'VITAMINA_D',
      );

      expect(vitD.laboratorial).toEqual({ min: 30 });
      expect(vitD.funcional).toEqual({ min: 40, max: 60 });
      expect(vitD.fonteLaboratorial.sigla).toBe('Endocrine Society');
      expect(vitD.fonteFuncional.forca).toBe('DIRETRIZ');
    });
  });

  describe('escopo por papel', () => {
    /** O teste que mais importa deste arquivo. */
    it('o nutricionista lê o mesmo exame sem os marcadores hormonais', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/${exameId}`))
        .set(comToken(tokenNutri))
        .expect(200);

      const marcadores = r.body.resultados.map((m: { marcador: string }) => m.marcador);

      expect(marcadores).toContain('VITAMINA_D');
      expect(marcadores).toContain('FERRITINA');
      expect(marcadores).toContain('TFG_ESTIMADA');
      expect(marcadores).not.toContain('TSH');
      expect(marcadores).not.toContain('PROLACTINA');
      expect(marcadores).toHaveLength(4);
    });

    it('a contagem do nutricionista fecha com o que ele vê, não com o total', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/${exameId}`))
        .set(comToken(tokenNutri))
        .expect(200);

      const soma = Object.values(r.body.contagem as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      expect(soma).toBe(4);
    });

    it('o aluno vê o próprio exame inteiro', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/${exameId}`))
        .set(comToken(tokenAluno))
        .expect(200);

      expect(r.body.resultados).toHaveLength(6);
    });

    /** A regra dura: o personal não abre a rota, mesmo com vínculo e consentimento. */
    it('o personal é barrado mesmo com vínculo ativo e consentimento vigente', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenPersonal))
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('o nutricionista não registra marcador fora do escopo dele', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenNutri))
        .send({
          ...corpoCompleto,
          resultados: [{ marcador: 'TSH', valor: 2.1 }],
        })
        .expect(403);

      expect(r.body.erro.mensagem).toMatch(/TSH/);
    });

    it('mas registra normalmente o que é do escopo dele', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenNutri))
        .send({
          ...corpoCompleto,
          laboratorio: `Lab nutri ${sufixo}`,
          resultados: [
            { marcador: 'VITAMINA_B12', valor: 320 },
            { marcador: 'FERRITINA', valor: 22 },
          ],
        })
        .expect(201);

      const porMarcador = Object.fromEntries(
        r.body.resultados.map((m: { marcador: string; classificacao: string }) => [
          m.marcador,
          m.classificacao,
        ]),
      );
      // 320 pg/mL: dentro do laudo (>200), abaixo do funcional (>400).
      expect(porMarcador.VITAMINA_B12).toBe('ATENCAO');
      // Ferritina 22 para mulher: abaixo do mínimo do laudo (15)? Não — dentro,
      // mas longe do funcional (50).
      expect(porMarcador.FERRITINA).toBe('ATENCAO');
    });
  });

  describe('validação e isolamento', () => {
    // 422 e não 400: é o código que o ZodValidationPipe do app usa para corpo
    // sintaticamente válido e semanticamente recusado.
    it('recusa marcador que não existe na tabela', async () => {
      await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenMedico))
        .send({ ...corpoCompleto, resultados: [{ marcador: 'COLESTEROL_MAGICO', valor: 1 }] })
        .expect(422);
    });

    it('recusa exame sem nenhum resultado', async () => {
      await request(servidor)
        .post(url(`/alunos/${alunoId}/exames`))
        .set(comToken(tokenMedico))
        .send({ ...corpoCompleto, resultados: [] })
        .expect(422);
    });

    it('exame de id inventado é 404, não 200 vazio', async () => {
      await request(servidor)
        .get(url(`/alunos/${alunoId}/exames/cln00000000000000000000`))
        .set(comToken(tokenMedico))
        .expect(404);
    });

    it('não devolve exame de um aluno pelo caminho de outro', async () => {
      const outro = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@exemplo.com' },
      });

      await request(servidor)
        .get(url(`/alunos/${outro.id}/exames/${exameId}`))
        .set(comToken(tokenMedico))
        .expect(404);
    });
  });
});
