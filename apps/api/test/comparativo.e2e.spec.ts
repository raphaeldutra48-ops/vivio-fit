import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Comparativo de evolução.
 *
 * O documento vai para a mão do aluno, então duas coisas são protegidas aqui
 * acima de tudo: **a privacidade da foto** (que tem visibilidade própria,
 * escolhida foto a foto) e **a honestidade do número** (ausência de medida não
 * pode virar "não mudou").
 */
describe('Comparativo de evolução (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `comparativo.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;

  const comparar = (dias = 60, token = tokenPersonal) =>
    request(servidor)
      .get(url(`/alunos/${idAluno}/comparativo?dias=${dias}`))
      .set('Authorization', `Bearer ${token}`);

  /** Grava medida direto no banco: a data precisa ser no passado. */
  const medir = (diasAtras: number, campos: Record<string, number>) =>
    prisma.medida.create({
      data: {
        alunoId: idAluno,
        registradoPorId: idAluno,
        data: new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000),
        ...campos,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    const login = await request(servidor)
      .post(url('/auth/login'))
      .send({ email: 'personal@viviofit.com.br', senha });
    tokenPersonal = login.body.accessToken;

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Comparativo',
      email: emailAluno,
      senha,
      dataNascimento: '1990-06-06',
    });
    tokenAluno = aluno.accessToken;
    idAluno = aluno.usuario.id;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email: emailAluno })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
    await request(servidor)
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ escopo: 'EVOLUCAO' })
      .expect(201);
  });

  const apagarConta = async (email: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
    await prisma.fotoEvolucao.deleteMany({ where: { alunoId: u.id } });
    await prisma.medida.deleteMany({ where: { alunoId: u.id } });
    await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
    await prisma.vinculo.deleteMany({ where: { OR: [{ alunoId: u.id }, { profissionalId: u.id }] } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
    await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  };

  afterAll(async () => {
    await apagarConta(emailAluno);
    await app.close();
  });

  describe('sem medida nenhuma', () => {
    /*
      Documento vazio não pode parecer documento de quem não evoluiu. Todos os
      campos vêm `null`, e a tela mostra travessão em vez de zero.
    */
    it('devolve nulos, não zeros', async () => {
      const r = await comparar().expect(200);

      expect(r.body.antes.data).toBeNull();
      expect(r.body.agora.data).toBeNull();
      expect(r.body.diferenca.pesoKg).toBeNull();
      expect(r.body.treino).toBeNull();
      expect(r.body.aluno.nome).toBe('Aluno Comparativo');
    });
  });

  describe('com as duas medidas', () => {
    beforeAll(async () => {
      await medir(62, { pesoKg: 84, cinturaCm: 96, massaMagraKg: 60 });
      await medir(1, { pesoKg: 79, cinturaCm: 90, massaMagraKg: 62 });
    });

    it('acha a medida perto do alvo, não a mais antiga que existir', async () => {
      const r = await comparar(60).expect(200);
      expect(r.body.antes.pesoKg).toBe(84);
      expect(r.body.agora.pesoKg).toBe(79);
    });

    it('a diferença sai calculada, com sinal', async () => {
      const r = await comparar(60).expect(200);
      expect(r.body.diferenca.pesoKg).toBe(-5);
      expect(r.body.diferenca.cinturaCm).toBe(-6);
      // Massa magra subindo é a boa notícia do emagrecimento.
      expect(r.body.diferenca.massaMagraKg).toBe(2);
    });

    /** Campo medido só num dos lados não vira "não mudou". */
    it('campo ausente de um lado dá diferença nula', async () => {
      const r = await comparar(60).expect(200);
      expect(r.body.diferenca.quadrilCm).toBeNull();
      expect(r.body.antes.quadrilCm).toBeNull();
    });

    /*
      A janela de 60 dias não deve enxergar a medida de 62 dias como "agora",
      nem a de 1 dia como "antes". Com 120 dias, o "antes" some: não há medida
      perto daquele ponto.
    */
    it('mudar o período muda o lado "antes"', async () => {
      const em120 = await comparar(120).expect(200);
      expect(em120.body.antes.data).toBeNull();
      expect(em120.body.agora.pesoKg).toBe(79);
      expect(em120.body.dias).toBe(120);
    });

    it('aceita 30, 60, 90 e 120', async () => {
      for (const dias of [30, 60, 90, 120]) {
        const r = await comparar(dias).expect(200);
        expect(r.body.dias).toBe(dias);
      }
    });

    it('recusa período fora da lista', async () => {
      await comparar(45).expect(422);
      await comparar(365).expect(422);
    });
  });

  describe('privacidade da foto', () => {
    beforeAll(async () => {
      // Uma foto que o aluno NÃO liberou para ninguém — o padrão do app.
      await prisma.fotoEvolucao.create({
        data: {
          alunoId: idAluno,
          data: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          chaveArquivo: `fotos/${idAluno}/privada-${sufixo}.jpg`,
          mimeType: 'image/jpeg',
          tamanhoBytes: 1024,
          angulo: 'FRENTE',
          visivelPara: [],
        },
      });
    });

    /*
      A defesa central deste módulo. Consentimento de EVOLUCAO deixa o
      profissional ver medidas — não implica ter liberado a imagem do corpo,
      que é escolhida foto a foto. Um comparativo bonito não é motivo para
      furar isso.
    */
    it('o profissional NÃO recebe foto que o aluno não liberou', async () => {
      const r = await comparar(60, tokenPersonal).expect(200);
      expect(r.body.agora.fotos).toEqual([]);
      // E os números continuam vindo: o documento sai, só sem imagem.
      expect(r.body.agora.pesoKg).toBe(79);
    });

    it('o próprio aluno vê as próprias fotos', async () => {
      const r = await comparar(60, tokenAluno).expect(200);
      expect(r.body.agora.fotos).toHaveLength(1);
      expect(r.body.agora.fotos[0].url).toContain('assinatura=');
    });

    it('liberar para o personal passa a incluir', async () => {
      await prisma.fotoEvolucao.updateMany({
        where: { alunoId: idAluno },
        data: { visivelPara: ['PERSONAL'] },
      });

      const r = await comparar(60, tokenPersonal).expect(200);
      expect(r.body.agora.fotos).toHaveLength(1);
      expect(r.body.agora.fotos[0].angulo).toBe('FRENTE');
    });
  });

  describe('isolamento', () => {
    it('sem vínculo não lê', async () => {
      const outro = await criarAlunoVerificado(servidor, {
        nome: 'Estranho Comparativo',
        email: `estranho-comp.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1990-01-01',
      });

      await comparar(60, outro.accessToken).expect(403);
      await apagarConta(`estranho-comp.${sufixo}@exemplo.com`);
    });
  });
});
