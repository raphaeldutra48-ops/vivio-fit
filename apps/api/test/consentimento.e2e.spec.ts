import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';

/**
 * TESTE DE ACEITE DA FASE 0.
 *
 * Prova que as três condições de acesso são independentes e cumulativas:
 * autenticação -> vínculo ativo -> consentimento vigente para o escopo.
 *
 * Ana   -> vínculo ATIVO + consentimento EVOLUCAO  => 200
 * Bruno -> vínculo ATIVO + SEM consentimento       => 403 CONSENTIMENTO_AUSENTE
 * Carla -> vínculo PENDENTE                        => 403 VINCULO_AUSENTE
 */
describe('Consentimento e auditoria (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'Senha@123';
  let tokenPersonal: string;
  let tokenAna: string;
  let tokenBruno: string;
  let idAna: string;
  let idBruno: string;
  let idCarla: string;
  let idPersonal: string;

  const url = (caminho: string) => `/api/v1${caminho}`;

  /**
   * Data reservada para este teste.
   *
   * Distante do seed de propósito: a medida criada aqui é apagada no fim, e
   * uma data compartilhada faria a limpeza levar dado que não é dela.
   */
  const DATA_DO_TESTE = '2029-01-15';

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

    [tokenPersonal, tokenAna, tokenBruno] = await Promise.all([
      logar('personal@viviofit.com.br'),
      logar('ana@exemplo.com'),
      logar('bruno@exemplo.com'),
    ]);

    const users = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'ana@exemplo.com',
            'bruno@exemplo.com',
            'carla@exemplo.com',
            'personal@viviofit.com.br',
          ],
        },
      },
      select: { id: true, email: true },
    });
    idAna = users.find((u) => u.email === 'ana@exemplo.com')!.id;
    idBruno = users.find((u) => u.email === 'bruno@exemplo.com')!.id;
    idCarla = users.find((u) => u.email === 'carla@exemplo.com')!.id;
    idPersonal = users.find((u) => u.email === 'personal@viviofit.com.br')!.id;
  });

  afterAll(async () => {
    // Só a medida que este teste cria, na data que ele usa. Antes daqui saía um
    // deleteMany de tudo da Ana e do Bruno: rodar a suíte esvaziava o histórico
    // de composição corporal, e os gráficos do app ficavam em branco até
    // alguém digitar tudo de novo. O histórico agora vem do seed — motivo a
    // mais para este afterAll não encostar nele.
    await prisma.medida.deleteMany({
      where: { alunoId: idAna, data: new Date(DATA_DO_TESTE) },
    });
    await app.close();
  });

  describe('as três condições de acesso', () => {
    it('Ana: vínculo + consentimento => LIBERA', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
    });

    it('Bruno: vínculo ATIVO mas SEM consentimento => 403 CONSENTIMENTO_AUSENTE', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
      expect(r.body.erro.detalhes.escopo).toBe('EVOLUCAO');
    });

    it('Bruno continua acessível na ficha básica — o bloqueio é por escopo, não geral', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/resumo`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
    });

    it('Carla: sem vínculo ativo => 403 VINCULO_AUSENTE (motivo diferente)', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idCarla}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('VINCULO_AUSENTE');
    });

    it('o próprio aluno acessa seus dados sem precisar consentir consigo mesmo', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/medidas`))
        .set('Authorization', `Bearer ${tokenBruno}`)
        .expect(200);
    });
  });

  describe('escrita de dado clínico', () => {
    it('personal registra medida da Ana', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ data: DATA_DO_TESTE, pesoKg: 64.5, cinturaCm: 72 })
        .expect(201);

      expect(r.body.pesoKg).toBe(64.5);
    });

    it('remedir no mesmo dia atualiza em vez de duplicar', async () => {
      await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ data: DATA_DO_TESTE, pesoKg: 64.9 })
        .expect(201);

      const medidas = await prisma.medida.findMany({
        where: { alunoId: idAna, data: new Date(DATA_DO_TESTE) },
      });
      expect(medidas).toHaveLength(1);
      expect(Number(medidas[0]!.pesoKg)).toBe(64.9);
    });

    it('não deixa o personal escrever medida do Bruno (sem consentimento)', async () => {
      await request(app.getHttpServer())
        .post(url(`/alunos/${idBruno}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ pesoKg: 80 })
        .expect(403);
    });
  });

  describe('revogação tem efeito imediato', () => {
    it('Ana revoga EVOLUCAO e o personal perde o acesso na requisição seguinte', async () => {
      const lista = await request(app.getHttpServer())
        .get(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      const evolucao = lista.body.find((c: { escopo: string }) => c.escopo === 'EVOLUCAO');
      expect(evolucao).toBeTruthy();

      // Antes: funciona
      await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(url(`/consentimentos/${evolucao.id}`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(204);

      // Depois: bloqueado, sem janela de propagação
      const depois = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
      expect(depois.body.erro.codigo).toBe('CONSENTIMENTO_AUSENTE');

      // E o registro da revogação fica — prova de que o acesso anterior era legítimo
      const revogado = await prisma.consentimento.findUnique({ where: { id: evolucao.id } });
      expect(revogado?.revogadoEm).not.toBeNull();

      // Reconcede para não quebrar as próximas execuções da suíte
      await request(app.getHttpServer())
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({ escopo: 'EVOLUCAO' })
        .expect(201);

      await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
    });

    it('ninguém consente pelo aluno — profissional não acessa a rota', async () => {
      const r = await request(app.getHttpServer())
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ escopo: 'EVOLUCAO' })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('aluno não revoga consentimento de outro aluno', async () => {
      const lista = await request(app.getHttpServer())
        .get(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenAna}`);
      const algum = lista.body[0];

      await request(app.getHttpServer())
        .delete(url(`/consentimentos/${algum.id}`))
        .set('Authorization', `Bearer ${tokenBruno}`)
        .expect(404);
    });
  });

  describe('trilha de auditoria', () => {
    it('registra a leitura bem sucedida', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const r = await request(app.getHttpServer())
        .get(url('/auditoria/meus-acessos'))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      const leitura = r.body.dados.find(
        (a: { acao: string; recursoTipo: string }) =>
          a.acao === 'LER' && a.recursoTipo === 'MEDIDA',
      );
      expect(leitura).toBeTruthy();
      expect(leitura.ator.id).toBe(idPersonal);
      expect(leitura.escopo).toBe('EVOLUCAO');
    });

    /** Tentativa de acesso indevido é o evento que mais importa registrar. */
    it('registra a tentativa NEGADA por falta de consentimento', async () => {
      await request(app.getHttpServer())
        .get(url(`/alunos/${idBruno}/medidas`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      const r = await request(app.getHttpServer())
        .get(url('/auditoria/meus-acessos'))
        .set('Authorization', `Bearer ${tokenBruno}`)
        .expect(200);

      const negado = r.body.dados.find((a: { acao: string }) => a.acao === 'NEGADO');
      expect(negado).toBeTruthy();
      expect(negado.ator.id).toBe(idPersonal);
      expect(negado.recursoTipo).toBe('MEDIDA');
    });

    it('a trilha não guarda conteúdo clínico', async () => {
      const registros = await prisma.logAuditoria.findMany({
        where: { alunoId: idAna, recursoTipo: 'MEDIDA' },
        take: 20,
      });

      expect(registros.length).toBeGreaterThan(0);
      for (const r of registros) {
        const texto = JSON.stringify(r.metadata ?? {});
        expect(texto).not.toContain('64.9');
        expect(texto).not.toContain('pesoKg');
      }
    });

    it('só o titular vê os próprios acessos', async () => {
      await request(app.getHttpServer())
        .get(url('/auditoria/meus-acessos'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
    });
  });
});
