import type {
  AcessoRegistrado,
  ConcederConsentimentoInput,
  ConsentimentoResumo,
  ConsultaAuditoria,
  EscopoDado,
  LoginInput,
  MedidaResumo,
  ParDeTokens,
  RegistrarAlunoInput,
  RegistrarMedidaInput,
  RegistrarProfissionalInput,
  RespostaAutenticacao,
  ResumoAluno,
  StatusVinculo,
  UsuarioAutenticado,
  VinculoResumo,
} from '@vivio/contracts';
import { ErroApi } from './erro';

export interface TokensArmazenados {
  accessToken: string;
  refreshToken: string;
}

export interface OpcoesCliente {
  baseUrl: string;
  /** Lê os tokens de onde o app guarda (localStorage, SecureStore...). */
  carregarTokens?: () => TokensArmazenados | null | Promise<TokensArmazenados | null>;
  /** Chamado sempre que um par novo é emitido — o app persiste. */
  aoAtualizarTokens?: (tokens: ParDeTokens) => void | Promise<void>;
  /** Chamado quando a sessão morreu de vez e o usuário precisa logar de novo. */
  aoPerderSessao?: () => void | Promise<void>;
  fetch?: typeof fetch;
}

interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  corpo?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  autenticada?: boolean;
  /** Uso interno: evita laço infinito de refresh. */
  jaTentouRenovar?: boolean;
}

/**
 * Cliente HTTP tipado do Vívio Fit. Usado por web e mobile.
 *
 * Renova o access token automaticamente: numa resposta 401 ele tenta o refresh
 * uma única vez e repete a requisição original. A tela não precisa saber que
 * o token de 15 minutos expirou.
 */
export class VivioClient {
  private tokens: TokensArmazenados | null = null;
  private renovacaoEmCurso: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opcoes: OpcoesCliente) {
    this.fetchImpl = opcoes.fetch ?? globalThis.fetch.bind(globalThis);
  }

  definirTokens(tokens: TokensArmazenados | null): void {
    this.tokens = tokens;
  }

  private async obterTokens(): Promise<TokensArmazenados | null> {
    if (this.tokens) return this.tokens;
    const carregados = (await this.opcoes.carregarTokens?.()) ?? null;
    this.tokens = carregados;
    return carregados;
  }

  private async guardar(par: ParDeTokens): Promise<void> {
    this.tokens = { accessToken: par.accessToken, refreshToken: par.refreshToken };
    await this.opcoes.aoAtualizarTokens?.(par);
  }

  /**
   * Renova o par. Concorrência importa: se cinco requisições receberem 401 ao
   * mesmo tempo e cada uma tentar renovar, quatro vão reapresentar um refresh
   * já usado — e o backend, corretamente, derruba a sessão inteira por suspeita
   * de vazamento. Por isso a renovação é compartilhada.
   */
  private async renovar(): Promise<boolean> {
    if (this.renovacaoEmCurso) return this.renovacaoEmCurso;

    this.renovacaoEmCurso = (async () => {
      const atuais = await this.obterTokens();
      if (!atuais?.refreshToken) return false;
      try {
        const par = await this.requisicao<ParDeTokens>('/auth/refresh', {
          metodo: 'POST',
          corpo: { refreshToken: atuais.refreshToken },
          autenticada: false,
          jaTentouRenovar: true,
        });
        await this.guardar(par);
        return true;
      } catch {
        this.tokens = null;
        await this.opcoes.aoPerderSessao?.();
        return false;
      } finally {
        this.renovacaoEmCurso = null;
      }
    })();

    return this.renovacaoEmCurso;
  }

  private async requisicao<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
    const { metodo = 'GET', corpo, query, autenticada = true, jaTentouRenovar = false } = opcoes;

    const url = new URL(`${this.opcoes.baseUrl.replace(/\/$/, '')}/api/v1${caminho}`);
    for (const [chave, valor] of Object.entries(query ?? {})) {
      if (valor !== undefined) url.searchParams.set(chave, String(valor));
    }

    const cabecalhos: Record<string, string> = {};
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (autenticada) {
      const tokens = await this.obterTokens();
      if (tokens) cabecalhos['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    let resposta: Response;
    try {
      resposta = await this.fetchImpl(url.toString(), {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (erro) {
      throw new ErroApi(
        'ERRO_DE_REDE',
        'Não foi possível conectar. Verifique sua internet.',
        0,
        { causa: String(erro) },
      );
    }

    if (resposta.status === 401 && autenticada && !jaTentouRenovar) {
      if (await this.renovar()) {
        return this.requisicao<T>(caminho, { ...opcoes, jaTentouRenovar: true });
      }
    }

    if (resposta.status === 204) return undefined as T;

    const texto = await resposta.text();
    const dados: unknown = texto ? JSON.parse(texto) : null;

    if (!resposta.ok) {
      const envelope = dados as {
        erro?: { codigo: string; mensagem: string; detalhes?: Record<string, unknown> };
      };
      throw new ErroApi(
        (envelope?.erro?.codigo ?? 'ERRO_INTERNO') as never,
        envelope?.erro?.mensagem ?? 'Erro inesperado.',
        resposta.status,
        envelope?.erro?.detalhes,
      );
    }

    return dados as T;
  }

  // --- auth ---------------------------------------------------------------

  readonly auth = {
    registrarAluno: async (dados: RegistrarAlunoInput): Promise<RespostaAutenticacao> => {
      const r = await this.requisicao<RespostaAutenticacao>('/auth/registrar/aluno', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      });
      await this.guardar(r);
      return r;
    },

    registrarProfissional: async (
      dados: RegistrarProfissionalInput,
    ): Promise<RespostaAutenticacao> => {
      const r = await this.requisicao<RespostaAutenticacao>('/auth/registrar/profissional', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      });
      await this.guardar(r);
      return r;
    },

    login: async (dados: LoginInput): Promise<RespostaAutenticacao> => {
      const r = await this.requisicao<RespostaAutenticacao>('/auth/login', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      });
      await this.guardar(r);
      return r;
    },

    logout: async (): Promise<void> => {
      const tokens = await this.obterTokens();
      if (tokens?.refreshToken) {
        await this.requisicao<void>('/auth/logout', {
          metodo: 'POST',
          corpo: { refreshToken: tokens.refreshToken },
          autenticada: false,
        });
      }
      this.tokens = null;
    },
  };

  // --- usuário ------------------------------------------------------------

  readonly me = {
    obter: (): Promise<UsuarioAutenticado> => this.requisicao<UsuarioAutenticado>('/me'),
  };

  // --- vínculos -----------------------------------------------------------

  readonly vinculos = {
    convidar: (email: string): Promise<VinculoResumo> =>
      this.requisicao<VinculoResumo>('/vinculos/convidar', { metodo: 'POST', corpo: { email } }),

    aceitar: (id: string): Promise<VinculoResumo> =>
      this.requisicao<VinculoResumo>(`/vinculos/${id}/aceitar`, { metodo: 'PATCH' }),

    recusar: (id: string): Promise<VinculoResumo> =>
      this.requisicao<VinculoResumo>(`/vinculos/${id}/recusar`, { metodo: 'PATCH' }),

    encerrar: (id: string): Promise<VinculoResumo> =>
      this.requisicao<VinculoResumo>(`/vinculos/${id}/encerrar`, { metodo: 'PATCH' }),

    meusAlunos: (status?: StatusVinculo): Promise<VinculoResumo[]> =>
      this.requisicao<VinculoResumo[]>('/vinculos/meus-alunos', { query: { status } }),

    meusProfissionais: (): Promise<VinculoResumo[]> =>
      this.requisicao<VinculoResumo[]>('/vinculos/meus-profissionais'),
  };

  // --- alunos -------------------------------------------------------------

  readonly alunos = {
    resumo: (alunoId: string): Promise<ResumoAluno> =>
      this.requisicao<ResumoAluno>(`/alunos/${alunoId}/resumo`),
  };

  // --- consentimentos -----------------------------------------------------

  readonly consentimentos = {
    listar: (incluirRevogados = false): Promise<ConsentimentoResumo[]> =>
      this.requisicao<ConsentimentoResumo[]>('/consentimentos', {
        query: { incluirRevogados: incluirRevogados ? 'true' : undefined },
      }),

    conceder: (dados: ConcederConsentimentoInput): Promise<ConsentimentoResumo> =>
      this.requisicao<ConsentimentoResumo>('/consentimentos', { metodo: 'POST', corpo: dados }),

    revogar: (id: string): Promise<void> =>
      this.requisicao<void>(`/consentimentos/${id}`, { metodo: 'DELETE' }),
  };

  // --- auditoria ----------------------------------------------------------

  readonly auditoria = {
    meusAcessos: (
      consulta: Partial<ConsultaAuditoria> = {},
    ): Promise<{ dados: AcessoRegistrado[]; proximoCursor: string | null }> =>
      this.requisicao('/auditoria/meus-acessos', {
        query: {
          cursor: consulta.cursor,
          limit: consulta.limit,
          escopo: consulta.escopo as EscopoDado | undefined,
        },
      }),
  };

  // --- medidas ------------------------------------------------------------

  readonly medidas = {
    listar: (alunoId: string): Promise<MedidaResumo[]> =>
      this.requisicao<MedidaResumo[]>(`/alunos/${alunoId}/medidas`),

    registrar: (alunoId: string, dados: RegistrarMedidaInput): Promise<MedidaResumo> =>
      this.requisicao<MedidaResumo>(`/alunos/${alunoId}/medidas`, {
        metodo: 'POST',
        corpo: dados,
      }),
  };
}
