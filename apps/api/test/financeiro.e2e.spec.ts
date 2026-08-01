import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

describe('Financeiro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenPersonal: string;
  let tokenNutri: string;
  let tokenAluno: string;
  let idAluno: string;
  let idEstranho: string;

  /** Mês de referência fixo, à frente, para não colidir com dados existentes. */
  const MES = '2027-03';

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

    const email = `financeiro.${sufixo}@exemplo.com`;
    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Pagante',
      email,
      senha,
      dataNascimento: '1990-06-06',
    });
    idAluno = aluno.usuario.id;
    tokenAluno = aluno.accessToken;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);

    const estranho = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Sem Vínculo',
      email: `semvinculo.${sufixo}@exemplo.com`,
      senha,
      dataNascimento: '1991-07-07',
    });
    idEstranho = estranho.usuario.id;
  });

  afterAll(async () => {
    const ids = [idAluno, idEstranho];
    await prisma.cobranca.deleteMany({ where: { alunoId: { in: ids } } });
    await prisma.vinculo.deleteMany({ where: { alunoId: { in: ids } } });
    await prisma.perfilAluno.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('quem pode cobrar', () => {
    it('o aluno não acessa o financeiro', async () => {
      await request(servidor)
        .get(url('/financeiro'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(403);
    });

    it('não cobra quem não é seu aluno', async () => {
      const r = await request(servidor)
        .post(url('/financeiro/cobrancas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          alunoId: idEstranho,
          descricao: 'Mensalidade',
          valorCentavos: 15000,
          vencimento: `${MES}-10`,
        })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });
  });

  describe('parcelas', () => {
    let idPrimeira: string;

    it('gera as parcelas dos meses seguintes de uma vez', async () => {
      const r = await request(servidor)
        .post(url('/financeiro/cobrancas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          alunoId: idAluno,
          descricao: `Mensalidade ${sufixo}`,
          valorCentavos: 15000,
          vencimento: `${MES}-10`,
          repetirMeses: 3,
        })
        .expect(201);

      expect(r.body).toHaveLength(3);
      expect(r.body.map((c: { vencimento: string }) => c.vencimento)).toEqual([
        '2027-03-10',
        '2027-04-10',
        '2027-05-10',
      ]);
      idPrimeira = r.body[0].id;
    });

    /** Dia 31 em fevereiro não existe: a data prende no último dia do mês. */
    it('vencimento no dia 31 não pula para o mês seguinte', async () => {
      const r = await request(servidor)
        .post(url('/financeiro/cobrancas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          alunoId: idAluno,
          descricao: `Dia 31 ${sufixo}`,
          valorCentavos: 10000,
          vencimento: '2027-01-31',
          repetirMeses: 3,
        })
        .expect(201);

      expect(r.body.map((c: { vencimento: string }) => c.vencimento)).toEqual([
        '2027-01-31',
        '2027-02-28',
        '2027-03-31',
      ]);
    });

    it('registra o pagamento', async () => {
      const r = await request(servidor)
        .patch(url(`/financeiro/cobrancas/${idPrimeira}/pagar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ pagaEm: `${MES}-08`, formaPagamento: 'PIX' })
        .expect(200);

      expect(r.body.situacao).toBe('PAGA');
      expect(r.body.pagaEm).toBe('2027-03-08');
    });

    it('pagar duas vezes é recusado', async () => {
      await request(servidor)
        .patch(url(`/financeiro/cobrancas/${idPrimeira}/pagar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ formaPagamento: 'PIX' })
        .expect(409);
    });

    it('estorna o que foi pago por engano', async () => {
      const r = await request(servidor)
        .patch(url(`/financeiro/cobrancas/${idPrimeira}/estornar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.situacao).toBe('PENDENTE');
      expect(r.body.pagaEm).toBeNull();
      expect(r.body.formaPagamento).toBeNull();
    });

    it('cobrança paga não pode ser cancelada sem estornar', async () => {
      await request(servidor)
        .patch(url(`/financeiro/cobrancas/${idPrimeira}/pagar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ formaPagamento: 'DINHEIRO' })
        .expect(200);

      const r = await request(servidor)
        .patch(url(`/financeiro/cobrancas/${idPrimeira}/cancelar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(409);

      expect(r.body.erro.mensagem).toContain('Estorne');
    });
  });

  describe('PIX', () => {
    let idParaPix: string;
    /** Mês próprio: pagar aqui não pode mexer nos totais que o resumo afere. */
    const MES_DO_PIX = '2027-09';

    it('sem chave cadastrada, avisa antes de gerar', async () => {
      const criada = await request(servidor)
        .post(url('/financeiro/cobrancas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          alunoId: idAluno,
          descricao: `Para PIX ${sufixo}`,
          valorCentavos: 9990,
          vencimento: `${MES_DO_PIX}-20`,
        })
        .expect(201);
      idParaPix = criada.body[0].id;

      await prisma.dadosDePagamento.deleteMany({
        where: { profissional: { email: 'personal@viviofit.com.br' } },
      });

      const r = await request(servidor)
        .get(url(`/financeiro/cobrancas/${idParaPix}/pix`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(409);
      expect(r.body.erro.mensagem).toContain('chave PIX');
    });

    it('chave malformada é recusada', async () => {
      const r = await request(servidor)
        .put(url('/financeiro/pagamento'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ tipoChave: 'CPF', chave: '123', recebedor: 'Diego', cidade: 'Fortaleza' })
        .expect(409);
      expect(r.body.erro.mensagem).toContain('11 dígitos');
    });

    it('salva a chave já normalizada', async () => {
      const r = await request(servidor)
        .put(url('/financeiro/pagamento'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          tipoChave: 'TELEFONE',
          chave: '(85) 99999-8888',
          recebedor: 'Diego Personal',
          cidade: 'Fortaleza',
        })
        .expect(200);

      expect(r.body.chave).toBe('+5585999998888');
    });

    it('gera o código com o valor da cobrança', async () => {
      const r = await request(servidor)
        .get(url(`/financeiro/cobrancas/${idParaPix}/pix`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.brCode.startsWith('000201')).toBe(true);
      expect(r.body.brCode).toContain('br.gov.bcb.pix');
      expect(r.body.brCode).toContain('+5585999998888');
      // Campo 54 com tamanho 05: "99.90" tem 5 caracteres.
      expect(r.body.brCode).toContain('540599.90');
      expect(r.body.valorCentavos).toBe(9990);
    });

    it('cobrança paga não gera código', async () => {
      await request(servidor)
        .patch(url(`/financeiro/cobrancas/${idParaPix}/pagar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ formaPagamento: 'PIX' })
        .expect(200);

      await request(servidor)
        .get(url(`/financeiro/cobrancas/${idParaPix}/pix`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(409);
    });

    it('não gera código de cobrança de outro profissional', async () => {
      await request(servidor)
        .get(url(`/financeiro/cobrancas/${idParaPix}/pix`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(404);
    });
  });

  describe('resumo do mês', () => {
    it('separa recebido, a receber e atrasado', async () => {
      const r = await request(servidor)
        .get(url(`/financeiro?mes=${MES}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.mes).toBe(MES);
      // Uma paga (15000) e duas ainda a vencer neste mês: a de março 31 e nada mais.
      expect(r.body.recebidoCentavos).toBe(15000);
      expect(r.body.aReceberCentavos).toBeGreaterThan(0);
    });

    /** Vencimento no passado sem pagamento vira ATRASADA sem job nenhum. */
    it('conta como atrasada o que venceu e não foi pago', async () => {
      const ontem = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
      const mesPassado = ontem.slice(0, 7);

      await request(servidor)
        .post(url('/financeiro/cobrancas'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          alunoId: idAluno,
          descricao: `Atrasada ${sufixo}`,
          valorCentavos: 20000,
          vencimento: ontem,
        })
        .expect(201);

      const r = await request(servidor)
        .get(url(`/financeiro?mes=${mesPassado}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const alvo = r.body.cobrancas.find((c: { descricao: string }) =>
        c.descricao.includes('Atrasada'),
      );
      expect(alvo.situacao).toBe('ATRASADA');
      expect(alvo.diasDeAtraso).toBe(5);
      expect(r.body.atrasadoCentavos).toBeGreaterThanOrEqual(20000);
      expect(r.body.alunosEmAtraso).toBeGreaterThanOrEqual(1);
    });

    /** Filtrar por situação não pode zerar o total já recebido no mês. */
    it('o filtro muda a lista, não os totais', async () => {
      const r = await request(servidor)
        .get(url(`/financeiro?mes=${MES}&situacao=PENDENTE`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.cobrancas.every((c: { situacao: string }) => c.situacao === 'PENDENTE')).toBe(
        true,
      );
      expect(r.body.recebidoCentavos).toBe(15000);
    });

    it('cada profissional vê só as próprias cobranças', async () => {
      const r = await request(servidor)
        .get(url(`/financeiro?mes=${MES}`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(
        r.body.cobrancas.some((c: { descricao: string }) => c.descricao.includes(sufixo)),
      ).toBe(false);
    });

    it('mês em formato inválido é recusado', async () => {
      await request(servidor)
        .get(url('/financeiro?mes=marco'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(422);
    });
  });
});
