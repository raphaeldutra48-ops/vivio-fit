import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado } from './apoio';

describe('Prescrições (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenNutri: string;
  let tokenMedico: string;
  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idCreatina: string;
  let idPrescricao: string;

  const url = (c: string) => `/api/v1${c}`;

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
    tokenMedico = await entrar('medico@viviofit.com.br');
    tokenPersonal = await entrar('personal@viviofit.com.br');

    const email = `prescricao.${sufixo}@exemplo.com`;
    const registro = await criarAlunoVerificado(servidor, {
      nome: 'Paciente Prescrição',
      email,
      senha,
      dataNascimento: '1988-11-11',
    });
    tokenAluno = registro.accessToken;
    idAluno = registro.usuario.id;

    // Vínculo com nutricionista E médico; consentimento CLINICO.
    for (const token of [tokenNutri, tokenMedico]) {
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
      .send({ escopo: 'CLINICO' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.prescricao.deleteMany({ where: { alunoId: idAluno } });
    await prisma.modeloPrescricao.deleteMany({ where: { nome: { contains: sufixo } } });
    await prisma.itemPrescritivel.deleteMany({ where: { nome: { contains: sufixo } } });
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

  describe('competência profissional', () => {
    it('nutricionista cadastra suplemento', async () => {
      const r = await request(servidor)
        .post(url('/prescritiveis'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Creatina monoidratada ${sufixo}`,
          tipo: 'SUPLEMENTO',
          apresentacao: 'pote 300 g',
        })
        .expect(201);

      idCreatina = r.body.id;
      expect(r.body.escopo).toBe('PRIVADO');
    });

    it('nutricionista cadastra fitoterápico', async () => {
      await request(servidor)
        .post(url('/prescritiveis'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ nome: `Camomila ${sufixo}`, tipo: 'FITOTERAPICO' })
        .expect(201);
    });

    /**
     * A regra que mais importa aqui: prescrever medicamento é privativo do
     * médico. Permitir o contrário seria facilitar exercício ilegal da profissão.
     */
    it('nutricionista NÃO cadastra medicamento', async () => {
      const r = await request(servidor)
        .post(url('/prescritiveis'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ nome: `Losartana ${sufixo}`, tipo: 'MEDICAMENTO' })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
      expect(r.body.erro.mensagem).toContain('privativo');
    });

    it('médico cadastra medicamento', async () => {
      await request(servidor)
        .post(url('/prescritiveis'))
        .set('Authorization', `Bearer ${tokenMedico}`)
        .send({ nome: `Losartana ${sufixo}`, tipo: 'MEDICAMENTO', apresentacao: 'comprimido 50 mg' })
        .expect(201);
    });

    it('personal não acessa o catálogo de prescrição', async () => {
      await request(servidor)
        .get(url('/prescritiveis'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
    });

    it('um profissional não vê o item privado do outro', async () => {
      const r = await request(servidor)
        .get(url(`/prescritiveis?q=Creatina%20monoidratada%20${sufixo}`))
        .set('Authorization', `Bearer ${tokenMedico}`)
        .expect(200);

      expect(r.body).toHaveLength(0);
    });
  });

  describe('emissão', () => {
    it('nutricionista prescreve o suplemento com posologia', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          data: '2026-07-29',
          validaAte: '2026-10-29',
          orientacoes: 'Tomar com bastante água.',
          itens: [
            {
              prescritivelId: idCreatina,
              dose: 5,
              unidade: 'g',
              frequencia: '1x ao dia',
              horarios: ['08:00'],
              duracaoDias: 90,
              via: 'Oral',
            },
          ],
        })
        .expect(201);

      idPrescricao = r.body.id;
      expect(r.body.status).toBe('ATIVA');
      expect(r.body.versao).toBe(1);
      expect(r.body.itens[0].dose).toBe(5);
      expect(r.body.itens[0].frequencia).toBe('1x ao dia');
      expect(r.body.prescritor.papel).toBe('NUTRICIONISTA');
    });

    /** Renomear o catálogo não pode reescrever o que já foi prescrito. */
    it('o nome fica congelado no momento da emissão', async () => {
      await prisma.itemPrescritivel.update({
        where: { id: idCreatina },
        data: { nome: `Nome trocado depois ${sufixo}` },
      });

      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body[0].itens[0].nome).toContain('Creatina monoidratada');
    });

    /**
     * Item privado de outro profissional: 404, não 403. A nutricionista não
     * enxerga o acervo do médico, então dizer "existe, mas você não pode" já
     * seria vazar informação.
     */
    it('item privado de outro profissional não existe para quem prescreve', async () => {
      const losartana = await prisma.itemPrescritivel.findFirstOrThrow({
        where: { nome: { contains: `Losartana ${sufixo}` } },
      });

      await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ data: '2026-07-29', itens: [{ prescritivelId: losartana.id, dose: 50 }] })
        .expect(404);
    });

    /** Item global de medicamento: visível para todos, prescritível só pelo médico. */
    it('recusa medicamento do catálogo global na mão da nutricionista', async () => {
      const global = await prisma.itemPrescritivel.create({
        data: {
          nome: `Sinvastatina ${sufixo}`,
          tipo: 'MEDICAMENTO',
          apresentacao: 'comprimido 20 mg',
          escopo: 'GLOBAL',
        },
      });

      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          data: '2026-07-29',
          itens: [{ prescritivelId: global.id, dose: 20, unidade: 'mg' }],
        })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
      expect(r.body.erro.mensagem).toContain('privativo');

      // O mesmo item, pelo médico, passa.
      await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenMedico}`)
        .send({
          data: '2026-07-29',
          itens: [{ prescritivelId: global.id, dose: 20, unidade: 'mg', frequencia: '1x à noite' }],
        })
        .expect(201);
    });

    it('o aluno lê as próprias prescrições', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body[0].orientacoes).toBe('Tomar com bastante água.');
    });

    it('o personal não vê prescrição — não tem vínculo nem escopo clínico', async () => {
      await request(servidor)
        .get(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
    });
  });

  describe('substituição — registro clínico não se edita', () => {
    it('mudar a conduta cria versão 2 e marca a anterior como substituída', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes/${idPrescricao}/substituir`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          data: '2026-08-15',
          orientacoes: 'Dose ajustada.',
          itens: [{ prescritivelId: idCreatina, dose: 3, unidade: 'g', frequencia: '1x ao dia' }],
        })
        .expect(201);

      expect(r.body.versao).toBe(2);
      expect(r.body.itens[0].dose).toBe(3);

      const anterior = await prisma.prescricao.findUniqueOrThrow({ where: { id: idPrescricao } });
      expect(anterior.status).toBe('SUBSTITUIDA');
    });

    it('a versão 1 continua legível com a dose original', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const v1 = r.body.find((p: { id: string }) => p.id === idPrescricao);
      expect(v1.versao).toBe(1);
      expect(v1.itens[0].dose).toBe(5);
      expect(v1.status).toBe('SUBSTITUIDA');
    });

    it('substituída não muda mais de status', async () => {
      const r = await request(servidor)
        .patch(url(`/alunos/${idAluno}/prescricoes/${idPrescricao}/status`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ status: 'ENCERRADA' })
        .expect(409);

      expect(r.body.erro.codigo).toBe('CONFLITO');
    });

    /** Quem não emitiu não altera — outro profissional emite a sua própria. */
    it('outro profissional não substitui prescrição alheia', async () => {
      const nova = await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ data: '2026-08-20', itens: [{ prescritivelId: idCreatina, dose: 5, unidade: 'g' }] })
        .expect(201);

      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/prescricoes/${nova.body.id}/substituir`))
        .set('Authorization', `Bearer ${tokenMedico}`)
        .send({ data: '2026-08-21', itens: [{ prescritivelId: idCreatina, dose: 10 }] })
        .expect(403);

      expect(r.body.erro.mensagem).toContain('emitiu');
    });
  });

  describe('modelos', () => {
    it('cria e reutiliza um modelo de prescrição', async () => {
      const r = await request(servidor)
        .post(url('/modelos-prescricao'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Protocolo creatina ${sufixo}`,
          orientacoes: 'Manter hidratação.',
          itens: [
            { prescritivelId: idCreatina, dose: 5, unidade: 'g', frequencia: '1x ao dia' },
          ],
        })
        .expect(201);

      expect(r.body.totalItens).toBe(1);

      const lista = await request(servidor)
        .get(url('/modelos-prescricao'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);
      expect(lista.body.some((m: { id: string }) => m.id === r.body.id)).toBe(true);
    });

    it('o modelo de um profissional não aparece para o outro', async () => {
      const r = await request(servidor)
        .get(url('/modelos-prescricao'))
        .set('Authorization', `Bearer ${tokenMedico}`)
        .expect(200);

      expect(r.body.some((m: { nome: string }) => m.nome.includes(sufixo))).toBe(false);
    });
  });
});
