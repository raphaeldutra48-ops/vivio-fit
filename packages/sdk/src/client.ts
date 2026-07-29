import type {
  AcessoRegistrado,
  AnterioresDaSessao,
  AtualizarExercicioInput,
  AutorizacaoDeUpload,
  FotoEvolucaoResumo,
  HistoricoCarga,
  PedirUploadInput,
  RegistrarFotoInput,
  UrlAssinada,
  ConcederConsentimentoInput,
  CriarExercicioInput,
  CriarPlanoTreinoInput,
  ExecucaoResumo,
  ExercicioResumo,
  ListarExerciciosQuery,
  PlanoTreinoCompleto,
  PlanoTreinoResumo,
  ConsentimentoResumo,
  AlimentoResumo,
  ConsultaAuditoria,
  ConsultaEvolucao,
  CriarPlanoDietaInput,
  DefinirLembreteInput,
  DefinirMetaAguaInput,
  EvolucaoCorporal,
  ListarAlimentosQuery,
  PlanoDietaCompleto,
  PlanoDietaResumo,
  RegistrarAguaInput,
  RegistrarRefeicaoInput,
  ResumoDeAgua,
  SubstitutoSugerido,
  LembreteResumo,
  NotificacaoResumo,
  RegistrarDispositivoInput,
  EscopoDado,
  LoginInput,
  MedidaResumo,
  ParDeTokens,
  RegistrarAlunoInput,
  RegistrarExecucaoInput,
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

  // --- exercícios ---------------------------------------------------------

  readonly exercicios = {
    listar: (consulta: Partial<ListarExerciciosQuery> = {}): Promise<ExercicioResumo[]> =>
      this.requisicao<ExercicioResumo[]>('/exercicios', {
        query: { q: consulta.q, grupoMuscular: consulta.grupoMuscular, limit: consulta.limit },
      }),

    obter: (id: string): Promise<ExercicioResumo> =>
      this.requisicao<ExercicioResumo>(`/exercicios/${id}`),

    criar: (dados: CriarExercicioInput): Promise<ExercicioResumo> =>
      this.requisicao<ExercicioResumo>('/exercicios', { metodo: 'POST', corpo: dados }),

    atualizar: (id: string, dados: AtualizarExercicioInput): Promise<ExercicioResumo> =>
      this.requisicao<ExercicioResumo>(`/exercicios/${id}`, { metodo: 'PATCH', corpo: dados }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/exercicios/${id}`, { metodo: 'DELETE' }),

    /** Vincula ao exercício um vídeo já enviado via `midia.enviarArquivo`. */
    vincularVideo: (id: string, chave: string): Promise<ExercicioResumo> =>
      this.requisicao<ExercicioResumo>(`/exercicios/${id}/video`, {
        metodo: 'PATCH',
        corpo: { chave },
      }),

    urlDoVideo: (id: string): Promise<UrlAssinada> =>
      this.requisicao<UrlAssinada>(`/exercicios/${id}/video`),
  };

  // --- planos de treino ---------------------------------------------------

  readonly treinos = {
    listar: (alunoId: string): Promise<PlanoTreinoResumo[]> =>
      this.requisicao<PlanoTreinoResumo[]>(`/alunos/${alunoId}/planos-treino`),

    /** Payload completo do plano ativo — é o que o mobile guarda para o modo offline. */
    obterAtivo: (alunoId: string): Promise<PlanoTreinoCompleto> =>
      this.requisicao<PlanoTreinoCompleto>(`/alunos/${alunoId}/planos-treino/ativo`),

    obter: (alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> =>
      this.requisicao<PlanoTreinoCompleto>(`/alunos/${alunoId}/planos-treino/${planoId}`),

    criar: (alunoId: string, dados: CriarPlanoTreinoInput): Promise<PlanoTreinoCompleto> =>
      this.requisicao<PlanoTreinoCompleto>(`/alunos/${alunoId}/planos-treino`, {
        metodo: 'POST',
        corpo: dados,
      }),

    /** Gera uma versão nova e arquiva a anterior — não sobrescreve. */
    novaVersao: (
      alunoId: string,
      planoId: string,
      dados: CriarPlanoTreinoInput,
    ): Promise<PlanoTreinoCompleto> =>
      this.requisicao<PlanoTreinoCompleto>(`/alunos/${alunoId}/planos-treino/${planoId}`, {
        metodo: 'PATCH',
        corpo: dados,
      }),

    ativar: (alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> =>
      this.requisicao<PlanoTreinoCompleto>(`/alunos/${alunoId}/planos-treino/${planoId}/ativar`, {
        metodo: 'POST',
      }),
  };

  // --- execuções ----------------------------------------------------------

  readonly execucoes = {
    listar: (alunoId: string, limit?: number): Promise<ExecucaoResumo[]> =>
      this.requisicao<ExecucaoResumo[]>(`/alunos/${alunoId}/execucoes`, { query: { limit } }),

    /** Coluna ANTERIOR da tela de execução — uma chamada para a sessão inteira. */
    anteriores: (alunoId: string, sessaoId: string): Promise<AnterioresDaSessao> =>
      this.requisicao<AnterioresDaSessao>(`/alunos/${alunoId}/sessoes/${sessaoId}/anteriores`),

    historicoDeCarga: (
      alunoId: string,
      exercicioId: string,
      limit?: number,
    ): Promise<HistoricoCarga> =>
      this.requisicao<HistoricoCarga>(
        `/alunos/${alunoId}/exercicios/${exercicioId}/historico-carga`,
        { query: { limit } },
      ),

    /** Idempotente por clienteUuid: reenviar a fila offline não duplica treino. */
    registrar: (alunoId: string, dados: RegistrarExecucaoInput): Promise<ExecucaoResumo> =>
      this.requisicao<ExecucaoResumo>(`/alunos/${alunoId}/execucoes`, {
        metodo: 'POST',
        corpo: dados,
      }),
  };

  // --- mídia ---------------------------------------------------------------

  readonly midia = {
    autorizarUpload: (dados: PedirUploadInput): Promise<AutorizacaoDeUpload> =>
      this.requisicao<AutorizacaoDeUpload>('/midia/upload-url', { metodo: 'POST', corpo: dados }),

    /**
     * Envia o arquivo direto ao storage usando a autorização.
     * Não passa pelo `requisicao` porque o destino pode ser o bucket, não a API.
     */
    enviarArquivo: async (autorizacao: AutorizacaoDeUpload, arquivo: Blob): Promise<void> => {
      const resposta = await this.fetchImpl(autorizacao.urlUpload, {
        method: autorizacao.metodo,
        headers: autorizacao.cabecalhos,
        body: arquivo,
      });
      if (!resposta.ok) {
        throw new ErroApi('ERRO_INTERNO', 'Falha ao enviar o arquivo.', resposta.status);
      }
    },
  };

  // --- fotos de evolução ----------------------------------------------------

  readonly fotos = {
    listar: (alunoId: string): Promise<FotoEvolucaoResumo[]> =>
      this.requisicao<FotoEvolucaoResumo[]>(`/alunos/${alunoId}/fotos`),

    registrar: (alunoId: string, dados: RegistrarFotoInput): Promise<FotoEvolucaoResumo> =>
      this.requisicao<FotoEvolucaoResumo>(`/alunos/${alunoId}/fotos`, {
        metodo: 'POST',
        corpo: dados,
      }),

    /** O aluno escolhe quais profissionais veem esta foto. */
    definirVisibilidade: (
      alunoId: string,
      fotoId: string,
      visivelPara: string[],
    ): Promise<FotoEvolucaoResumo> =>
      this.requisicao<FotoEvolucaoResumo>(`/alunos/${alunoId}/fotos/${fotoId}/visibilidade`, {
        metodo: 'PATCH',
        corpo: { visivelPara },
      }),

    remover: (alunoId: string, fotoId: string): Promise<void> =>
      this.requisicao<void>(`/alunos/${alunoId}/fotos/${fotoId}`, { metodo: 'DELETE' }),
  };

  // --- lembretes e notificações --------------------------------------------

  readonly lembretes = {
    listar: (): Promise<LembreteResumo[]> => this.requisicao<LembreteResumo[]>('/me/lembretes'),

    definir: (dados: DefinirLembreteInput): Promise<LembreteResumo> =>
      this.requisicao<LembreteResumo>('/me/lembretes', { metodo: 'PUT', corpo: dados }),

    registrarDispositivo: (dados: RegistrarDispositivoInput): Promise<void> =>
      this.requisicao<void>('/me/dispositivos', { metodo: 'PUT', corpo: dados }),

    removerDispositivo: (token: string): Promise<void> =>
      this.requisicao<void>(`/me/dispositivos/${encodeURIComponent(token)}`, { metodo: 'DELETE' }),

    notificacoes: (limit?: number): Promise<NotificacaoResumo[]> =>
      this.requisicao<NotificacaoResumo[]>('/me/notificacoes', { query: { limit } }),

    marcarComoLida: (id: string): Promise<void> =>
      this.requisicao<void>(`/me/notificacoes/${id}/lida`, { metodo: 'PATCH' }),
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

    /** Séries prontas para gráfico: peso, gordura, massa magra e circunferências. */
    evolucao: (alunoId: string, consulta: Partial<ConsultaEvolucao> = {}): Promise<EvolucaoCorporal> =>
      this.requisicao<EvolucaoCorporal>(`/alunos/${alunoId}/medidas/evolucao`, {
        query: { de: consulta.de, ate: consulta.ate, limit: consulta.limit },
      }),
  };

  // --- nutrição -------------------------------------------------------------

  readonly alimentos = {
    listar: (consulta: Partial<ListarAlimentosQuery> = {}): Promise<AlimentoResumo[]> =>
      this.requisicao<AlimentoResumo[]>('/alimentos', {
        query: { q: consulta.q, grupo: consulta.grupo, limit: consulta.limit },
      }),

    grupos: (): Promise<string[]> => this.requisicao<string[]>('/alimentos/grupos'),
  };

  readonly dietas = {
    listar: (alunoId: string): Promise<PlanoDietaResumo[]> =>
      this.requisicao<PlanoDietaResumo[]>(`/alunos/${alunoId}/planos-dieta`),

    obterAtiva: (alunoId: string): Promise<PlanoDietaCompleto> =>
      this.requisicao<PlanoDietaCompleto>(`/alunos/${alunoId}/planos-dieta/ativo`),

    criar: (alunoId: string, dados: CriarPlanoDietaInput): Promise<PlanoDietaCompleto> =>
      this.requisicao<PlanoDietaCompleto>(`/alunos/${alunoId}/planos-dieta`, {
        metodo: 'POST',
        corpo: dados,
      }),

    novaVersao: (
      alunoId: string,
      planoId: string,
      dados: CriarPlanoDietaInput,
    ): Promise<PlanoDietaCompleto> =>
      this.requisicao<PlanoDietaCompleto>(`/alunos/${alunoId}/planos-dieta/${planoId}`, {
        metodo: 'PATCH',
        corpo: dados,
      }),

    substitutos: (
      alunoId: string,
      itemId: string,
      tolerancia?: number,
    ): Promise<SubstitutoSugerido[]> =>
      this.requisicao<SubstitutoSugerido[]>(
        `/alunos/${alunoId}/itens-refeicao/${itemId}/substitutos`,
        { query: { tolerancia } },
      ),

    registrarRefeicao: (alunoId: string, dados: RegistrarRefeicaoInput): Promise<unknown> =>
      this.requisicao(`/alunos/${alunoId}/registros-refeicao`, { metodo: 'POST', corpo: dados }),

    registrosDoDia: (alunoId: string, data?: string): Promise<
      { id: string; refeicaoId: string; refeicaoNome: string; data: string; status: string }[]
    > =>
      this.requisicao(`/alunos/${alunoId}/registros-refeicao`, { query: { data } }),
  };

  readonly agua = {
    resumo: (alunoId: string, data?: string): Promise<ResumoDeAgua> =>
      this.requisicao<ResumoDeAgua>(`/alunos/${alunoId}/agua`, { query: { data } }),

    registrar: (alunoId: string, dados: RegistrarAguaInput): Promise<ResumoDeAgua> =>
      this.requisicao<ResumoDeAgua>(`/alunos/${alunoId}/agua`, { metodo: 'POST', corpo: dados }),

    remover: (alunoId: string, registroId: string): Promise<void> =>
      this.requisicao<void>(`/alunos/${alunoId}/agua/${registroId}`, { metodo: 'DELETE' }),

    definirMeta: (alunoId: string, dados: DefinirMetaAguaInput): Promise<unknown> =>
      this.requisicao(`/alunos/${alunoId}/agua/meta`, { metodo: 'PUT', corpo: dados }),
  };
}
