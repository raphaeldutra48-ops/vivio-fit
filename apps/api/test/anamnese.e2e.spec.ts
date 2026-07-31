import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

describe('Anamnese (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenNutri: string;
  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idModelo: string;
  let idPerguntaObrigatoria: string;
  let idPerguntaMultipla: string;

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

    const email = `anamnese.${sufixo}@exemplo.com`;
    const registro = await criarAlunoVerificado(servidor, {
      nome: 'Paciente Anamnese',
      email,
      senha,
      dataNascimento: '1991-07-07',
    });
    tokenAluno = registro.accessToken;
    idAluno = registro.usuario.id;

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
      .send({ escopo: 'CLINICO' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.anamnese.deleteMany({ where: { alunoId: idAluno } });
    await prisma.modeloAnamnese.deleteMany({ where: { nome: { contains: sufixo } } });
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

  describe('modelo de questionário', () => {
    it('cria com perguntas de tipos variados', async () => {
      const r = await request(servidor)
        .post(url('/modelos-anamnese'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Anamnese nutricional ${sufixo}`,
          descricao: 'Primeira consulta',
          perguntas: [
            { texto: 'Qual seu objetivo?', tipo: 'TEXTO_LONGO', obrigatoria: true },
            { texto: 'Fuma?', tipo: 'SIM_NAO' },
            {
              texto: 'Quais refeições faz por dia?',
              tipo: 'ESCOLHA_MULTIPLA',
              opcoes: ['Café', 'Almoço', 'Lanche', 'Jantar'],
            },
            { texto: 'Horas de sono', tipo: 'NUMERO' },
          ],
        })
        .expect(201);

      idModelo = r.body.id;
      expect(r.body.totalPerguntas).toBe(4);
      idPerguntaObrigatoria = r.body.perguntas[0].id;
      idPerguntaMultipla = r.body.perguntas[2].id;
      // Ordem preservada: o questionário tem sequência pensada.
      expect(r.body.perguntas.map((p: { texto: string }) => p.texto)[1]).toBe('Fuma?');
    });

    it('recusa pergunta de escolha sem opções', async () => {
      const r = await request(servidor)
        .post(url('/modelos-anamnese'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Inválida ${sufixo}`,
          perguntas: [{ texto: 'Escolha uma', tipo: 'ESCOLHA_UNICA', opcoes: ['só uma'] }],
        })
        .expect(422);

      expect(r.body.erro.codigo).toBe('DADOS_INVALIDOS');
    });

    it('recusa modelo sem pergunta nenhuma', async () => {
      await request(servidor)
        .post(url('/modelos-anamnese'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ nome: `Vazia ${sufixo}`, perguntas: [] })
        .expect(422);
    });

    it('o modelo de um profissional não aparece para o outro', async () => {
      const r = await request(servidor)
        .get(url('/modelos-anamnese'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.some((m: { id: string }) => m.id === idModelo)).toBe(false);
    });
  });

  describe('aplicação ao paciente', () => {
    let idAnamnese: string;

    it('exige as perguntas obrigatórias, dizendo quais', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ modeloId: idModelo, respostas: [] })
        .expect(409);

      expect(r.body.erro.mensagem).toContain('Qual seu objetivo?');
    });

    it('aplica e guarda as respostas na ordem do questionário', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          modeloId: idModelo,
          observacao: 'Paciente relatou rotina irregular.',
          respostas: [
            { perguntaId: idPerguntaObrigatoria, valor: 'Emagrecer com saúde' },
            { perguntaId: idPerguntaMultipla, valores: ['Café', 'Jantar'] },
          ],
        })
        .expect(201);

      idAnamnese = r.body.id;
      expect(r.body.nome).toContain('Anamnese nutricional');
      expect(r.body.respostas).toHaveLength(4);
      expect(r.body.respostas[0].valor).toBe('Emagrecer com saúde');
      expect(r.body.respostas[2].valores).toEqual(['Café', 'Jantar']);
      // Sem resposta continua na lista, para o histórico mostrar o que não foi perguntado.
      expect(r.body.respostas[1].valor).toBeNull();
    });

    /** Editar o questionário não pode reescrever o que já foi respondido. */
    it('a pergunta fica congelada: editar o modelo não muda a anamnese', async () => {
      await request(servidor)
        .patch(url(`/modelos-anamnese/${idModelo}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({
          nome: `Anamnese nutricional ${sufixo} v2`,
          perguntas: [{ texto: 'Pergunta completamente diferente', tipo: 'TEXTO' }],
        })
        .expect(200);

      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      const anterior = r.body.find((a: { id: string }) => a.id === idAnamnese);
      expect(anterior.respostas[0].pergunta).toBe('Qual seu objetivo?');
      expect(anterior.nome).toBe(`Anamnese nutricional ${sufixo}`);
    });

    it('o paciente lê a própria anamnese', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body[0].profissional.nome).toBeTruthy();
    });

    it('sem vínculo, o personal não vê', async () => {
      await request(servidor)
        .get(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);
    });

    it('modelo de outro profissional não pode ser aplicado', async () => {
      const doPersonal = await request(servidor)
        .post(url('/modelos-anamnese'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          nome: `Do personal ${sufixo}`,
          perguntas: [{ texto: 'Treina há quanto tempo?', tipo: 'TEXTO' }],
        })
        .expect(201);

      await request(servidor)
        .post(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ modeloId: doPersonal.body.id, respostas: [] })
        .expect(404);
    });

    it('remover o modelo não apaga a anamnese aplicada', async () => {
      await request(servidor)
        .delete(url(`/modelos-anamnese/${idModelo}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(204);

      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/anamneses`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body.some((a: { id: string }) => a.id === idAnamnese)).toBe(true);
    });
  });
});
