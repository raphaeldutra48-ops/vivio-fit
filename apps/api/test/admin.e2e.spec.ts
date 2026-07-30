import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarContaVerificada, url } from './apoio';

describe('Admin — verificação de profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailPro = `pendente.${sufixo}@exemplo.com`;
  const emailAluno = `aluno.admin.${sufixo}@exemplo.com`;

  let tokenAdmin: string;
  let tokenPersonal: string;
  let tokenPro: string;
  let idPro: string;

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
    tokenAdmin = await entrar('admin@viviofit.com.br');
    tokenPersonal = await entrar('personal@viviofit.com.br');

    // Profissional novo: confirma o e-mail, mas ninguém verificou o conselho.
    const sessao = await criarContaVerificada(servidor, '/auth/registrar/profissional', {
      nome: 'Pendente da Silva',
      email: emailPro,
      senha,
      tipo: 'NUTRICIONISTA',
      registroConselho: `CRN ${sufixo}`,
      ufRegistro: 'CE',
    });
    tokenPro = sessao.accessToken;
    idPro = sessao.usuario.id;

    // O convite exige que o aluno já tenha conta — sem isto o teste devolveria
    // 404 e passaria pelo motivo errado, sem provar nada sobre verificação.
    await criarContaVerificada(servidor, '/auth/registrar/aluno', {
      nome: 'Aluno do Admin',
      email: emailAluno,
      senha,
      dataNascimento: '1994-02-02',
    });
  });

  afterAll(async () => {
    const ids = (
      await prisma.user.findMany({
        where: { email: { in: [emailPro, emailAluno] } },
        select: { id: true },
      })
    ).map((u) => u.id);

    await prisma.vinculo.deleteMany({
      where: { OR: [{ profissionalId: { in: ids } }, { alunoId: { in: ids } }] },
    });
    await prisma.perfilProfissional.deleteMany({ where: { userId: { in: ids } } });
    await prisma.perfilAluno.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('quem pode abrir o painel', () => {
    it('personal não acessa', async () => {
      const r = await request(servidor)
        .get(url('/admin/profissionais'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('o próprio profissional não se verifica', async () => {
      await request(servidor)
        .patch(url(`/admin/profissionais/${idPro}/verificar`))
        .set('Authorization', `Bearer ${tokenPro}`)
        .expect(403);
    });

    it('sem token, 401', async () => {
      await request(servidor).get(url('/admin/profissionais')).expect(401);
    });
  });

  describe('fila de análise', () => {
    it('o recém-cadastrado aparece como PENDENTE', async () => {
      const r = await request(servidor)
        .get(url('/admin/profissionais?status=PENDENTE&limit=100'))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const alvo = r.body.find((p: { id: string }) => p.id === idPro);
      expect(alvo).toBeDefined();
      expect(alvo.status).toBe('PENDENTE');
      expect(alvo.registroConselho).toBe(`CRN ${sufixo}`);
      // O admin precisa ver isto para julgar: e-mail confirmado é outra checagem.
      expect(alvo.emailVerificado).toBe(true);
    });

    it('busca por nome encontra', async () => {
      const r = await request(servidor)
        .get(url('/admin/profissionais?q=Pendente da Silva'))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(r.body.some((p: { id: string }) => p.id === idPro)).toBe(true);
    });

    it('conta quantos aguardam', async () => {
      const r = await request(servidor)
        .get(url('/admin/profissionais/pendentes/total'))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(r.body.total).toBeGreaterThan(0);
    });
  });

  /** O ponto do painel: antes da aprovação o profissional não recebe aluno. */
  describe('efeito da verificação', () => {
    it('antes de verificar, convidar aluno é recusado', async () => {
      const r = await request(servidor)
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${tokenPro}`)
        .send({ email: emailAluno })
        .expect(409);

      // CONFLITO e não PAPEL_NAO_AUTORIZADO: o papel está certo, o que falta é
      // a verificação. A mensagem precisa explicar isso a quem se cadastrou.
      expect(r.body.erro.codigo).toBe('CONFLITO');
      expect(r.body.erro.mensagem).toContain('conselho');
    });

    it('recusa exige motivo', async () => {
      const r = await request(servidor)
        .patch(url(`/admin/profissionais/${idPro}/recusar`))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ motivo: 'oi' })
        .expect(422);

      expect(r.body.erro.codigo).toBe('DADOS_INVALIDOS');
    });

    it('recusado guarda o motivo e continua sem convidar', async () => {
      const r = await request(servidor)
        .patch(url(`/admin/profissionais/${idPro}/recusar`))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ motivo: 'Registro não localizado na consulta ao CRN.' })
        .expect(200);

      expect(r.body.status).toBe('RECUSADO');
      expect(r.body.motivoRecusa).toContain('CRN');

      await request(servidor)
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${tokenPro}`)
        .send({ email: emailAluno })
        .expect(409);
    });

    it('verificado passa a convidar, e fica registrado quem aprovou', async () => {
      const r = await request(servidor)
        .patch(url(`/admin/profissionais/${idPro}/verificar`))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(r.body.status).toBe('VERIFICADO');
      expect(r.body.verificadoPor?.nome).toBeTruthy();
      // Aprovar depois de recusar limpa a recusa.
      expect(r.body.motivoRecusa).toBeNull();

      await request(servidor)
        .post(url('/vinculos/convidar'))
        .set('Authorization', `Bearer ${tokenPro}`)
        .send({ email: emailAluno })
        .expect(201);
    });

    it('recusar depois revoga a verificação', async () => {
      const r = await request(servidor)
        .patch(url(`/admin/profissionais/${idPro}/recusar`))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ motivo: 'Registro suspenso pelo conselho.' })
        .expect(200);

      expect(r.body.status).toBe('RECUSADO');
      expect(r.body.verificadoEm).toBeNull();
    });

    it('profissional inexistente devolve 404', async () => {
      await request(servidor)
        .patch(url('/admin/profissionais/cms0000000000000000000000/verificar'))
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
    });
  });
});
