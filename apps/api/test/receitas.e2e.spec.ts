import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { url } from './apoio';

describe('Receitas e refeições (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenNutri: string;
  let tokenPersonal: string;
  let idArroz: string;
  let idFrango: string;
  let idReceita: string;

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

    // Valores redondos de propósito: deixam a conta conferível de cabeça.
    const arroz = await prisma.alimento.create({
      data: {
        nome: `Arroz de teste ${sufixo}`,
        grupo: 'CEREAIS',
        kcal: 100,
        proteinaG: 2,
        carboidratoG: 20,
        gorduraG: 1,
        fibraG: 1,
      },
    });
    const frango = await prisma.alimento.create({
      data: {
        nome: `Frango de teste ${sufixo}`,
        grupo: 'CARNES',
        kcal: 200,
        proteinaG: 30,
        carboidratoG: 0,
        gorduraG: 8,
        fibraG: 0,
      },
    });
    idArroz = arroz.id;
    idFrango = frango.id;
  });

  afterAll(async () => {
    await prisma.refeicaoSalva.deleteMany({ where: { nome: { contains: sufixo } } });
    await prisma.receita.deleteMany({ where: { nome: { contains: sufixo } } });
    await prisma.alimento.deleteMany({ where: { nome: { contains: sufixo } } });
    await app.close();
  });

  describe('receita', () => {
    it('calcula os macros por porção a partir dos ingredientes', async () => {
      const r = await request(servidor)
        .post(url('/receitas'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Marmita fit ${sufixo}`,
          modoPreparo: 'Cozinhar o arroz, grelhar o frango, dividir em 4 potes.',
          rendePorcoes: 4,
          nomeDaPorcao: '1 pote',
          tempoMinutos: 40,
          ingredientes: [
            { alimentoId: idArroz, quantidadeG: 400 },
            { alimentoId: idFrango, quantidadeG: 400 },
          ],
        })
        .expect(201);

      idReceita = r.body.id;

      // 400 g de arroz = 400 kcal; 400 g de frango = 800 kcal; total 1200.
      expect(r.body.macrosTotais.kcal).toBe(1200);
      expect(r.body.macrosTotais.proteinaG).toBe(128); // 8 + 120
      // Dividido por 4 porções.
      expect(r.body.macrosPorPorcao.kcal).toBe(300);
      expect(r.body.macrosPorPorcao.proteinaG).toBe(32);
      expect(r.body.pesoTotalG).toBe(800);
    });

    it('recusa receita sem ingrediente', async () => {
      await request(servidor)
        .post(url('/receitas'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ nome: `Vazia ${sufixo}`, ingredientes: [] })
        .expect(422);
    });

    it('recusa rendimento zero — seria divisão por zero', async () => {
      await request(servidor)
        .post(url('/receitas'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Zero ${sufixo}`,
          rendePorcoes: 0,
          ingredientes: [{ alimentoId: idArroz, quantidadeG: 100 }],
        })
        .expect(422);
    });

    it('editar recalcula', async () => {
      const r = await request(servidor)
        .patch(url(`/receitas/${idReceita}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Marmita fit ${sufixo}`,
          rendePorcoes: 2,
          ingredientes: [{ alimentoId: idArroz, quantidadeG: 400 }],
        })
        .expect(200);

      expect(r.body.macrosTotais.kcal).toBe(400);
      expect(r.body.macrosPorPorcao.kcal).toBe(200);
      expect(r.body.ingredientes).toHaveLength(1);
    });

    it('o personal não acessa receitas', async () => {
      await request(servidor)
        .get(url('/receitas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
    });
  });

  describe('refeição reutilizável', () => {
    let idRefeicao: string;

    it('soma alimento em gramas com receita em porções', async () => {
      const r = await request(servidor)
        .post(url('/refeicoes'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Almoço padrão ${sufixo}`,
          horarioSugerido: '12:30',
          itens: [
            { receitaId: idReceita, porcoes: 1 },
            { alimentoId: idFrango, quantidadeG: 100 },
          ],
        })
        .expect(201);

      idRefeicao = r.body.id;
      // 1 porção da receita (200 kcal) + 100 g de frango (200 kcal).
      expect(r.body.macrosTotais.kcal).toBe(400);
      expect(r.body.itens[0].ehReceita).toBe(true);
      expect(r.body.itens[1].ehReceita).toBe(false);
    });

    it('recusa item com alimento e receita ao mesmo tempo', async () => {
      await request(servidor)
        .post(url('/refeicoes'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Confusa ${sufixo}`,
          itens: [{ alimentoId: idArroz, receitaId: idReceita, quantidadeG: 100, porcoes: 1 }],
        })
        .expect(422);
    });

    it('recusa alimento sem gramas', async () => {
      await request(servidor)
        .post(url('/refeicoes'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ nome: `Sem qtd ${sufixo}`, itens: [{ alimentoId: idArroz }] })
        .expect(422);
    });

    it('recusa horário fora do formato', async () => {
      await request(servidor)
        .post(url('/refeicoes'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Hora ruim ${sufixo}`,
          horarioSugerido: '25:99',
          itens: [{ alimentoId: idArroz, quantidadeG: 100 }],
        })
        .expect(422);
    });

    /** Receita apagada não some da refeição: o histórico continua legível. */
    it('remover a receita não quebra a refeição que a usa', async () => {
      await request(servidor)
        .delete(url(`/receitas/${idReceita}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(204);

      const r = await request(servidor)
        .get(url('/refeicoes'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      const alvo = r.body.find((x: { id: string }) => x.id === idRefeicao);
      expect(alvo).toBeDefined();
      expect(alvo.macrosTotais.kcal).toBe(400);
    });
  });
});
