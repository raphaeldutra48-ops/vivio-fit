import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { AguaService } from '../src/modules/nutricao/agua.service';

describe('Nutrição (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agua: AguaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenNutri: string;
  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idPlano: string;
  let idItemFrango: string;

  const alimentos: Record<string, string> = {};

  const url = (c: string) => `/api/v1${c}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    agua = app.get(AguaService);
    servidor = app.getHttpServer();

    const entrar = async (email: string) =>
      (await request(servidor).post(url('/auth/login')).send({ email, senha })).body.accessToken;
    tokenNutri = await entrar('nutri@viviofit.com.br');
    tokenPersonal = await entrar('personal@viviofit.com.br');

    const email = `nutricao.${sufixo}@exemplo.com`;
    const registro = await request(servidor)
      .post(url('/auth/registrar/aluno'))
      .send({ nome: 'Aluno Nutrição', email, senha, dataNascimento: '1993-09-20' })
      .expect(201);
    tokenAluno = registro.body.accessToken;
    idAluno = registro.body.usuario.id;

    // Vínculo com a nutricionista E com o personal, para provar que ler é
    // permitido aos dois, mas escrever a dieta não.
    for (const token of [tokenNutri, tokenPersonal]) {
      const convite = await request(servidor)
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${token}`)
        .send({ email })
        .expect(201);
      await request(servidor)
        .patch(url(`/vinculos/${convite.body.id}/aceitar`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);
    }
    await request(servidor)
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ escopo: 'NUTRICAO' })
      .expect(201);

    for (const nome of [
      'Peito de frango grelhado',
      'Arroz branco cozido',
      'Feijão carioca cozido',
      'Azeite de oliva',
      'Tilápia grelhada',
    ]) {
      const a = await prisma.alimento.findFirstOrThrow({ where: { nome } });
      alimentos[nome] = a.id;
    }
  });

  afterAll(async () => {
    await prisma.registroAgua.deleteMany({ where: { alunoId: idAluno } });
    await prisma.metaAgua.deleteMany({ where: { alunoId: idAluno } });
    await prisma.registroRefeicao.deleteMany({ where: { alunoId: idAluno } });
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

  describe('montagem da dieta', () => {
    it('calcula os macros a partir da tabela, não de um número digitado', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: 'Plano de teste',
          kcalAlvo: 2200,
          ativar: true,
          refeicoes: [
            {
              nome: 'Almoço',
              horarioSugerido: '12:00',
              itens: [
                { alimentoId: alimentos['Peito de frango grelhado'], quantidadeG: 150 },
                { alimentoId: alimentos['Arroz branco cozido'], quantidadeG: 200 },
                { alimentoId: alimentos['Feijão carioca cozido'], quantidadeG: 80 },
              ],
            },
          ],
        })
        .expect(201);

      idPlano = r.body.id;
      idItemFrango = r.body.refeicoes[0].itens[0].id;

      // frango 150g: 159 * 1.5 = 238.5 kcal | 32 * 1.5 = 48 g proteína
      const frango = r.body.refeicoes[0].itens[0];
      expect(frango.macros.kcal).toBe(238.5);
      expect(frango.macros.proteinaG).toBe(48);

      // arroz 200g: 128*2 = 256 | feijão 80g: 76*0.8 = 60.8
      // total do almoço: 238.5 + 256 + 60.8 = 555.3
      expect(r.body.refeicoes[0].macros.kcal).toBe(555.3);
    });

    /** Critério de aceite da Fase 2: o total exibido bate com a soma dos itens. */
    it('o total da dieta é a soma exata das refeições', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/planos-dieta/ativo`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const somaDasRefeicoes = r.body.refeicoes.reduce(
        (soma: number, ref: { macros: { kcal: number } }) => soma + ref.macros.kcal,
        0,
      );
      expect(Math.abs(r.body.macrosTotais.kcal - somaDasRefeicoes)).toBeLessThanOrEqual(1);
      expect(r.body.macrosTotais.kcal).toBe(555.3);
    });

    it('recusa alimento inexistente', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: 'Inválido',
          refeicoes: [
            { nome: 'X', itens: [{ alimentoId: 'cmxxxxxxxxxxxxxxxxxxxxxxx', quantidadeG: 100 }] },
          ],
        })
        .expect(404);
    });

    it('personal LÊ a dieta mas não escreve', async () => {
      await request(servidor)
        .get(url(`/alunos/${idAluno}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          nome: 'Dieta do personal',
          refeicoes: [
            {
              nome: 'X',
              itens: [{ alimentoId: alimentos['Arroz branco cozido'], quantidadeG: 100 }],
            },
          ],
        })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('ajustar a dieta cria versão 2 e arquiva a anterior', async () => {
      const r = await request(servidor)
        .patch(url(`/alunos/${idAluno}/planos-dieta/${idPlano}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: 'Plano de teste (ajustado)',
          refeicoes: [
            {
              nome: 'Almoço',
              itens: [{ alimentoId: alimentos['Peito de frango grelhado'], quantidadeG: 200 }],
            },
          ],
        })
        .expect(200);

      expect(r.body.versao).toBe(2);
      expect(r.body.status).toBe('ATIVO');
      // 159 * 2 = 318
      expect(r.body.macrosTotais.kcal).toBe(318);

      const anterior = await prisma.planoDieta.findUnique({ where: { id: idPlano } });
      expect(anterior?.status).toBe('ARQUIVADO');
    });
  });

  describe('substituições', () => {
    it('sugere equivalente iso-calórico com proteína dentro da tolerância', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/itens-refeicao/${idItemFrango}/substitutos?tolerancia=0.3`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
      const sugestao = r.body[0];

      // 150g de frango = 238.5 kcal. A quantidade sugerida entrega o mesmo.
      expect(Math.abs(sugestao.macros.kcal - 238.5)).toBeLessThanOrEqual(1);
      expect(Math.abs(sugestao.desvioProteina)).toBeLessThanOrEqual(0.3);
    });

    /** Trocar frango por arroz bate caloria e destrói a dieta — tem que ficar de fora. */
    it('tolerância apertada exclui equivalentes com proteína muito diferente', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/itens-refeicao/${idItemFrango}/substitutos?tolerancia=0.02`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      for (const sugestao of r.body) {
        expect(Math.abs(sugestao.desvioProteina)).toBeLessThanOrEqual(0.02);
      }
    });
  });

  describe('água', () => {
    it('acumula o consumo do dia e calcula o percentual', async () => {
      await request(servidor)
        .put(url(`/alunos/${idAluno}/agua/meta`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ metaMlDia: 2000, horaInicio: 7, horaFim: 22 })
        .expect(200);

      await request(servidor)
        .post(url(`/alunos/${idAluno}/agua`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ volumeMl: 500 })
        .expect(201);

      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/agua`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ volumeMl: 300 })
        .expect(201);

      expect(r.body.consumidoMl).toBe(800);
      expect(r.body.percentual).toBe(40);
      expect(r.body.minutosDesdeUltimoRegistro).toBe(0);
    });

    it('o nutricionista lê o consumo mas quem registra é o aluno', async () => {
      await request(servidor)
        .get(url(`/alunos/${idAluno}/agua`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      await request(servidor)
        .post(url(`/alunos/${idAluno}/agua`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ volumeMl: 200 })
        .expect(403);
    });
  });

  describe('lembrete inteligente de água', () => {
    const agora = new Date();

    it('não incomoda fora da janela do aluno', async () => {
      expect(await agua.precisaDeLembrete(idAluno, 3, agora)).toBe(false); // 3h da manhã
      expect(await agua.precisaDeLembrete(idAluno, 23, agora)).toBe(false);
    });

    it('não lembra quem acabou de beber', async () => {
      expect(await agua.precisaDeLembrete(idAluno, 14, agora)).toBe(false);
    });

    it('lembra depois de 3h sem registrar', async () => {
      await prisma.registroAgua.updateMany({
        where: { alunoId: idAluno },
        data: { registradoEm: new Date(agora.getTime() - 4 * 3600_000) },
      });

      expect(await agua.precisaDeLembrete(idAluno, 14, agora)).toBe(true);
    });

    /** Quem já bateu a meta não precisa ser cobrado. */
    it('não lembra quem já bateu a meta', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/agua`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ volumeMl: 1300 })
        .expect(201);

      await prisma.registroAgua.updateMany({
        where: { alunoId: idAluno },
        data: { registradoEm: new Date(agora.getTime() - 5 * 3600_000) },
      });

      const resumo = await agua.resumoDoDia(idAluno, agora, agora);
      expect(resumo.consumidoMl).toBeGreaterThanOrEqual(resumo.metaMlDia);
      expect(await agua.precisaDeLembrete(idAluno, 14, agora)).toBe(false);
    });
  });

  describe('registro de refeição', () => {
    it('marca como feita e corrige depois', async () => {
      const plano = await request(servidor)
        .get(url(`/alunos/${idAluno}/planos-dieta/ativo`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);
      const refeicaoId = plano.body.refeicoes[0].id;

      await request(servidor)
        .post(url(`/alunos/${idAluno}/registros-refeicao`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ refeicaoId, status: 'FEITA' })
        .expect(201);

      const correcao = await request(servidor)
        .post(url(`/alunos/${idAluno}/registros-refeicao`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ refeicaoId, status: 'PARCIAL', comentario: 'Comi metade' })
        .expect(201);
      expect(correcao.body.status).toBe('PARCIAL');

      const lista = await request(servidor)
        .get(url(`/alunos/${idAluno}/registros-refeicao`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);
      expect(lista.body).toHaveLength(1); // corrigiu, não duplicou
    });
  });

  describe('sem consentimento de NUTRICAO', () => {
    it('a nutricionista não vê a dieta de quem não autorizou', async () => {
      const bruno = await prisma.user.findUniqueOrThrow({
        where: { email: 'bruno@exemplo.com' },
      });
      const r = await request(servidor)
        .get(url(`/alunos/${bruno.id}/planos-dieta`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
      expect(r.body.erro.detalhes.escopo).toBe('NUTRICAO');
    });
  });
});
