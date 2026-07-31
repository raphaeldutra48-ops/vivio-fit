import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

describe('Relatórios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenPersonal: string;
  let idPersonal: string;

  /** Autoriza treino e evolução. */
  let idCompleto: string;
  /** Só treino: evolução e nutrição devem vir null. */
  let idParcial: string;

  async function vincularAluno(
    nome: string,
    email: string,
    escopos: string[],
  ): Promise<{ id: string; token: string }> {
    const registro = await criarAlunoVerificado(servidor, {
      nome,
      email,
      senha,
      dataNascimento: '1990-01-01',
    });

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${registro.accessToken}`)
      .expect(200);

    for (const escopo of escopos) {
      await request(servidor)
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${registro.accessToken}`)
        .send({ escopo })
        .expect(201);
    }

    return { id: registro.usuario.id, token: registro.accessToken };
  }

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
    idPersonal = login.body.usuario.id;

    const completo = await vincularAluno(
      'Aluno Completo',
      `completo.${sufixo}@exemplo.com`,
      ['TREINO', 'EVOLUCAO'],
    );
    idCompleto = completo.id;

    const parcial = await vincularAluno('Aluno Parcial', `parcial.${sufixo}@exemplo.com`, [
      'TREINO',
    ]);
    idParcial = parcial.id;

    // Peso nos dois: só o "completo" autorizou EVOLUCAO, então só ele mostra.
    for (const alunoId of [idCompleto, idParcial]) {
      await prisma.medida.createMany({
        data: [
          {
            alunoId,
            data: new Date(Date.now() - 20 * 86400000),
            pesoKg: 80,
            registradoPorId: alunoId,
          },
          {
            alunoId,
            data: new Date(Date.now() - 2 * 86400000),
            pesoKg: 77.5,
            registradoPorId: alunoId,
          },
        ],
      });
    }
  });

  afterAll(async () => {
    const ids = [idCompleto, idParcial];
    await prisma.medida.deleteMany({ where: { alunoId: { in: ids } } });
    await prisma.consentimento.deleteMany({ where: { alunoId: { in: ids } } });
    await prisma.vinculo.deleteMany({ where: { alunoId: { in: ids } } });
    await prisma.perfilAluno.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: { in: ids } } });
    await prisma.logAuditoria.deleteMany({
      where: { OR: [{ alunoId: { in: ids } }, { atorId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('lista os alunos ativos da carteira', async () => {
    const r = await request(servidor)
      .get(url('/relatorios/carteira?dias=30'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .expect(200);

    expect(r.body.dias).toBe(30);
    const nomes = r.body.linhas.map((l: { nome: string }) => l.nome);
    expect(nomes).toContain('Aluno Completo');
    expect(nomes).toContain('Aluno Parcial');
  });

  /**
   * O teste que justifica o desenho: guard de rota daria tudo ou nada. Aqui o
   * filtro é por linha, e um aluno que não autorizou evolução não tem o peso
   * exposto num relatório agregado.
   */
  it('não mostra peso de quem não autorizou EVOLUCAO, mesmo havendo medida', async () => {
    const r = await request(servidor)
      .get(url('/relatorios/carteira?dias=30'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .expect(200);

    const completo = r.body.linhas.find((l: { alunoId: string }) => l.alunoId === idCompleto);
    const parcial = r.body.linhas.find((l: { alunoId: string }) => l.alunoId === idParcial);

    expect(completo.autorizou.evolucao).toBe(true);
    expect(completo.pesoAtualKg).toBe(77.5);
    expect(completo.variacaoPesoKg).toBe(-2.5);

    // Tem medida no banco, mas não autorizou: null, e não zero.
    expect(parcial.autorizou.evolucao).toBe(false);
    expect(parcial.pesoAtualKg).toBeNull();
    expect(parcial.variacaoPesoKg).toBeNull();
  });

  it('nutrição não autorizada também vem null', async () => {
    const r = await request(servidor)
      .get(url('/relatorios/carteira'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .expect(200);

    for (const linha of r.body.linhas.filter(
      (l: { alunoId: string }) => l.alunoId === idCompleto || l.alunoId === idParcial,
    )) {
      expect(linha.autorizou.nutricao).toBe(false);
      expect(linha.adesaoDietaPercentual).toBeNull();
    }
  });

  it('quem nunca treinou aparece com zero, não com null', async () => {
    const r = await request(servidor)
      .get(url('/relatorios/carteira'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .expect(200);

    const linha = r.body.linhas.find((l: { alunoId: string }) => l.alunoId === idCompleto);
    // Autorizou treino: o número é confiável, e é zero.
    expect(linha.autorizou.treino).toBe(true);
    expect(linha.treinosNoPeriodo).toBe(0);
    expect(linha.ultimoTreinoEm).toBeNull();
  });

  it('a janela de dias é validada', async () => {
    await request(servidor)
      .get(url('/relatorios/carteira?dias=3'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .expect(422);

    await request(servidor)
      .get(url('/relatorios/carteira?dias=9999'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .expect(422);
  });

  it('o aluno não acessa relatório de carteira', async () => {
    const login = await request(servidor)
      .post(url('/auth/login'))
      .send({ email: `completo.${sufixo}@exemplo.com`, senha });

    await request(servidor)
      .get(url('/relatorios/carteira'))
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });

  it('o relatório é do profissional logado, não da base inteira', async () => {
    const login = await request(servidor)
      .post(url('/auth/login'))
      .send({ email: 'nutri@viviofit.com.br', senha });

    const r = await request(servidor)
      .get(url('/relatorios/carteira'))
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    // Os alunos deste teste são do personal; a nutricionista não os vê.
    const ids = r.body.linhas.map((l: { alunoId: string }) => l.alunoId);
    expect(ids).not.toContain(idCompleto);
    expect(ids).not.toContain(idParcial);
    expect(idPersonal).toBeTruthy();
  });
});
