import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarContaVerificada, url } from './apoio';

describe('Site profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const slug = `personal-teste-${sufixo}`;

  /** Verificado pelo seed — pode publicar. */
  let tokenPersonal: string;
  /** Cadastrado agora, sem verificação de conselho. */
  let tokenNaoVerificado: string;
  let idNaoVerificado: string;

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

    const novo = await criarContaVerificada(servidor, '/auth/registrar/profissional', {
      nome: 'Sem Verificação',
      email: `semverif.${sufixo}@exemplo.com`,
      senha,
      tipo: 'PERSONAL',
      registroConselho: `CREF ${sufixo}Z`,
      ufRegistro: 'SP',
    });
    tokenNaoVerificado = novo.accessToken;
    idNaoVerificado = novo.usuario.id;
  });

  afterAll(async () => {
    await prisma.perfilPublico.deleteMany({ where: { slug: { contains: sufixo } } });
    await prisma.perfilPublico.deleteMany({ where: { profissionalId: idNaoVerificado } });
    await prisma.perfilProfissional.deleteMany({ where: { userId: idNaoVerificado } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idNaoVerificado } });
    await prisma.user.deleteMany({ where: { id: idNaoVerificado } });
    await app.close();
  });

  const pagina = {
    slug,
    titulo: 'Treino que cabe na sua rotina',
    apresentacao: 'Atendo iniciantes e pessoas voltando de lesão.',
    cidade: 'Fortaleza',
    uf: 'ce',
    atendeOnline: true,
    atendePresencial: true,
    whatsapp: '85999998888',
    instagram: '@personal',
  };

  describe('publicação', () => {
    /** A regra central: página pública sem verificação empresta credibilidade. */
    it('não verificado não publica, mas pode salvar rascunho', async () => {
      const publicar = await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenNaoVerificado}`)
        .send({ ...pagina, slug: `rascunho-${sufixo}`, publicado: true })
        .expect(409);
      expect(publicar.body.erro.mensagem).toContain('conselho');

      const rascunho = await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenNaoVerificado}`)
        .send({ ...pagina, slug: `rascunho-${sufixo}`, publicado: false })
        .expect(200);
      expect(rascunho.body.publicado).toBe(false);
    });

    it('verificado publica', async () => {
      const r = await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ ...pagina, publicado: true })
        .expect(200);

      expect(r.body.publicado).toBe(true);
      expect(r.body.uf).toBe('CE');
      // Arroba do Instagram é do jeito de escrever, não do dado.
      expect(r.body.instagram).toBe('personal');
    });

    it('endereço reservado é recusado', async () => {
      const r = await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ ...pagina, slug: 'admin' })
        .expect(409);

      expect(r.body.erro.mensagem).toContain('reservado');
    });

    it('endereço já usado por outro é recusado', async () => {
      const r = await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenNaoVerificado}`)
        .send({ ...pagina, slug, publicado: false })
        .expect(409);

      expect(r.body.erro.mensagem).toContain('já está em uso');
    });

    it('endereço com espaço ou acento é recusado', async () => {
      await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ ...pagina, slug: 'Personal Teste' })
        .expect(422);
    });
  });

  describe('página pública', () => {
    it('abre sem autenticação e mostra o registro no conselho', async () => {
      const r = await request(servidor).get(url(`/p/${slug}`)).expect(200);

      expect(r.body.titulo).toBe(pagina.titulo);
      expect(r.body.profissional.nome).toBeTruthy();
      expect(r.body.profissional.registroConselho).toBeTruthy();
      // Nada que não foi escolhido para publicação.
      expect(r.body.profissional.email).toBeUndefined();
      expect(r.body.id).toBeUndefined();
    });

    it('página de quem não verificou não existe', async () => {
      await request(servidor).get(url(`/p/rascunho-${sufixo}`)).expect(404);
    });

    it('despublicar tira do ar sem apagar', async () => {
      await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ ...pagina, publicado: false })
        .expect(200);

      await request(servidor).get(url(`/p/${slug}`)).expect(404);

      const meu = await request(servidor)
        .get(url('/site'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
      expect(meu.body.titulo).toBe(pagina.titulo);

      // Republica para os testes seguintes.
      await request(servidor)
        .put(url('/site'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ ...pagina, publicado: true })
        .expect(200);
    });
  });

  describe('pedidos de contato', () => {
    it('qualquer pessoa envia pelo formulário', async () => {
      await request(servidor)
        .post(url(`/p/${slug}/contato`))
        .send({
          nome: 'Interessada Silva',
          email: 'INTERESSADA@Exemplo.com',
          telefone: '85988887777',
          mensagem: 'Quero começar a treinar.',
        })
        .expect(204);
    });

    it('página fora do ar não recebe pedido', async () => {
      await request(servidor)
        .post(url(`/p/rascunho-${sufixo}/contato`))
        .send({ nome: 'Alguém', email: 'alguem@exemplo.com' })
        .expect(404);
    });

    it('e-mail inválido é recusado', async () => {
      await request(servidor)
        .post(url(`/p/${slug}/contato`))
        .send({ nome: 'Alguém', email: 'nao-e-email' })
        .expect(422);
    });

    it('o profissional vê o pedido, com e-mail normalizado', async () => {
      const r = await request(servidor)
        .get(url('/site/pedidos'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const pedido = r.body.find((p: { nome: string }) => p.nome === 'Interessada Silva');
      expect(pedido).toBeDefined();
      expect(pedido.email).toBe('interessada@exemplo.com');
      expect(pedido.atendidoEm).toBeNull();
    });

    it('marcar como atendido alterna', async () => {
      const lista = await request(servidor)
        .get(url('/site/pedidos'))
        .set('Authorization', `Bearer ${tokenPersonal}`);
      const id = lista.body.find((p: { nome: string }) => p.nome === 'Interessada Silva').id;

      await request(servidor)
        .patch(url(`/site/pedidos/${id}/atendido`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(204);

      const depois = await request(servidor)
        .get(url('/site/pedidos'))
        .set('Authorization', `Bearer ${tokenPersonal}`);
      expect(depois.body.find((p: { id: string }) => p.id === id).atendidoEm).toBeTruthy();
    });

    it('um profissional não vê pedido do outro', async () => {
      const r = await request(servidor)
        .get(url('/site/pedidos'))
        .set('Authorization', `Bearer ${tokenNaoVerificado}`)
        .expect(200);

      expect(r.body.some((p: { nome: string }) => p.nome === 'Interessada Silva')).toBe(false);
    });
  });
});
