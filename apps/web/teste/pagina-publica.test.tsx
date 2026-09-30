import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A página pública do profissional — a única tela do sistema que um estranho
 * abre.
 *
 * Ela tem duas funções, e as duas eram frágeis pelo mesmo motivo: a tela falava
 * com certeza sobre coisas que não sabia.
 *
 * 1. **Existir.** Qualquer tropeço de rede dizia "Este endereço não existe ou
 *    saiu do ar" a um cliente em potencial. Não é um vazio inofensivo: é a
 *    plataforma afirmando que aquele profissional fechou as portas, a quem ele
 *    acabou de mandar o link. Só 404 é inexistência.
 * 2. **Receber contato.** Quem preenche o formulário não tem conta e não aceitou
 *    termo nenhum — está entregando nome, e-mail e telefone a duas partes: o
 *    profissional e a plataforma. Dizer isso antes do envio, com link da
 *    política, é o mínimo da LGPD e é o que permite decidir.
 */
const porSlug = vi.fn();
const enviarPedido = vi.fn();
const minhaPagina = vi.fn();
const listarPedidos = vi.fn();
const salvarPagina = vi.fn();
const marcarAtendido = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    site: {
      porSlug: (...a: unknown[]) => porSlug(...a),
      enviarPedido: (...a: unknown[]) => enviarPedido(...a),
      meu: (...a: unknown[]) => minhaPagina(...a),
      listarPedidos: (...a: unknown[]) => listarPedidos(...a),
      salvar: (...a: unknown[]) => salvarPagina(...a),
      marcarAtendido: (...a: unknown[]) => marcarAtendido(...a),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'diego-personal' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/p/diego-personal',
}));

/*
  A `PaginaPublica` como o contrato a define — o registro do conselho fica DENTRO
  de `profissional`, junto com a UF e as especialidades. Uma fixture inventada por
  fora não mostra menos: derruba o render, e a tela fica em branco.
*/
const pagina = (extras: Record<string, unknown> = {}) => ({
  slug: 'diego-personal',
  titulo: 'Treino que cabe na sua semana',
  apresentacao: 'Atendo presencial na zona sul e online.',
  cidade: 'São Paulo',
  uf: 'SP',
  atendeOnline: true,
  atendePresencial: true,
  whatsapp: '11999990000',
  instagram: null,
  profissional: {
    nome: 'Diego Personal',
    papel: 'PERSONAL',
    registroConselho: 'CREF 012345-G',
    ufRegistro: 'SP',
    especialidades: ['Hipertrofia', 'Emagrecimento'],
  },
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Publica } = await import('../app/p/[slug]/page');
  return render(<Publica />);
}

function preencher(nome: string, email: string): void {
  const campos = [...document.querySelectorAll('input')];
  fireEvent.change(campos[0]!, { target: { value: nome } });
  fireEvent.change(campos[1]!, { target: { value: email } });
}

/** A página como o painel a lê: tem `publicado`, que a pública não expõe. */
const minhaPaginaSalva = { ...pagina(), publicado: true };

vi.mock('../lib/sessao', () => ({
  useSessao: () => ({
    usuario: { id: 'prof-1', nome: 'Diego Personal', email: 'diego@exemplo.com', papel: 'PERSONAL' },
    carregando: false,
    entrar: vi.fn(),
    sair: vi.fn(),
  }),
}));

beforeEach(() => {
  porSlug.mockResolvedValue(pagina());
  enviarPedido.mockResolvedValue(undefined);
  minhaPagina.mockResolvedValue(minhaPaginaSalva);
  listarPedidos.mockResolvedValue([]);
  salvarPagina.mockImplementation((d: unknown) => Promise.resolve(d));
  marcarAtendido.mockResolvedValue(undefined);
});

describe('página pública: existir', () => {
  it('mostra quem é o profissional, com o registro do conselho', async () => {
    // O registro é o que diferencia um profissional de alguém que diz ser um.
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Diego Personal')).toBeInTheDocument());
    expect(textoDaTela()).toContain('CREF 012345-G');
    expect(textoDaTela()).toContain('Personal trainer');
  });

  it('404 diz que o endereço não existe', async () => {
    porSlug.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'não achou', 404));
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Página não encontrada')).toBeInTheDocument());
  });

  it('falha de rede NÃO diz que o profissional saiu do ar', async () => {
    /*
      O defeito que esta prova fixa. Dito a quem acabou de receber o link, isso
      encerra a conversa: a pessoa conclui que o profissional fechou e não volta.
    */
    porSlug.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para abrir esta página agora/i));
    expect(textoDaTela()).not.toMatch(/não existe ou saiu do ar/i);
    // E diz o contrário do que a mensagem antiga dizia: a página existe.
    expect(textoDaTela()).toMatch(/a página existe/i);
  });
});

describe('página pública: receber contato', () => {
  it('diz para onde vão os dados ANTES do envio, com link da política', async () => {
    /*
      Quem preenche não tem conta e não aceitou termo nenhum. Sem esta frase, a
      pessoa entrega telefone sem saber que ele fica guardado numa plataforma da
      qual nunca ouviu falar.
    */
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Diego Personal')).toBeInTheDocument());

    expect(textoDaTela()).toMatch(/seu nome e contato vão para diego personal/i);
    const link = [...document.querySelectorAll('a')].find((a) =>
      a.textContent?.match(/como tratamos seus dados/i),
    );
    expect(link?.getAttribute('href')).toMatch(/\/privacidade$/);
  });

  it('manda o contato sem espaço sobrando, e o opcional vazio não vira texto vazio', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Enviar contato')).toBeInTheDocument());

    preencher('  Ana Souza  ', ' ana@exemplo.com ');
    fireEvent.click(screen.getByText('Enviar contato'));

    await waitFor(() => expect(enviarPedido).toHaveBeenCalled());
    const [slug, corpo] = enviarPedido.mock.calls[0] as [string, Record<string, unknown>];
    expect(slug).toBe('diego-personal');
    expect(corpo).toMatchObject({ nome: 'Ana Souza', email: 'ana@exemplo.com' });
    // Telefone e mensagem em branco vão como ausência, não como string vazia.
    expect(corpo.telefone).toBeUndefined();
    expect(corpo.mensagem).toBeUndefined();
  });

  it('sem nome ou sem e-mail, não envia', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Enviar contato')).toBeInTheDocument());

    preencher('A', 'nao-e-email');

    expect(screen.getByText('Enviar contato')).toBeDisabled();
    expect(enviarPedido).not.toHaveBeenCalled();
  });

  it('enviado, confirma — e não deixa o formulário pedindo de novo', async () => {
    // Sem confirmação, a pessoa envia duas ou três vezes e o profissional recebe
    // o mesmo contato repetido.
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Enviar contato')).toBeInTheDocument());

    preencher('Ana Souza', 'ana@exemplo.com');
    fireEvent.click(screen.getByText('Enviar contato'));

    await waitFor(() => expect(screen.queryByText('Enviar contato')).not.toBeInTheDocument());
  });

  it('se o envio falhar, o contato não se perde em silêncio', async () => {
    /*
      A pessoa fechou a página achando que pediu contato, e o profissional nunca
      soube que ela existiu. É a falha mais cara desta tela, porque ninguém dos
      dois lados fica sabendo.
    */
    enviarPedido.mockRejectedValue(new Error('Failed to fetch'));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Enviar contato')).toBeInTheDocument());

    preencher('Ana Souza', 'ana@exemplo.com');
    fireEvent.click(screen.getByText('Enviar contato'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível enviar agora/i));
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
    // E o que ela escreveu continua na tela, para tentar de novo.
    expect((document.querySelectorAll('input')[0] as HTMLInputElement).value).toBe('Ana Souza');
  });

  it('sem WhatsApp cadastrado, a página não oferece um botão que não leva a lugar nenhum', async () => {
    // O contato por formulário continua; o que some é o atalho que abriria uma
    // conversa com número vazio.
    porSlug.mockResolvedValue(pagina({ whatsapp: null }));
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Diego Personal')).toBeInTheDocument());
    expect(screen.getByText('Enviar contato')).toBeInTheDocument();
    expect(textoDaTela().toLowerCase()).not.toContain('whatsapp');
  });
});

/*
  A outra ponta: a tela onde o profissional configura essa página e lê os
  pedidos de contato que chegaram por ela.
*/
describe('site profissional (painel)', () => {
  it('falha ao ler a página NÃO vira primeira visita', async () => {
    /*
      O defeito mais caro desta dupla, e o mais silencioso. Com `.catch(() =>
      null)`, a falha caía no ramo de primeira visita: a tela sugeria um endereço
      novo a partir do nome. Publicar depois disso trocaria a URL pública — e todo
      link já divulgado, no Instagram, no cartão, no WhatsApp, deixaria de abrir.
    */
    minhaPagina.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    const { default: Site } = await import('../app/(pro)/site-profissional/page');
    render(<Site />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível ler a sua página/i));
    // E o endereço sugerido NÃO aparece no campo.
    const endereco = [...document.querySelectorAll('input')].find((i) =>
      i.value.includes('diego'),
    );
    expect(endereco).toBeUndefined();
  });

  it('primeira visita de verdade (404) sugere endereço a partir do nome', async () => {
    minhaPagina.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'sem página', 404));
    const { default: Site } = await import('../app/(pro)/site-profissional/page');
    render(<Site />);

    await waitFor(() =>
      expect(
        [...document.querySelectorAll('input')].some((i) => i.value.includes('diego')),
      ).toBe(true),
    );
    expect(textoDaTela()).not.toMatch(/não foi possível ler a sua página/i);
  });

  it('falha ao listar pedidos NÃO vira "nenhum pedido ainda"', async () => {
    // Quem recebeu três contatos leria que ninguém procurou — e pararia de
    // divulgar a página por achar que ela não funciona.
    minhaPagina.mockResolvedValue(minhaPaginaSalva);
    listarPedidos.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    const { default: Site } = await import('../app/(pro)/site-profissional/page');
    render(<Site />);

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/não foi possível carregar os pedidos de contato/i),
    );
    expect(textoDaTela()).not.toMatch(/nenhum pedido ainda/i);
  });

  it('sem pedido nenhum, continua sugerindo divulgar', async () => {
    minhaPagina.mockResolvedValue(minhaPaginaSalva);
    listarPedidos.mockResolvedValue([]);
    const { default: Site } = await import('../app/(pro)/site-profissional/page');
    render(<Site />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum pedido ainda/i));
  });
});
