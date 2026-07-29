import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';

describe('Cardápios e lista de compras (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenNutri: string;
  let tokenAluno: string;
  let idAluno: string;
  let idModelo: string;
  const alimentos: Record<string, string> = {};

  const url = (c: string) => `/api/v1${c}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    tokenNutri = (
      await request(servidor)
        .post(url('/auth/login'))
        .send({ email: 'nutri@viviofit.com.br', senha })
    ).body.accessToken;

    const email = `cardapio.${sufixo}@exemplo.com`;
    const registro = await request(servidor)
      .post(url('/auth/registrar/aluno'))
      .send({ nome: 'Paciente Cardápio', email, senha, dataNascimento: '1990-05-05' })
      .expect(201);
    tokenAluno = registro.body.accessToken;
    idAluno = registro.body.usuario.id;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenNutri}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
    await request(servidor)
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ escopo: 'NUTRICAO' })
      .expect(201);

    for (const nome of [
      'Ovo de galinha cozido',
      'Arroz branco cozido',
      'Peito de frango grelhado',
      'Banana prata',
    ]) {
      alimentos[nome] = (await prisma.alimento.findFirstOrThrow({ where: { nome } })).id;
    }
  });

  afterAll(async () => {
    await prisma.modeloCardapio.deleteMany({ where: { nome: { contains: sufixo } } });
    await prisma.planoDieta.deleteMany({ where: { alunoId: idAluno } });
    await prisma.consentimento.deleteMany({ where: { alunoId: idAluno } });
    await prisma.vinculo.deleteMany({ where: { alunoId: idAluno } });
    await prisma.perfilAluno.deleteMany({ where: { userId: idAluno } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idAluno } });
    await prisma.logAuditoria.deleteMany({
      where: { OR: [{ alunoId: idAluno }, { atorId: idAluno }] },
    });
    await prisma.user.deleteMany({ where: { id: idAluno } });
    await app.close();
  });

  describe('modelo de cardápio', () => {
    it('cria o molde e já calcula os macros', async () => {
      const r = await request(servidor)
        .post(url('/cardapios'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Modelo cutting ${sufixo}`,
          descricao: 'Base para pacientes em déficit',
          kcalAlvo: 1800,
          refeicoes: [
            {
              nome: 'Café da manhã',
              horarioSugerido: '07:00',
              itens: [
                { alimentoId: alimentos['Ovo de galinha cozido'], quantidadeG: 100 },
                { alimentoId: alimentos['Banana prata'], quantidadeG: 70 },
              ],
            },
            {
              nome: 'Almoço',
              itens: [
                { alimentoId: alimentos['Peito de frango grelhado'], quantidadeG: 150 },
                { alimentoId: alimentos['Arroz branco cozido'], quantidadeG: 200 },
              ],
            },
          ],
        })
        .expect(201);

      idModelo = r.body.id;
      expect(r.body.totalRefeicoes).toBe(2);
      // ovo 146 + banana 68.6 + frango 238.5 + arroz 256
      expect(r.body.macrosTotais.kcal).toBeCloseTo(709.1, 1);
    });

    it('o molde aparece na lista do nutricionista', async () => {
      const r = await request(servidor)
        .get(url('/cardapios'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body.some((m: { id: string }) => m.id === idModelo)).toBe(true);
    });

    it('aluno não acessa o acervo do nutricionista', async () => {
      await request(servidor)
        .get(url('/cardapios'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(403);
    });
  });

  describe('aplicar no paciente', () => {
    it('gera um plano a partir do molde', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/planos-dieta/do-modelo/${idModelo}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ ativar: true })
        .expect(201);

      expect(r.body.status).toBe('ATIVO');
      expect(r.body.refeicoes).toHaveLength(2);
      expect(r.body.macrosTotais.kcal).toBeCloseTo(709.1, 1);
    });

    /**
     * O molde é um ponto de partida, não um vínculo. Ajustar a dieta do
     * paciente não pode alterar o molde usado em outros.
     */
    it('ajustar o plano do paciente não altera o molde', async () => {
      const planos = await request(servidor)
        .get(url(`/alunos/${idAluno}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);
      const ativo = planos.body.find((p: { status: string }) => p.status === 'ATIVO');

      await request(servidor)
        .patch(url(`/alunos/${idAluno}/planos-dieta/${ativo.id}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: 'Ajustado para o paciente',
          refeicoes: [
            {
              nome: 'Só almoço',
              itens: [{ alimentoId: alimentos['Arroz branco cozido'], quantidadeG: 100 }],
            },
          ],
        })
        .expect(200);

      const modelo = await request(servidor)
        .get(url(`/cardapios/${idModelo}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(modelo.body.totalRefeicoes).toBe(2);
      expect(modelo.body.macrosTotais.kcal).toBeCloseTo(709.1, 1);
    });
  });

  describe('lista de compras', () => {
    beforeAll(async () => {
      // Plano com o mesmo alimento em duas refeições — precisa virar uma linha só.
      await request(servidor)
        .post(url(`/alunos/${idAluno}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Plano compras ${sufixo}`,
          ativar: true,
          refeicoes: [
            {
              nome: 'Café da manhã',
              itens: [{ alimentoId: alimentos['Ovo de galinha cozido'], quantidadeG: 100 }],
            },
            {
              nome: 'Almoço',
              itens: [
                { alimentoId: alimentos['Peito de frango grelhado'], quantidadeG: 150 },
                { alimentoId: alimentos['Arroz branco cozido'], quantidadeG: 200 },
              ],
            },
            {
              nome: 'Jantar',
              itens: [
                { alimentoId: alimentos['Ovo de galinha cozido'], quantidadeG: 50 },
                { alimentoId: alimentos['Arroz branco cozido'], quantidadeG: 100 },
              ],
            },
          ],
        })
        .expect(201);
    });

    it('soma o mesmo alimento de refeições diferentes numa linha só', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/lista-de-compras?dias=1`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const todos = r.body.secoes.flatMap((s: { itens: unknown[] }) => s.itens);
      const ovo = todos.find((i: { nome: string }) => i.nome === 'Ovo de galinha cozido');

      expect(ovo.quantidadeTotalG).toBe(150); // 100 do café + 50 do jantar
      expect(ovo.aparecEm).toEqual(expect.arrayContaining(['Café da manhã', 'Jantar']));
      expect(todos).toHaveLength(3); // ovo, frango, arroz
    });

    it('multiplica pelos dias pedidos', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/lista-de-compras?dias=7`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const todos = r.body.secoes.flatMap((s: { itens: unknown[] }) => s.itens);
      const arroz = todos.find((i: { nome: string }) => i.nome === 'Arroz branco cozido');

      expect(arroz.quantidadeTotalG).toBe(2100); // (200 + 100) × 7
      // Acima de 1 kg o número em gramas deixa de ser legível na gôndola.
      expect(arroz.quantidadeFormatada).toBe('2,10 kg');
    });

    it('agrupa por seção de mercado, não por grupo alimentar', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/lista-de-compras?dias=7`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const secoes = r.body.secoes.map((s: { secao: string }) => s.secao);
      expect(secoes).toContain('Açougue, peixaria e ovos');
      expect(secoes).toContain('Mercearia');
      // A ordem é o caminho do supermercado, não alfabética.
      expect(secoes.indexOf('Açougue, peixaria e ovos')).toBeLessThan(secoes.indexOf('Mercearia'));
    });

    it('converte para medida caseira quando faz sentido', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/lista-de-compras?dias=7`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const todos = r.body.secoes.flatMap((s: { itens: unknown[] }) => s.itens);
      const ovo = todos.find((i: { nome: string }) => i.nome === 'Ovo de galinha cozido');

      // 150 g/dia × 7 = 1050 g. A medida caseira do ovo é "2 unidades" = 100 g,
      // então são 10,5 medidas × 2 = 21 unidades — e não 11, que sairia se o
      // número embutido na medida fosse ignorado.
      expect(ovo.equivalencia).toBe('≈ 21 unidades');
    });

    it('sem plano ativo não há lista', async () => {
      await prisma.planoDieta.updateMany({
        where: { alunoId: idAluno, status: 'ATIVO' },
        data: { status: 'ARQUIVADO' },
      });

      await request(servidor)
        .get(url(`/alunos/${idAluno}/lista-de-compras`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(404);
    });
  });
});
