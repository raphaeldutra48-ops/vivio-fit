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
  AplicarModeloInput,
  AvaliacaoResumo,
  CriarModeloCardapioInput,
  ListaDeCompras,
  ModeloCardapioCompleto,
  ModeloCardapioResumo,
  SalvarComoModeloInput,
  CompromissoResumo,
  RegistrarAvaliacaoInput,
  ConsultaAgenda,
  ConsultaAuditoria,
  CriarBloqueioInput,
  CriarCompromissoInput,
  DefinirDisponibilidadeInput,
  HorarioLivre,
  JanelaDisponivel,
  MudarStatusInput,
  RemarcarCompromissoInput,
  ConsultaEvolucao,
  ConversaResumo,
  EnviarMensagemInput,
  ListarMensagensQuery,
  MensagemResumo,
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
  ListarProfissionaisQuery,
  ProfissionalParaVerificar,
  RecusarProfissionalInput,
  AnamneseResumo,
  AplicarAnamneseInput,
  ModeloAnamneseResumo,
  SalvarModeloAnamneseInput,
  ReceitaResumo,
  RefeicaoSalvaResumo,
  SalvarReceitaInput,
  SalvarRefeicaoInput,
  RelatorioDaCarteira,
  CompartilharMaterialInput,
  CriarMaterialInput,
  MaterialDoAluno,
  MaterialResumo,
  CriarModeloPrescricaoInput,
  CriarPrescritivelInput,
  EmitirPrescricaoInput,
  ListarPrescritiveisQuery,
  ModeloPrescricaoResumo,
  MudarStatusPrescricaoInput,
  PrescricaoResumo,
  PrescritivelResumo,
  ParDeTokens,
  RegistrarAlunoInput,
  RegistrarExecucaoInput,
  RegistrarMedidaInput,
  RegistrarProfissionalInput,
  ReenviarVerificacaoInput,
  RespostaAutenticacao,
  RespostaRegistro,
  VerificarEmailInput,
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
  /**
   * Navegador: o refresh token fica num cookie httpOnly que o JavaScript não
   * enxerga, e só o access token de 15 minutos vive em memória. Um XSS passa a
   * conseguir no máximo esses 15 minutos, em vez dos 30 dias do refresh.
   *
   * Não usar no mobile: não há cookie jar, e o SecureStore já é armazenamento
   * do sistema operacional, fora do alcance do JavaScript.
   */
  usarCookieDeRefresh?: boolean;
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
      // No modo cookie o token não está aqui — quem decide se há sessão é o
      // navegador, mandando (ou não) o cookie.
      if (!this.opcoes.usarCookieDeRefresh && !atuais?.refreshToken) return false;
      try {
        const par = await this.requisicao<ParDeTokens>('/auth/refresh', {
          metodo: 'POST',
          corpo: this.opcoes.usarCookieDeRefresh ? {} : { refreshToken: atuais!.refreshToken },
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
    // É este cabeçalho que faz a API devolver o refresh em cookie em vez do corpo.
    if (this.opcoes.usarCookieDeRefresh) cabecalhos['X-Vivio-Cliente'] = 'web';
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
        // Sem isto o navegador não manda o cookie para outra origem.
        credentials: this.opcoes.usarCookieDeRefresh ? 'include' : 'same-origin',
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
    /** Não guarda tokens: o cadastro não abre sessão até o e-mail ser confirmado. */
    registrarAluno: (dados: RegistrarAlunoInput): Promise<RespostaRegistro> =>
      this.requisicao<RespostaRegistro>('/auth/registrar/aluno', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      }),

    registrarProfissional: (dados: RegistrarProfissionalInput): Promise<RespostaRegistro> =>
      this.requisicao<RespostaRegistro>('/auth/registrar/profissional', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      }),

    /** Confirma o e-mail pelo token do link — é aqui que a sessão começa. */
    verificarEmail: async (dados: VerificarEmailInput): Promise<RespostaAutenticacao> => {
      const r = await this.requisicao<RespostaAutenticacao>('/auth/verificar-email', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      });
      await this.guardar(r);
      return r;
    },

    reenviarVerificacao: (dados: ReenviarVerificacaoInput): Promise<void> =>
      this.requisicao<void>('/auth/reenviar-verificacao', {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      }),

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
      // No modo cookie o corpo vai vazio de propósito: o servidor revoga pelo
      // cookie e o apaga na mesma resposta.
      if (this.opcoes.usarCookieDeRefresh || tokens?.refreshToken) {
        await this.requisicao<void>('/auth/logout', {
          metodo: 'POST',
          corpo: this.opcoes.usarCookieDeRefresh ? {} : { refreshToken: tokens!.refreshToken },
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

  // --- agenda ---------------------------------------------------------------

  readonly agenda = {
    listar: (consulta: ConsultaAgenda): Promise<CompromissoResumo[]> =>
      this.requisicao<CompromissoResumo[]>('/agenda', {
        query: {
          de: consulta.de,
          ate: consulta.ate,
          incluirCancelados: consulta.incluirCancelados ? 'true' : undefined,
        },
      }),

    /** Visão do aluno: os compromissos dele com qualquer profissional. */
    meus: (de: string, ate: string): Promise<CompromissoResumo[]> =>
      this.requisicao<CompromissoResumo[]>('/agenda/meus', { query: { de, ate } }),

    horariosLivres: (data: string, duracaoMin?: number): Promise<HorarioLivre[]> =>
      this.requisicao<HorarioLivre[]>('/agenda/horarios-livres', { query: { data, duracaoMin } }),

    marcar: (dados: CriarCompromissoInput): Promise<CompromissoResumo> =>
      this.requisicao<CompromissoResumo>('/agenda', { metodo: 'POST', corpo: dados }),

    remarcar: (id: string, dados: RemarcarCompromissoInput): Promise<CompromissoResumo> =>
      this.requisicao<CompromissoResumo>(`/agenda/${id}`, { metodo: 'PATCH', corpo: dados }),

    mudarStatus: (id: string, dados: MudarStatusInput): Promise<CompromissoResumo> =>
      this.requisicao<CompromissoResumo>(`/agenda/${id}/status`, {
        metodo: 'PATCH',
        corpo: dados,
      }),

    listarDisponibilidade: (): Promise<JanelaDisponivel[]> =>
      this.requisicao<JanelaDisponivel[]>('/agenda/disponibilidade'),

    definirDisponibilidade: (
      dados: DefinirDisponibilidadeInput,
    ): Promise<JanelaDisponivel[]> =>
      this.requisicao<JanelaDisponivel[]>('/agenda/disponibilidade', {
        metodo: 'PUT',
        corpo: dados,
      }),

    bloquear: (dados: CriarBloqueioInput): Promise<unknown> =>
      this.requisicao('/agenda/bloqueios', { metodo: 'POST', corpo: dados }),
  };

  // --- avaliação física -----------------------------------------------------

  readonly avaliacoes = {
    listar: (alunoId: string): Promise<AvaliacaoResumo[]> =>
      this.requisicao<AvaliacaoResumo[]>(`/alunos/${alunoId}/avaliacoes`),

    /** Salva e já atualiza a medida do dia — os gráficos refletem na hora. */
    registrar: (alunoId: string, dados: RegistrarAvaliacaoInput): Promise<AvaliacaoResumo> =>
      this.requisicao<AvaliacaoResumo>(`/alunos/${alunoId}/avaliacoes`, {
        metodo: 'POST',
        corpo: dados,
      }),
  };

  // --- cardápios e lista de compras ------------------------------------------

  readonly cardapios = {
    listar: (): Promise<ModeloCardapioResumo[]> =>
      this.requisicao<ModeloCardapioResumo[]>('/cardapios'),

    obter: (id: string): Promise<ModeloCardapioCompleto> =>
      this.requisicao<ModeloCardapioCompleto>(`/cardapios/${id}`),

    criar: (dados: CriarModeloCardapioInput): Promise<ModeloCardapioCompleto> =>
      this.requisicao<ModeloCardapioCompleto>('/cardapios', { metodo: 'POST', corpo: dados }),

    /** Transforma um plano já entregue a um paciente em molde reutilizável. */
    salvarDoPlano: (dados: SalvarComoModeloInput): Promise<ModeloCardapioCompleto> =>
      this.requisicao<ModeloCardapioCompleto>('/cardapios/do-plano', {
        metodo: 'POST',
        corpo: dados,
      }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/cardapios/${id}`, { metodo: 'DELETE' }),

    /** Cria o plano do paciente a partir do molde — os dois ficam independentes. */
    aplicar: (
      alunoId: string,
      modeloId: string,
      dados: AplicarModeloInput,
    ): Promise<PlanoDietaCompleto> =>
      this.requisicao<PlanoDietaCompleto>(
        `/alunos/${alunoId}/planos-dieta/do-modelo/${modeloId}`,
        { metodo: 'POST', corpo: dados },
      ),
  };

  readonly listaDeCompras = {
    gerar: (alunoId: string, dias = 7): Promise<ListaDeCompras> =>
      this.requisicao<ListaDeCompras>(`/alunos/${alunoId}/lista-de-compras`, {
        query: { dias },
      }),
  };

  // --- chat -----------------------------------------------------------------

  readonly chat = {
    listarConversas: (): Promise<ConversaResumo[]> =>
      this.requisicao<ConversaResumo[]>('/conversas'),

    abrir: (comUsuarioId: string): Promise<ConversaResumo> =>
      this.requisicao<ConversaResumo>('/conversas', { metodo: 'POST', corpo: { comUsuarioId } }),

    mensagens: (
      conversaId: string,
      consulta: Partial<ListarMensagensQuery> = {},
    ): Promise<{ dados: MensagemResumo[]; proximoCursor: string | null }> =>
      this.requisicao(`/conversas/${conversaId}/mensagens`, {
        query: { cursor: consulta.cursor, limit: consulta.limit },
      }),

    enviar: (conversaId: string, dados: EnviarMensagemInput): Promise<MensagemResumo> =>
      this.requisicao<MensagemResumo>(`/conversas/${conversaId}/mensagens`, {
        metodo: 'POST',
        corpo: dados,
      }),

    marcarVista: (conversaId: string): Promise<void> =>
      this.requisicao<void>(`/conversas/${conversaId}/vista`, { metodo: 'POST' }),
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

  // --- prescrições ----------------------------------------------------------

  /** Catálogo do profissional: suplementos, fitoterápicos, medicamentos. */
  readonly prescritiveis = {
    listar: (consulta: Partial<ListarPrescritiveisQuery> = {}): Promise<PrescritivelResumo[]> =>
      this.requisicao<PrescritivelResumo[]>('/prescritiveis', {
        query: { q: consulta.q, tipo: consulta.tipo, limit: consulta.limit },
      }),

    criar: (dados: CriarPrescritivelInput): Promise<PrescritivelResumo> =>
      this.requisicao<PrescritivelResumo>('/prescritiveis', { metodo: 'POST', corpo: dados }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/prescritiveis/${id}`, { metodo: 'DELETE' }),
  };

  readonly modelosPrescricao = {
    listar: (): Promise<ModeloPrescricaoResumo[]> =>
      this.requisicao<ModeloPrescricaoResumo[]>('/modelos-prescricao'),

    criar: (dados: CriarModeloPrescricaoInput): Promise<ModeloPrescricaoResumo> =>
      this.requisicao<ModeloPrescricaoResumo>('/modelos-prescricao', {
        metodo: 'POST',
        corpo: dados,
      }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/modelos-prescricao/${id}`, { metodo: 'DELETE' }),
  };

  readonly prescricoes = {
    listar: (alunoId: string): Promise<PrescricaoResumo[]> =>
      this.requisicao<PrescricaoResumo[]>(`/alunos/${alunoId}/prescricoes`),

    emitir: (alunoId: string, dados: EmitirPrescricaoInput): Promise<PrescricaoResumo> =>
      this.requisicao<PrescricaoResumo>(`/alunos/${alunoId}/prescricoes`, {
        metodo: 'POST',
        corpo: dados,
      }),

    /** Não edita: cria a versão seguinte e arquiva a anterior. */
    substituir: (
      alunoId: string,
      prescricaoId: string,
      dados: EmitirPrescricaoInput,
    ): Promise<PrescricaoResumo> =>
      this.requisicao<PrescricaoResumo>(
        `/alunos/${alunoId}/prescricoes/${prescricaoId}/substituir`,
        { metodo: 'POST', corpo: dados },
      ),

    mudarStatus: (
      alunoId: string,
      prescricaoId: string,
      dados: MudarStatusPrescricaoInput,
    ): Promise<PrescricaoResumo> =>
      this.requisicao<PrescricaoResumo>(`/alunos/${alunoId}/prescricoes/${prescricaoId}/status`, {
        metodo: 'PATCH',
        corpo: dados,
      }),
  };

  // --- receitas e refeições --------------------------------------------------

  readonly receitas = {
    listar: (q?: string): Promise<ReceitaResumo[]> =>
      this.requisicao<ReceitaResumo[]>('/receitas', { query: { q } }),

    criar: (dados: SalvarReceitaInput): Promise<ReceitaResumo> =>
      this.requisicao<ReceitaResumo>('/receitas', { metodo: 'POST', corpo: dados }),

    atualizar: (id: string, dados: SalvarReceitaInput): Promise<ReceitaResumo> =>
      this.requisicao<ReceitaResumo>(`/receitas/${id}`, { metodo: 'PATCH', corpo: dados }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/receitas/${id}`, { metodo: 'DELETE' }),
  };

  readonly refeicoesSalvas = {
    listar: (): Promise<RefeicaoSalvaResumo[]> =>
      this.requisicao<RefeicaoSalvaResumo[]>('/refeicoes'),

    criar: (dados: SalvarRefeicaoInput): Promise<RefeicaoSalvaResumo> =>
      this.requisicao<RefeicaoSalvaResumo>('/refeicoes', { metodo: 'POST', corpo: dados }),

    atualizar: (id: string, dados: SalvarRefeicaoInput): Promise<RefeicaoSalvaResumo> =>
      this.requisicao<RefeicaoSalvaResumo>(`/refeicoes/${id}`, { metodo: 'PATCH', corpo: dados }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/refeicoes/${id}`, { metodo: 'DELETE' }),
  };

  // --- materiais ------------------------------------------------------------

  readonly materiais = {
    listar: (etiqueta?: string): Promise<MaterialResumo[]> =>
      this.requisicao<MaterialResumo[]>('/materiais', { query: { etiqueta } }),

    /** Visão do aluno: só o que foi compartilhado com ele. */
    meus: (): Promise<MaterialDoAluno[]> => this.requisicao<MaterialDoAluno[]>('/materiais/meus'),

    criar: (dados: CriarMaterialInput): Promise<MaterialResumo> =>
      this.requisicao<MaterialResumo>('/materiais', { metodo: 'POST', corpo: dados }),

    /** Link assinado e curto — o arquivo nunca fica público. */
    abrir: (id: string): Promise<UrlAssinada> =>
      this.requisicao<UrlAssinada>(`/materiais/${id}/abrir`),

    compartilhar: (id: string, dados: CompartilharMaterialInput): Promise<MaterialResumo> =>
      this.requisicao<MaterialResumo>(`/materiais/${id}/compartilhar`, {
        metodo: 'POST',
        corpo: dados,
      }),

    descompartilhar: (id: string, alunoId: string): Promise<void> =>
      this.requisicao<void>(`/materiais/${id}/compartilhar/${alunoId}`, { metodo: 'DELETE' }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/materiais/${id}`, { metodo: 'DELETE' }),
  };

  // --- relatórios -----------------------------------------------------------

  readonly relatorios = {
    /** Cada linha traz só o que aquele aluno autorizou este profissional a ver. */
    carteira: (dias?: number): Promise<RelatorioDaCarteira> =>
      this.requisicao<RelatorioDaCarteira>('/relatorios/carteira', { query: { dias } }),
  };

  // --- anamnese -------------------------------------------------------------

  /** Questionários do profissional. O modelo em si não é dado de aluno. */
  readonly modelosAnamnese = {
    listar: (): Promise<ModeloAnamneseResumo[]> =>
      this.requisicao<ModeloAnamneseResumo[]>('/modelos-anamnese'),

    criar: (dados: SalvarModeloAnamneseInput): Promise<ModeloAnamneseResumo> =>
      this.requisicao<ModeloAnamneseResumo>('/modelos-anamnese', { metodo: 'POST', corpo: dados }),

    atualizar: (id: string, dados: SalvarModeloAnamneseInput): Promise<ModeloAnamneseResumo> =>
      this.requisicao<ModeloAnamneseResumo>(`/modelos-anamnese/${id}`, {
        metodo: 'PATCH',
        corpo: dados,
      }),

    remover: (id: string): Promise<void> =>
      this.requisicao<void>(`/modelos-anamnese/${id}`, { metodo: 'DELETE' }),
  };

  readonly anamneses = {
    listar: (alunoId: string): Promise<AnamneseResumo[]> =>
      this.requisicao<AnamneseResumo[]>(`/alunos/${alunoId}/anamneses`),

    aplicar: (alunoId: string, dados: AplicarAnamneseInput): Promise<AnamneseResumo> =>
      this.requisicao<AnamneseResumo>(`/alunos/${alunoId}/anamneses`, {
        metodo: 'POST',
        corpo: dados,
      }),

    remover: (alunoId: string, id: string): Promise<void> =>
      this.requisicao<void>(`/alunos/${alunoId}/anamneses/${id}`, { metodo: 'DELETE' }),
  };

  // --- administração --------------------------------------------------------

  /** Verificação de registro no conselho. Só o papel ADMIN alcança. */
  readonly admin = {
    listarProfissionais: (
      consulta: Partial<ListarProfissionaisQuery> = {},
    ): Promise<ProfissionalParaVerificar[]> =>
      this.requisicao<ProfissionalParaVerificar[]>('/admin/profissionais', {
        query: { status: consulta.status, q: consulta.q, limit: consulta.limit },
      }),

    contarPendentes: (): Promise<{ total: number }> =>
      this.requisicao<{ total: number }>('/admin/profissionais/pendentes/total'),

    verificar: (id: string): Promise<ProfissionalParaVerificar> =>
      this.requisicao<ProfissionalParaVerificar>(`/admin/profissionais/${id}/verificar`, {
        metodo: 'PATCH',
      }),

    recusar: (id: string, dados: RecusarProfissionalInput): Promise<ProfissionalParaVerificar> =>
      this.requisicao<ProfissionalParaVerificar>(`/admin/profissionais/${id}/recusar`, {
        metodo: 'PATCH',
        corpo: dados,
      }),
  };
}
