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
 * A outra metade do diferencial. O que este arquivo protege:
 *
 * 1. Condição **se lê** pelos três profissionais — ao contrário do exame. Um
 *    personal que não sabe da lesão no ombro prescreve desenvolvimento militar.
 * 2. Condição **só o médico escreve**: diagnosticar não é papel de quem
 *    prescreve treino ou dieta.
 * 3. Registrar dispara alerta específico por região; resolver retira o alerta.
 */
describe('Condições de saúde e alertas derivados (e2e)', () => {
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
  let condicaoId: string;

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

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Paciente de Condição',
      email: `condicao.${sufixo}@teste.com`,
      senha,
      dataNascimento: '1990-02-20',
    });
    alunoId = aluno.usuario.id;
    tokenAluno = aluno.accessToken;

    for (const [email, tipo] of [
      ['medico@viviofit.com.br', Papel.MEDICO],
      ['nutri@viviofit.com.br', Papel.NUTRICIONISTA],
      ['personal@viviofit.com.br', Papel.PERSONAL],
    ] as const) {
      const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.vinculo.create({
        data: {
          alunoId,
          profissionalId: id,
          tipo,
          status: StatusVinculo.ATIVO,
          convidadoPorId: id,
          iniciadoEm: new Date(),
        },
      });
    }

    await prisma.consentimento.create({
      data: {
        alunoId,
        escopo: EscopoDado.CLINICO,
        finalidade: 'Registro de condições de saúde',
        versaoTermo: '2026-07-v1',
      },
    });
  });

  afterAll(async () => {
    await prisma.alertaClinico.deleteMany({ where: { alunoId } });
    await prisma.condicaoSaude.deleteMany({ where: { alunoId } });
    await prisma.consentimento.deleteMany({ where: { alunoId } });
    await prisma.vinculo.deleteMany({ where: { alunoId } });
    await prisma.user.deleteMany({ where: { id: alunoId } });
    await app.close();
  });

  const comToken = (t: string) => ({ Authorization: `Bearer ${t}` });

  const alertasDe = async (token: string) =>
    (await request(servidor).get(url(`/alunos/${alunoId}/alertas`)).set(comToken(token)).expect(200))
      .body;

  describe('quem escreve', () => {
    it('o médico registra a lesão', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${alunoId}/condicoes`))
        .set(comToken(tokenMedico))
        .send({
          tipo: 'LESAO',
          descricao: 'Tendinopatia do supraespinhal à direita',
          regiao: 'OMBRO',
          gravidade: 'MODERADA',
        })
        .expect(201);

      condicaoId = r.body.id;
      expect(r.body.regiao).toBe('OMBRO');
      expect(r.body.resolvidaEm).toBeNull();
    });

    /** Diagnosticar não é papel de quem prescreve treino ou dieta. */
    it('personal e nutricionista não registram condição', async () => {
      for (const token of [tokenPersonal, tokenNutri]) {
        const r = await request(servidor)
          .post(url(`/alunos/${alunoId}/condicoes`))
          .set(comToken(token))
          .send({ tipo: 'LESAO', descricao: 'Dor no joelho', regiao: 'JOELHO' })
          .expect(403);

        expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
      }
    });

    it('nem o próprio aluno registra a condição dele', async () => {
      await request(servidor)
        .post(url(`/alunos/${alunoId}/condicoes`))
        .set(comToken(tokenAluno))
        .send({ tipo: 'LESAO', descricao: 'Dor no joelho', regiao: 'JOELHO' })
        .expect(403);
    });

    /** A região é o que diz ao personal o que evitar; sem ela não há alerta útil. */
    it('lesão sem região é recusada pelo schema', async () => {
      await request(servidor)
        .post(url(`/alunos/${alunoId}/condicoes`))
        .set(comToken(tokenMedico))
        .send({ tipo: 'LESAO', descricao: 'Dor difusa' })
        .expect(422);
    });
  });

  describe('quem lê', () => {
    /** A diferença central em relação ao exame. */
    it('os três profissionais leem a condição', async () => {
      for (const token of [tokenMedico, tokenNutri, tokenPersonal]) {
        const r = await request(servidor)
          .get(url(`/alunos/${alunoId}/condicoes`))
          .set(comToken(token))
          .expect(200);

        expect(r.body.map((c: { id: string }) => c.id)).toContain(condicaoId);
      }
    });

    it('o aluno lê as próprias condições', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/condicoes`))
        .set(comToken(tokenAluno))
        .expect(200);

      expect(r.body).toHaveLength(1);
    });
  });

  describe('alertas derivados', () => {
    it('o personal recebe orientação específica do ombro', async () => {
      const alertas = await alertasDe(tokenPersonal);
      const doOmbro = alertas.find((a: { titulo: string }) => a.titulo.includes('ombro'));

      expect(doOmbro).toBeTruthy();
      expect(doOmbro.orientacao).toMatch(/acima da cabeça/);
      expect(doOmbro.condicaoId).toBe(condicaoId);
    });

    /** Condição é legível pelos três, então rastrear até ela não é privilégio. */
    it('o alerta de condição traz a origem mesmo para o personal', async () => {
      const alertas = await alertasDe(tokenPersonal);
      const deCondicao = alertas.filter((a: { condicaoId: string | null }) => a.condicaoId);

      expect(deCondicao.length).toBeGreaterThan(0);
      for (const a of deCondicao) expect(a.marcadorOrigem).toBeNull();
    });

    it('o nutricionista não recebe alerta de lesão — não é conduta dele', async () => {
      const alertas = await alertasDe(tokenNutri);
      expect(alertas.filter((a: { condicaoId: string | null }) => a.condicaoId)).toHaveLength(0);
    });

    it('alergia alimentar avisa nutricionista e personal', async () => {
      await request(servidor)
        .post(url(`/alunos/${alunoId}/condicoes`))
        .set(comToken(tokenMedico))
        .send({
          tipo: 'ALERGIA_ALIMENTAR',
          descricao: 'Alergia a amendoim',
          gravidade: 'GRAVE',
        })
        .expect(201);

      const doNutri = await alertasDe(tokenNutri);
      expect(doNutri.some((a: { titulo: string }) => a.titulo.includes('Alergia'))).toBe(true);

      const doPersonal = await alertasDe(tokenPersonal);
      const suplemento = doPersonal.find((a: { titulo: string }) => a.titulo.includes('suplemento'));
      expect(suplemento.severidade).toBe('ALTA');
    });
  });

  describe('resolver', () => {
    it('dar alta retira o alerta que a condição gerava', async () => {
      const antes = (await alertasDe(tokenPersonal)).filter(
        (a: { condicaoId: string | null }) => a.condicaoId === condicaoId,
      );
      expect(antes.length).toBeGreaterThan(0);

      const r = await request(servidor)
        .patch(url(`/alunos/${alunoId}/condicoes/${condicaoId}/resolver`))
        .set(comToken(tokenMedico))
        .send({ observacao: 'Alta após fisioterapia' })
        .expect(200);

      expect(r.body.resolvidaEm).not.toBeNull();
      expect(r.body.resolvidaPor.nome).toBeTruthy();

      const depois = (await alertasDe(tokenPersonal)).filter(
        (a: { condicaoId: string | null }) => a.condicaoId === condicaoId,
      );
      expect(depois).toHaveLength(0);
    });

    /** Histórico de lesão muda a conduta mesmo depois da alta. */
    it('a condição resolvida continua na lista, não some', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${alunoId}/condicoes`))
        .set(comToken(tokenPersonal))
        .expect(200);

      const resolvida = r.body.find((c: { id: string }) => c.id === condicaoId);
      expect(resolvida).toBeTruthy();
      expect(resolvida.resolvidaEm).not.toBeNull();
      expect(resolvida.observacao).toMatch(/fisioterapia/);
    });

    it('resolver duas vezes é conflito, não silêncio', async () => {
      await request(servidor)
        .patch(url(`/alunos/${alunoId}/condicoes/${condicaoId}/resolver`))
        .set(comToken(tokenMedico))
        .send({})
        .expect(409);
    });

    it('personal não dá alta em condição', async () => {
      await request(servidor)
        .patch(url(`/alunos/${alunoId}/condicoes/${condicaoId}/resolver`))
        .set(comToken(tokenPersonal))
        .send({})
        .expect(403);
    });
  });
});
