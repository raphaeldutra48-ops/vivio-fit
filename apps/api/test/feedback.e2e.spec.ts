import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Área de feedback do profissional.
 *
 * O aluno já respondia dificuldade, dor e comentário ao fechar o treino, e
 * isso ficava guardado sem ninguém ler. Aqui o que se protege é a **ordem de
 * leitura** — dor não pode ser enterrada por elogio recente — e o **recorte de
 * consentimento**: feedback é dado de treino.
 */
describe('Feedback pós-treino do profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailFalante = `feedback.falante.${sufixo}@exemplo.com`;
  const emailCalado = `feedback.calado.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let idFalante: string;
  let idCalado: string;
  /** Cada aluno com a sessão do próprio plano — treino de um não pertence ao outro. */
  const sessaoDe = new Map<string, string>();

  const buscar = (query = '') =>
    request(servidor).get(url(`/feedback${query}`)).set('Authorization', `Bearer ${tokenPersonal}`);

  /** Grava execução com feedback direto no banco: precisa de data no passado. */
  const treinar = (
    alunoId: string,
    diasAtras: number,
    feedback: {
      dificuldade: number;
      teveDor?: boolean;
      localDor?: string;
      comentario?: string;
    },
  ) => {
    const quando = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
    return prisma.execucaoTreino.create({
      data: {
        alunoId,
        sessaoId: sessaoDe.get(alunoId)!,
        clienteUuid: crypto.randomUUID(),
        iniciadoEm: quando,
        finalizadoEm: new Date(quando.getTime() + 45 * 60 * 1000),
        duracaoSeg: 45 * 60,
        // Sem séries de propósito: a área de feedback não lê nenhuma, e criá-las
        // aqui só acrescentaria dois `connect` que nenhuma asserção usa.
        feedback: {
          create: {
            dificuldade: feedback.dificuldade,
            teveDor: feedback.teveDor ?? false,
            localDor: feedback.localDor ?? null,
            comentario: feedback.comentario ?? null,
          },
        },
      },
    });
  };

  const vincular = async (email: string, comConsentimento: boolean) => {
    const conta = await criarAlunoVerificado(servidor, {
      nome: email.startsWith('feedback.falante') ? 'Aluno Falante' : 'Aluno Calado',
      email,
      senha,
      dataNascimento: '1992-03-03',
    });

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${conta.accessToken}`)
      .expect(200);

    if (comConsentimento) {
      await request(servidor)
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${conta.accessToken}`)
        .send({ escopo: 'TREINO' })
        .expect(201);
    }
    return conta.usuario.id as string;
  };

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

    idFalante = await vincular(emailFalante, true);
    // Vinculado, mas sem autorizar treino: o feedback dele não pode aparecer.
    idCalado = await vincular(emailCalado, false);

    const exercicio = await prisma.exercicio.findFirstOrThrow({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });
    const planoDoFalante = await request(servidor)
      .post(url(`/alunos/${idFalante}/planos-treino`))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({
        nome: `Plano de feedback ${sufixo}`,
        ativar: true,
        sessoes: [
          {
            nome: 'Treino de teste',
            itens: [{ exercicioId: exercicio.id, series: 1, repsAlvo: '10', cargaSugeridaKg: 40 }],
          },
        ],
      })
      .expect(201);
    sessaoDe.set(idFalante, planoDoFalante.body.sessoes[0].id);

    /*
      O plano do Calado nasce direto no banco porque a API — corretamente — não
      deixa o personal montar treino para quem não autorizou o escopo TREINO.
      Ele existe só para dar ao feedback dele um treino de verdade a que se
      prender; o teste é sobre esse feedback não vazar.
    */
    const planoDoCalado = await prisma.planoTreino.create({
      data: {
        alunoId: idCalado,
        personalId: (await prisma.user.findUniqueOrThrow({
          where: { email: 'personal@viviofit.com.br' },
        })).id,
        nome: `Plano do calado ${sufixo}`,
        sessoes: { create: [{ nome: 'Treino de teste', ordem: 1 }] },
      },
      include: { sessoes: true },
    });
    sessaoDe.set(idCalado, planoDoCalado.sessoes[0]!.id);

    /*
      Linha do tempo do Falante, do mais antigo ao mais recente. Duas dores
      seguidas no meio e um treino tranquilo hoje: é a combinação que faz a
      ordenação por data mostrar a coisa errada primeiro.
    */
    await treinar(idFalante, 9, { dificuldade: 3 });
    await treinar(idFalante, 6, { dificuldade: 4, teveDor: true, localDor: 'ombro direito' });
    await treinar(idFalante, 4, { dificuldade: 5, teveDor: true, localDor: 'ombro direito' });
    await treinar(idFalante, 2, { dificuldade: 1, comentario: 'achei leve demais' });
    await treinar(idFalante, 0, { dificuldade: 3 });

    await treinar(idCalado, 1, { dificuldade: 5, teveDor: true, comentario: 'doeu muito' });
  });

  const apagarConta = async (email: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
    await prisma.execucaoTreino.deleteMany({ where: { alunoId: u.id } });
    await prisma.planoTreino.deleteMany({ where: { alunoId: u.id } });
    await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
    await prisma.vinculo.deleteMany({ where: { OR: [{ alunoId: u.id }, { profissionalId: u.id }] } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
    await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  };

  afterAll(async () => {
    await apagarConta(emailFalante);
    await apagarConta(emailCalado);
    await app.close();
  });

  const doFalante = (corpo: { linhas: { aluno: { id: string } }[] }) =>
    corpo.linhas.filter((l) => l.aluno.id === idFalante);

  describe('o que chega', () => {
    it('traz os cinco treinos do aluno que autorizou', async () => {
      const r = await buscar('?dias=14').expect(200);
      expect(doFalante(r.body)).toHaveLength(5);
    });

    /*
      A defesa principal do módulo. Feedback é dado de treino: sem o escopo
      TREINO, nem o comentário nem a dor podem aparecer — e a dor dele é
      justamente a mais grave da lista, o que torna o vazamento tentador.
    */
    it('não traz nada de quem não autorizou treino', async () => {
      const r = await buscar('?dias=14').expect(200);
      expect(r.body.linhas.some((l: { aluno: { id: string } }) => l.aluno.id === idCalado)).toBe(
        false,
      );
    });
  });

  describe('ordem de leitura', () => {
    /*
      Ordenar por data poria "hoje, na medida" no topo e a dor de seis dias
      atrás na terceira rolagem. É o contrário do que o profissional precisa.
    */
    it('a dor com sequência mais longa vem primeiro, não o treino de hoje', async () => {
      const r = await buscar('?dias=14').expect(200);
      const linhas = doFalante(r.body) as {
        teveDor: boolean;
        sequenciaDeDor: number | null;
        dificuldade: number;
      }[];

      expect(linhas[0].teveDor).toBe(true);
      expect(linhas[0].sequenciaDeDor).toBe(2);
      expect(linhas[1].sequenciaDeDor).toBe(1);
      // Só depois das duas dores é que entra o "leve demais".
      expect(linhas[2].dificuldade).toBe(1);
    });

    it('o treino tranquilo fica por último', async () => {
      const r = await buscar('?dias=14').expect(200);
      const linhas = doFalante(r.body) as { teveDor: boolean; dificuldade: number }[];
      const ultima = linhas[linhas.length - 1];
      expect(ultima.teveDor).toBe(false);
      expect(ultima.dificuldade).toBe(3);
    });
  });

  describe('sequência de dor', () => {
    /*
      A folga de busca existe para isto: com filtro de 5 dias, a dor do dia 4
      continua sendo a segunda seguida — porque a do dia 6 aconteceu, mesmo
      fora da janela. Sem a folga ela apareceria como "primeira vez", que é a
      leitura que faz não agir.
    */
    it('a janela curta não reseta a contagem', async () => {
      const r = await buscar('?dias=5').expect(200);
      const linhas = doFalante(r.body) as { teveDor: boolean; sequenciaDeDor: number | null }[];

      const comDor = linhas.filter((l) => l.teveDor);
      expect(comDor).toHaveLength(1);
      expect(comDor[0].sequenciaDeDor).toBe(2);
    });
  });

  describe('filtro de atenção', () => {
    it('conta quantas linhas pedem conduta', async () => {
      const r = await buscar('?dias=14').expect(200);
      // Duas dores e um "leve demais com comentário"; o de 9 dias e o de hoje
      // estão na medida e sem comentário.
      expect(r.body.precisamDeOlhar).toBeGreaterThanOrEqual(3);
    });

    it('apenasAtencao esconde o que está bem', async () => {
      const r = await buscar('?dias=14&apenasAtencao=true').expect(200);
      const linhas = doFalante(r.body) as { teveDor: boolean; dificuldade: number }[];

      expect(linhas).toHaveLength(3);
      expect(linhas.every((l) => l.teveDor || l.dificuldade === 1 || l.dificuldade === 5)).toBe(
        true,
      );
    });

    /* O total continua contando tudo: o filtro é da vista, não do período. */
    it('o total não muda com o filtro', async () => {
      const tudo = await buscar('?dias=14').expect(200);
      const soAtencao = await buscar('?dias=14&apenasAtencao=true').expect(200);
      expect(soAtencao.body.total).toBe(tudo.body.total);
    });
  });

  describe('validação', () => {
    it('recusa período fora da faixa', async () => {
      await buscar('?dias=0').expect(422);
      await buscar('?dias=365').expect(422);
    });

    it('sem parâmetro, usa 14 dias', async () => {
      const r = await buscar().expect(200);
      expect(r.body.dias).toBe(14);
    });
  });

  describe('quem pode ver', () => {
    it('aluno não abre a área do profissional', async () => {
      const login = await request(servidor)
        .post(url('/auth/login'))
        .send({ email: emailFalante, senha });

      await request(servidor)
        .get(url('/feedback'))
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });
  });
});
