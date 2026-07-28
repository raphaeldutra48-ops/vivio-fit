import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';

describe('Exercícios e planos de treino (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);

  let tokenPersonal: string;
  let tokenNutri: string;
  let tokenAna: string;
  let tokenAdmin: string;
  let idAna: string;
  let idBruno: string;
  let idPersonal: string;

  let idSupino: string;
  let idAgachamento: string;
  let idExercicioPrivadoDaNutri: string;
  let idPlano: string;

  const url = (c: string) => `/api/v1${c}`;

  async function logar(email: string): Promise<string> {
    const r = await request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha });
    if (!r.body.accessToken) throw new Error(`Login falhou: ${email}`);
    return r.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);

    [tokenPersonal, tokenNutri, tokenAna, tokenAdmin] = await Promise.all([
      logar('personal@viviofit.com.br'),
      logar('nutri@viviofit.com.br'),
      logar('ana@exemplo.com'),
      logar('admin@viviofit.com.br'),
    ]);

    const users = await prisma.user.findMany({
      where: {
        email: { in: ['ana@exemplo.com', 'bruno@exemplo.com', 'personal@viviofit.com.br'] },
      },
      select: { id: true, email: true },
    });
    idAna = users.find((u) => u.email === 'ana@exemplo.com')!.id;
    idBruno = users.find((u) => u.email === 'bruno@exemplo.com')!.id;
    idPersonal = users.find((u) => u.email === 'personal@viviofit.com.br')!.id;

    const supino = await prisma.exercicio.findFirst({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });
    const agacha = await prisma.exercicio.findFirst({
      where: { nome: 'Agachamento livre', escopo: 'GLOBAL' },
    });
    idSupino = supino!.id;
    idAgachamento = agacha!.id;
  });

  afterAll(async () => {
    // Apaga só o que ESTE teste criou (o plano e suas versões). Apagar tudo do
    // aluno destruiria dados de outros testes e do ambiente de desenvolvimento.
    await prisma.planoTreino.deleteMany({
      where: { OR: [{ id: idPlano }, { raizId: idPlano }] },
    });
    await prisma.exercicio.deleteMany({ where: { nome: { contains: sufixo } } });
    await app.close();
  });

  describe('biblioteca de exercícios', () => {
    it('lista a biblioteca global', async () => {
      const r = await request(app.getHttpServer())
        .get(url('/exercicios'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThanOrEqual(20);
      expect(r.body.every((e: { escopo: string }) => e.escopo === 'GLOBAL')).toBe(true);
    });

    it('filtra por grupo muscular', async () => {
      const r = await request(app.getHttpServer())
        .get(url('/exercicios?grupoMuscular=PEITO'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body.every((e: { grupoMuscular: string }) => e.grupoMuscular === 'PEITO')).toBe(true);
    });

    it('busca por nome, ignorando maiúsculas', async () => {
      const r = await request(app.getHttpServer())
        .get(url('/exercicios?q=SUPINO'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
    });

    it('personal cria exercício PRIVADO', async () => {
      const r = await request(app.getHttpServer())
        .post(url('/exercicios'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          nome: `Agachamento búlgaro ${sufixo}`,
          grupoMuscular: 'PERNA',
          equipamento: 'Halteres',
        })
        .expect(201);

      expect(r.body.escopo).toBe('PRIVADO');
      expect(r.body.criadoPorId).toBe(idPersonal);
    });

    it('admin cria exercício GLOBAL', async () => {
      const r = await request(app.getHttpServer())
        .post(url('/exercicios'))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nome: `Farmer walk ${sufixo}`, grupoMuscular: 'CORPO_INTEIRO' })
        .expect(201);

      expect(r.body.escopo).toBe('GLOBAL');
    });

    it('um profissional NÃO vê a biblioteca privada do outro', async () => {
      const criado = await request(app.getHttpServer())
        .post(url('/exercicios'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ nome: `Exercicio secreto ${sufixo}`, grupoMuscular: 'ABDOMEN' })
        .expect(201);
      idExercicioPrivadoDaNutri = criado.body.id;

      const lista = await request(app.getHttpServer())
        .get(url(`/exercicios?q=secreto`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
      expect(lista.body).toHaveLength(0);

      await request(app.getHttpServer())
        .get(url(`/exercicios/${idExercicioPrivadoDaNutri}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(404);
    });

    it('personal não edita exercício da biblioteca global', async () => {
      const r = await request(app.getHttpServer())
        .patch(url(`/exercicios/${idSupino}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ nome: 'Nome alterado' })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('aluno não cria exercício', async () => {
      await request(app.getHttpServer())
        .post(url('/exercicios'))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({ nome: `Meu exercicio ${sufixo}`, grupoMuscular: 'PEITO' })
        .expect(403);
    });
  });

  describe('montagem do plano', () => {
    const corpoDoPlano = () => ({
      nome: 'Hipertrofia — 3x semana',
      objetivo: 'Ganho de massa',
      ativar: true,
      sessoes: [
        {
          nome: 'Treino A — Superior',
          diaSugerido: 1,
          itens: [
            { exercicioId: idSupino, series: 4, repsAlvo: '8-12', cargaSugeridaKg: 40, descansoSeg: 90 },
          ],
        },
        {
          nome: 'Treino B — Inferior',
          diaSugerido: 3,
          itens: [
            { exercicioId: idAgachamento, series: 4, repsAlvo: '10', cargaSugeridaKg: 50, descansoSeg: 120 },
          ],
        },
      ],
    });

    it('personal monta o plano da Ana e ativa', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/planos-treino`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send(corpoDoPlano())
        .expect(201);

      expect(r.body.status).toBe('ATIVO');
      expect(r.body.versao).toBe(1);
      expect(r.body.sessoes).toHaveLength(2);
      expect(r.body.sessoes[0].itens[0].exercicio.nome).toBe('Supino reto com barra');
      expect(r.body.sessoes[0].itens[0].cargaSugeridaKg).toBe(40);
      idPlano = r.body.id;
    });

    it('recusa plano com exercício privado de outro profissional', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/planos-treino`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          nome: 'Plano inválido',
          sessoes: [
            { nome: 'A', itens: [{ exercicioId: idExercicioPrivadoDaNutri, series: 3, repsAlvo: '10' }] },
          ],
        })
        .expect(404);

      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('aluno lê o próprio plano ativo (payload de cache offline)', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/planos-treino/ativo`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body.sessoes).toHaveLength(2);
      // O payload precisa trazer o exercício completo, não só o id — offline
      // não há como buscar depois.
      expect(r.body.sessoes[0].itens[0].exercicio.instrucoes).toBeTruthy();
    });

    it('nutricionista lê o plano (consentimento TREINO da Ana), mas não escreve', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/planos-treino`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/planos-treino`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send(corpoDoPlano())
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('Bruno sem consentimento: personal não monta plano para ele', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/planos-treino`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
      expect(r.body.erro.detalhes.escopo).toBe('TREINO');
    });
  });

  describe('versionamento', () => {
    it('ajustar o plano cria a versão 2 e arquiva a 1', async () => {
      const r = await request(app.getHttpServer())
        .patch(url(`/alunos/${idAna}/planos-treino/${idPlano}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          nome: 'Hipertrofia — 3x semana (ajustado)',
          sessoes: [
            {
              nome: 'Treino A — Superior',
              itens: [
                // carga subiu de 40 para 45
                { exercicioId: idSupino, series: 4, repsAlvo: '8-12', cargaSugeridaKg: 45 },
              ],
            },
          ],
        })
        .expect(200);

      expect(r.body.versao).toBe(2);
      expect(r.body.status).toBe('ATIVO');
      expect(r.body.sessoes[0].itens[0].cargaSugeridaKg).toBe(45);

      const anterior = await prisma.planoTreino.findUnique({ where: { id: idPlano } });
      expect(anterior?.status).toBe('ARQUIVADO');
      expect(anterior?.fimEm).not.toBeNull();
    });

    it('a versão 1 continua legível com a carga original', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/planos-treino/${idPlano}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.versao).toBe(1);
      expect(r.body.sessoes[0].itens[0].cargaSugeridaKg).toBe(40);
    });

    it('as duas versões compartilham a mesma raiz', async () => {
      const versoes = await prisma.planoTreino.findMany({
        where: { alunoId: idAna, OR: [{ id: idPlano }, { raizId: idPlano }] },
        orderBy: { versao: 'asc' },
      });

      expect(versoes).toHaveLength(2);
      expect(versoes[1]!.raizId).toBe(idPlano);
    });

    it('só existe um plano ATIVO por aluno', async () => {
      const ativos = await prisma.planoTreino.count({
        where: { alunoId: idAna, status: 'ATIVO' },
      });
      expect(ativos).toBe(1);
    });
  });
});
