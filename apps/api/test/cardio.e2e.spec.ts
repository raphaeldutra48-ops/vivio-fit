import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Cardio e estimativa calórica.
 *
 * O que se protege aqui é a **honestidade do número**: sem peso registrado não
 * existe estimativa, e o serviço tem que devolver `null` em vez de assumir um
 * peso médio. Um número chutado na tela é lido como verdade, e quem mais olha
 * essa tela é exatamente quem foge da média.
 */
describe('Cardio e calorias (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `cardio.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;

  const hoje = () => new Date().toISOString().slice(0, 10);

  const registrar = (corpo: Record<string, unknown>, token = tokenAluno) =>
    request(servidor)
      .post(url(`/alunos/${idAluno}/cardio`))
      .set('Authorization', `Bearer ${token}`)
      .send(corpo);

  const calorias = (token = tokenAluno) =>
    request(servidor)
      .get(url(`/alunos/${idAluno}/cardio/calorias?dias=30`))
      .set('Authorization', `Bearer ${token}`);

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

    const conta = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Cardio',
      email: emailAluno,
      senha,
      dataNascimento: '1993-04-04',
    });
    tokenAluno = conta.accessToken;
    idAluno = conta.usuario.id;

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
      .send({ escopo: 'TREINO' })
      .expect(201);
  });

  afterAll(async () => {
    const u = await prisma.user.findUnique({ where: { email: emailAluno } });
    if (u) {
      await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
      await prisma.atividadeCardio.deleteMany({ where: { alunoId: u.id } });
      await prisma.calorimetriaIndireta.deleteMany({ where: { OR: [{ alunoId: u.id }, { registradoPorId: u.id }] } });
      await prisma.medida.deleteMany({ where: { alunoId: u.id } });
      await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
      await prisma.vinculo.deleteMany({ where: { alunoId: u.id } });
      await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
      await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  describe('sem peso registrado', () => {
    /*
      A defesa central. Nesta altura o aluno nunca se pesou — e sem peso a
      fórmula do ACSM não tem como rodar. Assumir 70 kg erraria em 30% para
      quem pesa 100, e é essa pessoa que mais olha o número.
    */
    it('registra a atividade mas não estima caloria', async () => {
      const r = await registrar({
        tipo: 'CORRIDA',
        intensidade: 'MODERADA',
        duracaoMin: 30,
        data: hoje(),
      }).expect(201);

      expect(r.body.duracaoMin).toBe(30);
      expect(r.body.caloriasEstimadas).toBeNull();
    });

    it('o resumo diz que faltou o peso, em vez de mostrar zero', async () => {
      const r = await calorias().expect(200);
      expect(r.body.pesoUsadoKg).toBeNull();
      expect(r.body.cardio.kcal).toBeNull();
      expect(r.body.totalKcal).toBeNull();
      // Os minutos existem mesmo sem peso: o esforço aconteceu.
      expect(r.body.cardio.minutos).toBe(30);
    });
  });

  describe('com peso registrado', () => {
    beforeAll(async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/medidas`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ data: new Date().toISOString(), pesoKg: 70 })
        .expect(201);
    });

    /* 8,3 MET × 3,5 × 70 kg / 200 = 10,17 kcal/min × 30 = 305 → 310. */
    it('estima pela fórmula do ACSM e arredonda para dezenas', async () => {
      const r = await calorias().expect(200);
      expect(r.body.pesoUsadoKg).toBe(70);
      expect(r.body.cardio.kcal).toBe(310);
      expect(r.body.cardio.kcal % 10).toBe(0);
    });

    it('mais intensidade, mais caloria na mesma duração', async () => {
      const leve = await registrar({
        tipo: 'BICICLETA',
        intensidade: 'LEVE',
        duracaoMin: 20,
        data: hoje(),
      }).expect(201);
      const intensa = await registrar({
        tipo: 'BICICLETA',
        intensidade: 'INTENSA',
        duracaoMin: 20,
        data: hoje(),
      }).expect(201);

      expect(intensa.body.caloriasEstimadas).toBeGreaterThan(leve.body.caloriasEstimadas);
    });

    /*
      Separado porque responde a perguntas diferentes: cardio diz se a pessoa
      cumpriu o combinado fora da sala, musculação diz se o treino tem o volume
      prescrito. Num número só, nenhuma das duas dá para responder.
    */
    it('separa musculação de cardio no resumo', async () => {
      const r = await calorias().expect(200);
      expect(r.body).toHaveProperty('musculacao');
      expect(r.body).toHaveProperty('cardio');
      expect(r.body.cardio.sessoes).toBeGreaterThanOrEqual(3);
      expect(r.body.musculacao.sessoes).toBe(0);
    });
  });

  /*
    A separação de escopos deste módulo, verificada antes de qualquer número.
    O aluno autorizou só TREINO até aqui — e caloria é dado do corpo.
  */
  describe('o que o escopo de treino não abre', () => {
    it('sem EVOLUCAO, o profissional não vê o resumo calórico', async () => {
      await calorias(tokenPersonal).expect(403);
    });

    /*
      A caloria por atividade se inverte para peso com uma divisão — o tipo, a
      intensidade e a duração vêm na mesma resposta. Entregá-la a quem só
      autorizou treino seria entregar o peso por caminho indireto.
    */
    it('sem EVOLUCAO, a lista vem sem a caloria de cada atividade', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/medidas`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ data: new Date().toISOString(), pesoKg: 70 })
        .expect(201);
      await registrar({ tipo: 'CORRIDA', duracaoMin: 30, data: hoje() }).expect(201);

      const doProfissional = await request(servidor)
        .get(url(`/alunos/${idAluno}/cardio?dias=30`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
      expect(doProfissional.body[0].caloriasEstimadas).toBeNull();
      // A atividade em si continua visível: ela é treino.
      expect(doProfissional.body[0].duracaoMin).toBe(30);

      // O próprio aluno vê tudo do próprio corpo, sempre.
      const doAluno = await request(servidor)
        .get(url(`/alunos/${idAluno}/cardio?dias=30`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);
      expect(doAluno.body[0].caloriasEstimadas).toBeGreaterThan(0);

      // A partir daqui os demais testes precisam do escopo de evolução.
      await request(servidor)
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ escopo: 'EVOLUCAO' })
        .expect(201);
    });
  });


  describe('gasto do corpo existindo', () => {
    /*
      Sem altura e sexo no perfil, a Mifflin-St Jeor não roda. O peso sozinho
      serve para a queima do exercício, mas não para a taxa basal — e a tela
      precisa dizer o que falta em vez de mostrar um número assumido.
    */
    it('sem altura e sexo, não estima a taxa basal e diz o que falta', async () => {
      const r = await calorias().expect(200);
      expect(r.body.gastoDiario.tmb).toBeNull();
      expect(r.body.gastoDiario.faltando).toContain('sexo biológico');
      // A queima do exercício continua: ela não depende desses campos.
      expect(r.body.cardio.kcal).toBeGreaterThan(0);
    });

    /*
      A regra que faz o app não precisar do sexo: havendo massa magra medida,
      a Katch-McArdle assume — ela usa o tecido que gasta energia em vez de
      adivinhá-lo pelo sexo.
    */
    it('com massa magra medida, usa Katch-McArdle sem precisar de sexo', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/medidas`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ data: new Date().toISOString(), pesoKg: 70, massaMagraKg: 55 })
        .expect(201);

      const r = await calorias().expect(200);
      // 370 + 21,6 × 55 = 1558
      expect(r.body.gastoDiario.tmb).toBe(1558);
      expect(r.body.gastoDiario.formula).toBe('KATCH_MCARDLE');
      expect(r.body.gastoDiario.faltando).toEqual([]);
    });

    /*
      O total do dia é a TMB × 1,2 mais o exercício registrado. O 1,2 é só a
      vida cotidiana: a tabela clássica de atividade já embute o treino, e
      usá-la aqui contaria o exercício duas vezes.
    */
    it('soma cotidiano e exercício sem contar o treino duas vezes', async () => {
      const r = await calorias().expect(200);
      const g = r.body.gastoDiario;

      expect(g.cotidiano).toBe(Math.round((1558 * 1.2) / 10) * 10);
      expect(g.totalPorDia).toBe(g.cotidiano + g.exercicioPorDia);
    });
  });

  describe('calorimetria indireta', () => {
    const hojeMenos = (meses: number) => {
      const d = new Date();
      d.setMonth(d.getMonth() - meses);
      return d.toISOString().slice(0, 10);
    };

    /*
      Medição vence cálculo. A esta altura o aluno tem massa magra medida — e
      mesmo assim a calorimetria assume, porque ela é a referência contra a
      qual a Katch-McArdle foi validada.
    */
    it('vence a Katch-McArdle quando existe e vale', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/calorimetrias`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ data: hojeMenos(1), tmbMedidaKcal: 1720, pesoNoExameKg: 70 })
        .expect(201);

      const r = await calorias().expect(200);
      expect(r.body.gastoDiario.tmb).toBe(1720);
      expect(r.body.gastoDiario.formula).toBe('CALORIMETRIA');
    });

    it('o profissional também lança o exame', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/calorimetrias`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ data: hojeMenos(0), tmbMedidaKcal: 1700, equipamento: 'Laboratório X' })
        .expect(201);
    });

    it('a listagem traz a validade calculada', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/calorimetrias`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThanOrEqual(2);
      expect(r.body[0].validade.valida).toBe(true);
      expect(r.body[0].registradoPor.nome).toBeTruthy();
    });

    it('recusa valor fora da faixa fisiológica', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/calorimetrias`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        // Um zero a mais aqui contaminaria todo o planejamento alimentar.
        .send({ data: hojeMenos(0), tmbMedidaKcal: 17000 })
        .expect(422);
    });
  });

  describe('quem escreve', () => {
    /*
      Cardio lançado pelo profissional deixaria de dizer o que a pessoa fez e
      passaria a dizer o que ele acha que ela fez — e é sobre esse número que
      a caloria é calculada.
    */
    it('o profissional lê mas não registra', async () => {
      await calorias(tokenPersonal).expect(200);
      await registrar(
        { tipo: 'CORRIDA', duracaoMin: 20, data: hoje() },
        tokenPersonal,
      ).expect(403);
    });

    it('sem vínculo não lê', async () => {
      const estranho = await criarAlunoVerificado(servidor, {
        nome: 'Estranho Cardio',
        email: `estranho-cardio.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1990-01-01',
      });

      await calorias(estranho.accessToken).expect(403);

      const u = await prisma.user.findUnique({
        where: { email: `estranho-cardio.${sufixo}@exemplo.com` },
      });
      if (u) {
        await prisma.logAuditoria.deleteMany({
          where: { OR: [{ alunoId: u.id }, { atorId: u.id }] },
        });
        await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
        await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    });
  });

  describe('validação', () => {
    it('recusa duração zero — atividade de zero minuto não aconteceu', async () => {
      await registrar({ tipo: 'CORRIDA', duracaoMin: 0, data: hoje() }).expect(422);
    });

    it('recusa tipo que não existe', async () => {
      await registrar({ tipo: 'TELETRANSPORTE', duracaoMin: 20, data: hoje() }).expect(422);
    });

    it('recusa cardio pendurado em treino de outra pessoa', async () => {
      await registrar({
        tipo: 'ESTEIRA',
        duracaoMin: 15,
        data: hoje(),
        execucaoId: 'cmsaaaaaaaaaaaaaaaaaaaaaa',
      }).expect(404);
    });
  });

  /**
   * Semana parada é resposta, não falta de dado.
   *
   * O contador da tela inicial mostra 24 h ao lado de 7 dias. Com `null` numa
   * janela sem atividade, ele exibia um travessão — e quem passou a semana
   * parado lia "não carregou" em vez de ler a própria semana parada. O número
   * que cobra é o zero.
   */
  describe('janela sem atividade nenhuma', () => {
    /* 0 dias para trás é uma janela que não alcança nem o cardio de hoje. */
    const janelaVazia = () =>
      request(servidor)
        .get(url(`/alunos/${idAluno}/cardio/calorias?dias=1`))
        .set('Authorization', `Bearer ${tokenAluno}`);

    it('sem sessões, o total é zero — e não travessão', async () => {
      await prisma.atividadeCardio.deleteMany({ where: { alunoId: idAluno } });
      await prisma.execucaoTreino.deleteMany({ where: { alunoId: idAluno } });

      const r = await janelaVazia().expect(200);

      expect(r.body.musculacao.sessoes).toBe(0);
      expect(r.body.cardio.sessoes).toBe(0);
      expect(r.body.musculacao.kcal).toBe(0);
      expect(r.body.cardio.kcal).toBe(0);
      expect(r.body.totalKcal).toBe(0);
    });

    /*
      A distinção que se protege: houve treino e não deu para estimar continua
      sendo `null`. Somar como zero afirmaria que a pessoa treinou de graça.
    */
    it('mas com sessão e sem peso continua null', async () => {
      await prisma.medida.deleteMany({ where: { alunoId: idAluno } });
      await registrar({ tipo: 'CORRIDA', duracaoMin: 30, data: hoje() }).expect(201);

      const r = await janelaVazia().expect(200);

      expect(r.body.pesoUsadoKg).toBeNull();
      expect(r.body.cardio.sessoes).toBe(1);
      expect(r.body.cardio.kcal).toBeNull();
      expect(r.body.totalKcal).toBeNull();
    });
  });
});
