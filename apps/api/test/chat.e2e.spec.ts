import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado } from './apoio';

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenPersonal: string;
  let tokenNutri: string;
  let tokenAluno: string;
  let idAluno: string;
  let idPersonal: string;
  let idNutri: string;
  let idConversa: string;

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
    tokenPersonal = await entrar('personal@viviofit.com.br');
    tokenNutri = await entrar('nutri@viviofit.com.br');

    idPersonal = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'personal@viviofit.com.br' } })
    ).id;
    idNutri = (await prisma.user.findUniqueOrThrow({ where: { email: 'nutri@viviofit.com.br' } })).id;

    const email = `chat.${sufixo}@exemplo.com`;
    const registro = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Chat',
      email,
      senha,
      dataNascimento: '1995-01-01',
    });
    tokenAluno = registro.accessToken;
    idAluno = registro.usuario.id;

    // Vínculo só com o personal — a nutricionista fica de fora de propósito.
    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
  });

  afterAll(async () => {
    await prisma.mensagem.deleteMany({ where: { conversa: { alunoId: idAluno } } });
    await prisma.participanteConversa.deleteMany({ where: { conversa: { alunoId: idAluno } } });
    await prisma.conversa.deleteMany({ where: { alunoId: idAluno } });
    await prisma.vinculo.deleteMany({ where: { alunoId: idAluno } });
    await prisma.perfilAluno.deleteMany({ where: { userId: idAluno } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idAluno } });
    await prisma.logAuditoria.deleteMany({
      where: { OR: [{ alunoId: idAluno }, { atorId: idAluno }] },
    });
    await prisma.user.deleteMany({ where: { id: idAluno } });
    await app.close();
  });

  describe('abertura', () => {
    it('o profissional abre a conversa com o aluno vinculado', async () => {
      const r = await request(servidor)
        .post(url('/conversas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ comUsuarioId: idAluno })
        .expect(201);

      idConversa = r.body.id;
      expect(r.body.tipo).toBe('ALUNO_PROFISSIONAL');
      expect(r.body.contraparte.id).toBe(idAluno);
      expect(r.body.naoLidas).toBe(0);
    });

    it('abrir de novo reaproveita a mesma conversa', async () => {
      const r = await request(servidor)
        .post(url('/conversas'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ comUsuarioId: idPersonal })
        .expect(201);

      expect(r.body.id).toBe(idConversa);
      // Do lado do aluno, a contraparte é o personal.
      expect(r.body.contraparte.id).toBe(idPersonal);
    });

    /** Sem vínculo ativo não existe conversa — é a mesma trava do resto do app. */
    it('profissional sem vínculo não abre conversa', async () => {
      const r = await request(servidor)
        .post(url('/conversas'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ comUsuarioId: idAluno })
        .expect(403);

      expect(r.body.erro.codigo).toBe('VINCULO_AUSENTE');
    });

    it('dois profissionais não abrem conversa entre si por aqui', async () => {
      const r = await request(servidor)
        .post(url('/conversas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ comUsuarioId: idNutri })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });
  });

  describe('mensagens', () => {
    it('envia e lê o histórico', async () => {
      const r = await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ clienteUuid: randomUUID(), corpo: 'Bom treino hoje! Como você se sentiu?' })
        .expect(201);

      expect(r.body.corpo).toBe('Bom treino hoje! Como você se sentiu?');
      expect(r.body.minha).toBe(true);
      expect(r.body.autor.papel).toBe('PERSONAL');

      const historico = await request(servidor)
        .get(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(historico.body.dados).toHaveLength(1);
      // A mesma mensagem, do outro lado, não é "minha".
      expect(historico.body.dados[0].minha).toBe(false);
    });

    /** Toque duplo, rede oscilando, fila offline: nunca vira duas bolhas. */
    it('reenviar o mesmo clienteUuid não duplica', async () => {
      const uuid = randomUUID();
      const corpo = { clienteUuid: uuid, corpo: 'Mensagem única' };

      const primeira = await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send(corpo)
        .expect(201);
      const segunda = await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send(corpo)
        .expect(201);

      expect(segunda.body.id).toBe(primeira.body.id);
      expect(await prisma.mensagem.count({ where: { clienteUuid: uuid } })).toBe(1);
    });

    it('envios simultâneos do mesmo uuid também geram uma só', async () => {
      const uuid = randomUUID();
      const enviar = () =>
        request(servidor)
          .post(url(`/conversas/${idConversa}/mensagens`))
          .set('Authorization', `Bearer ${tokenAluno}`)
          .send({ clienteUuid: uuid, corpo: 'Corrida' });

      const [a, b] = await Promise.all([enviar(), enviar()]);
      expect(a.body.id).toBe(b.body.id);
      expect(await prisma.mensagem.count({ where: { clienteUuid: uuid } })).toBe(1);
    });

    it('recusa mensagem vazia', async () => {
      await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ clienteUuid: randomUUID(), corpo: '' })
        .expect(422);
    });

    /** Quem não participa recebe 404: não confirmamos nem que a conversa existe. */
    it('estranho não lê a conversa (404, não 403)', async () => {
      const r = await request(servidor)
        .get(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(404);

      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('estranho não escreve na conversa', async () => {
      await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .send({ clienteUuid: randomUUID(), corpo: 'oi' })
        .expect(404);
    });
  });

  describe('não lidas', () => {
    it('conta as mensagens do outro lado e zera ao abrir', async () => {
      await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ clienteUuid: randomUUID(), corpo: 'Lembra de beber água' })
        .expect(201);

      const antes = await request(servidor)
        .get(url('/conversas'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);
      const conversa = antes.body.find((c: { id: string }) => c.id === idConversa);
      expect(conversa.naoLidas).toBeGreaterThan(0);
      expect(conversa.ultimaMensagem.corpo).toBe('Lembra de beber água');

      await request(servidor)
        .post(url(`/conversas/${idConversa}/vista`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(204);

      const depois = await request(servidor)
        .get(url('/conversas'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);
      expect(depois.body.find((c: { id: string }) => c.id === idConversa).naoLidas).toBe(0);
    });

    it('a própria mensagem não conta como não lida', async () => {
      // Marca vista aqui em vez de herdar do teste anterior: teste que depende
      // da ordem quebra quando um vizinho falha ou estoura o tempo.
      await request(servidor)
        .post(url(`/conversas/${idConversa}/vista`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(204);

      await request(servidor)
        .post(url(`/conversas/${idConversa}/mensagens`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ clienteUuid: randomUUID(), corpo: 'Bebi 2 litros hoje' })
        .expect(201);

      const lista = await request(servidor)
        .get(url('/conversas'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(lista.body.find((c: { id: string }) => c.id === idConversa).naoLidas).toBe(0);
    });
  });
});
