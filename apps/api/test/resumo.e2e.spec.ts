import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EscopoDado, Papel, StatusVinculo } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * O resumo do profissional, e principalmente o que ele **não** mostra.
 *
 * Uma rota agregadora é onde o consentimento vaza. Os dois guards do app
 * trabalham sobre um `:alunoId` na rota, e aqui não há um — há todos. A regra
 * passou para dentro do serviço, e o que garante que ela continue lá é este
 * arquivo.
 *
 * Removida a linha que filtra por TREINO, a montagem abaixo devolve os dois
 * alunos na lista de sumidos em vez de um. É o vazamento exato que o teste
 * existe para pegar: o profissional veria "fulano não treina há 40 dias" de
 * alguém que nunca lhe autorizou ver treino nenhum.
 */
describe('Resumo do profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);

  let tokenPersonal: string;
  let personalId: string;
  let idComConsentimento: string;
  let idSemConsentimento: string;

  /** Vínculo antigo o bastante para o aluno contar como sumido sem nunca treinar. */
  const HA_QUARENTA_DIAS = new Date(Date.now() - 40 * 86_400_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    tokenPersonal = (
      await request(servidor)
        .post(url('/auth/login'))
        .send({ email: 'personal@viviofit.com.br', senha })
    ).body.accessToken;
    personalId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'personal@viviofit.com.br' } })
    ).id;

    /*
      Dois alunos idênticos em tudo — mesmo tempo de vínculo, mesma ausência de
      treino — separados por uma única variável: um autorizou TREINO, o outro
      não. É o par mínimo que isola a regra.
    */
    const criar = async (rotulo: string) => {
      const aluno = await criarAlunoVerificado(servidor, {
        nome: `Aluno ${rotulo}`,
        email: `resumo.${rotulo}.${sufixo}@teste.com`,
        senha,
        dataNascimento: '1990-03-15',
      });
      await prisma.vinculo.create({
        data: {
          alunoId: aluno.usuario.id,
          profissionalId: personalId,
          tipo: Papel.PERSONAL,
          status: StatusVinculo.ATIVO,
          convidadoPorId: personalId,
          iniciadoEm: HA_QUARENTA_DIAS,
        },
      });
      return aluno.usuario.id;
    };

    idComConsentimento = await criar('autoriza');
    idSemConsentimento = await criar('naoautoriza');

    await prisma.consentimento.create({
      data: {
        alunoId: idComConsentimento,
        escopo: EscopoDado.TREINO,
        profissionalId: personalId,
        finalidade: 'Acompanhamento de treino',
        versaoTermo: 'teste',
      },
    });
  });

  afterAll(async () => {
    for (const alunoId of [idComConsentimento, idSemConsentimento]) {
      await prisma.consentimento.deleteMany({ where: { alunoId } });
      await prisma.vinculo.deleteMany({ where: { alunoId } });
    }
    await app.close();
  });

  const buscar = async () =>
    (
      await request(servidor)
        .get(url('/resumo'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200)
    ).body;

  /* A regra central deste arquivo. */
  it('não lista como sumido quem não autorizou TREINO', async () => {
    const resumo = await buscar();
    const ids = resumo.sumidos.map((s: { alunoId: string }) => s.alunoId);

    expect(ids).toContain(idComConsentimento);
    expect(ids).not.toContain(idSemConsentimento);
  });

  /*
    A contrapartida, e o que impede a correção preguiçosa: esconder o aluno da
    tela inteira também passaria no teste acima, e seria pior — o profissional
    ficaria sem saber que existe alguém travado.
  */
  it('quem não autorizou aparece como pendência de autorização', async () => {
    const resumo = await buscar();
    const pendente = resumo.autorizacoesPendentes.find(
      (p: { alunoId: string }) => p.alunoId === idSemConsentimento,
    );

    expect(pendente).toBeDefined();
    expect(pendente.faltando).toContain(EscopoDado.TREINO);
  });

  it('quem autorizou não aparece como pendência', async () => {
    const resumo = await buscar();
    const ids = resumo.autorizacoesPendentes.map((p: { alunoId: string }) => p.alunoId);
    expect(ids).not.toContain(idComConsentimento);
  });

  /*
    "Nunca treinou" e "parou de treinar" pedem conversas diferentes, e a tela
    escreve frases diferentes para cada um. Achatar os dois em zero faria o
    profissional cobrar por um treino que o aluno nunca soube que existia.
  */
  it('quem nunca treinou vem com diasSemTreinar nulo, não zero', async () => {
    const resumo = await buscar();
    const aluno = resumo.sumidos.find(
      (s: { alunoId: string }) => s.alunoId === idComConsentimento,
    );

    expect(aluno.diasSemTreinar).toBeNull();
    expect(aluno.diasDeVinculo).toBeGreaterThanOrEqual(39);
  });

  it('o aluno não acessa o resumo do profissional', async () => {
    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Curioso',
      email: `resumo.curioso.${sufixo}@teste.com`,
      senha,
      dataNascimento: '1995-01-01',
    });

    await request(servidor)
      .get(url('/resumo'))
      .set('Authorization', `Bearer ${aluno.accessToken}`)
      .expect(403);
  });

  it('sem token, não responde', async () => {
    await request(servidor).get(url('/resumo')).expect(401);
  });
});
