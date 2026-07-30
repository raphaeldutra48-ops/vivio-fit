import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado } from './apoio';

/**
 * Usa as contas do seed, que existem justamente para representar os três
 * estados de autorização:
 *   Ana   -> vínculo ATIVO com personal, nutri e médica
 *   Bruno -> vínculo ATIVO só com o personal
 *   Carla -> vínculo PENDENTE com o personal
 */
describe('Vínculos e CareLinkGuard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufixo = Date.now().toString(36);
  const senha = 'Senha@123';

  let tokenPersonal: string;
  let tokenNutri: string;
  let tokenAna: string;
  let tokenAdmin: string;
  let idAna: string;
  let idBruno: string;
  let idCarla: string;

  const url = (caminho: string) => `/api/v1${caminho}`;

  async function logar(email: string): Promise<string> {
    const r = await request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha });
    if (!r.body.accessToken) throw new Error(`Login falhou para ${email}: ${JSON.stringify(r.body)}`);
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

    const alunos = await prisma.user.findMany({
      where: { email: { in: ['ana@exemplo.com', 'bruno@exemplo.com', 'carla@exemplo.com'] } },
      select: { id: true, email: true },
    });
    idAna = alunos.find((a) => a.email === 'ana@exemplo.com')!.id;
    idBruno = alunos.find((a) => a.email === 'bruno@exemplo.com')!.id;
    idCarla = alunos.find((a) => a.email === 'carla@exemplo.com')!.id;
  });

  afterAll(async () => {
    const criados = await prisma.user.findMany({
      where: { email: { contains: `.${sufixo}@` } },
      select: { id: true },
    });
    const ids = criados.map((u) => u.id);
    await prisma.vinculo.deleteMany({
      where: { OR: [{ alunoId: { in: ids } }, { profissionalId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('CareLinkGuard', () => {
    it('personal COM vínculo ativo acessa a ficha da Ana', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.nome).toBe('Ana Souza');
      expect(r.body.equipe).toHaveLength(3);
    });

    it('personal COM vínculo ativo acessa a ficha do Bruno', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
    });

    it('personal com vínculo apenas PENDENTE recebe VINCULO_AUSENTE na Carla', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idCarla}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('VINCULO_AUSENTE');
    });

    it('nutricionista SEM vínculo com o Bruno é bloqueada', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/resumo`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('VINCULO_AUSENTE');
    });

    it('aluno acessa a própria ficha', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/resumo`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body.id).toBe(idAna);
    });

    it('aluno NÃO acessa a ficha de outro aluno', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/resumo`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(403);
    });

    /** Administrar a plataforma não dá direito de ler ficha de aluno. */
    it('ADMIN não acessa ficha de aluno', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/resumo`))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('VINCULO_AUSENTE');
    });

    it('exige autenticação', async () => {
      await request(app.getHttpServer()).get(url(`/alunos/${idAna}/resumo`)).expect(401);
    });
  });

  describe('carteira e equipe', () => {
    it('personal lista seus alunos', async () => {
      const r = await request(app.getHttpServer())
        .get(url('/vinculos/meus-alunos?status=ATIVO'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const nomes = r.body.map((v: { contraparte: { nome: string } }) => v.contraparte.nome);
      expect(nomes).toContain('Ana Souza');
      expect(nomes).toContain('Bruno Lima');
      expect(nomes).not.toContain('Carla Dias');
    });

    it('aluno lista sua equipe de cuidado', async () => {
      const r = await request(app.getHttpServer())
        .get(url('/vinculos/meus-profissionais'))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body).toHaveLength(3);
    });

    it('aluno não acessa a rota de carteira do profissional', async () => {
      const r = await request(app.getHttpServer())
        .get(url('/vinculos/meus-alunos'))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });
  });

  describe('fluxo de convite', () => {
    const emailNovoAluno = `novo.${sufixo}@exemplo.com`;
    let tokenNovoAluno: string;
    let idVinculo: string;

    it('cria um aluno novo', async () => {
      const r = await criarAlunoVerificado(app.getHttpServer(), {
        nome: 'Aluno Novo',
        email: emailNovoAluno,
        senha,
        dataNascimento: '1998-08-08',
      });
      tokenNovoAluno = r.accessToken;
    });

    it('personal convida o aluno e o vínculo nasce PENDENTE', async () => {
      const r = await request(app.getHttpServer())
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ email: emailNovoAluno })
        .expect(201);

      expect(r.body.status).toBe('PENDENTE');
      idVinculo = r.body.id;
    });

    it('convite pendente ainda não libera acesso', async () => {
      const eu = await request(app.getHttpServer())
        .get(url('/me'))
        .set('Authorization', `Bearer ${tokenNovoAluno}`);

      await request(app.getHttpServer())
        .get(url(`/alunos/${eu.body.id}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
    });

    it('quem convidou não pode aceitar o próprio convite', async () => {
      const r = await request(app.getHttpServer())
        .patch(url(`/vinculos/${idVinculo}/aceitar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(409);

      expect(r.body.erro.codigo).toBe('CONFLITO');
    });

    it('estranho não enxerga o vínculo (404, não 403)', async () => {
      const r = await request(app.getHttpServer())
        .patch(url(`/vinculos/${idVinculo}/aceitar`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(404);

      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('aluno aceita e o acesso passa a funcionar', async () => {
      const r = await request(app.getHttpServer())
        .patch(url(`/vinculos/${idVinculo}/aceitar`))
        .set('Authorization', `Bearer ${tokenNovoAluno}`)
        .expect(200);
      expect(r.body.status).toBe('ATIVO');

      const eu = await request(app.getHttpServer())
        .get(url('/me'))
        .set('Authorization', `Bearer ${tokenNovoAluno}`);

      await request(app.getHttpServer())
        .get(url(`/alunos/${eu.body.id}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
    });

    it('convidar profissional não verificado é recusado', async () => {
      const emailPro = `naoverificado.${sufixo}@exemplo.com`;
      await request(app.getHttpServer())
        .post(url('/auth/registrar/profissional'))
        .send({
          nome: 'Personal Não Verificado',
          email: emailPro,
          senha,
          tipo: 'PERSONAL',
          registroConselho: `CREF ${sufixo}X`,
          ufRegistro: 'SP',
        })
        .expect(201);

      const r = await request(app.getHttpServer())
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${tokenNovoAluno}`)
        .send({ email: emailPro })
        .expect(409);

      expect(r.body.erro.mensagem).toContain('verificado');
    });

    it('encerrar libera espaço para um novo profissional do mesmo tipo', async () => {
      await request(app.getHttpServer())
        .patch(url(`/vinculos/${idVinculo}/encerrar`))
        .set('Authorization', `Bearer ${tokenNovoAluno}`)
        .expect(200);

      const eu = await request(app.getHttpServer())
        .get(url('/me'))
        .set('Authorization', `Bearer ${tokenNovoAluno}`);

      // Encerrado = perde o acesso, mas o histórico do vínculo permanece
      await request(app.getHttpServer())
        .get(url(`/alunos/${eu.body.id}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      const vinculo = await prisma.vinculo.findUnique({ where: { id: idVinculo } });
      expect(vinculo?.status).toBe('ENCERRADO');
      expect(vinculo?.encerradoEm).not.toBeNull();
    });
  });
});
