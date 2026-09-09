import { MotorSupabase, type OpcoesSupabase } from './supabase';
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
  ExercicioAGravar,
  LeituraDeDieta,
  ExercicioResumo,
  ListarExerciciosQuery,
  PlanoTreinoCompleto,
  PlanoTreinoResumo,
  ConsentimentoResumo,
  AlimentoResumo,
  AplicarModeloInput,
  AvaliacaoResumo,
  ExameResumo,
  RegistrarExameInput,
  AnexarLaudoInput,
  AlertaResumo,
  ReconhecerAlertaInput,
  CondicaoResumo,
  RegistrarCondicaoInput,
  ResolverCondicaoInput,
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
  RegistroDeRefeicao,
  ResumoDeAgua,
  SubstitutoSugerido,
  LembreteResumo,
  NotificacaoResumo,
  RegistrarDispositivoInput,
  LoginInput,
  CheckinResumo,
  PainelDeProgresso,
  ResumoDoProfissional,
  ComparativoDeEvolucao,
  PainelDeFeedback,
  MeusRecordes,
  MidiaDeExercicios,
  CardioResumo,
  RegistrarCardioInput,
  ResumoDeCalorias,
  CalorimetriaResumo,
  RegistrarCalorimetriaInput,
  CriarMetaInput,
  MetaResumo,
  MedidaResumo,
  RegistrarCheckinInput,
  ResumoDeCheckins,
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
  CobrancaResumo,
  ConsultaFinanceiro,
  CriarCobrancaInput,
  RegistrarPagamentoInput,
  ResumoFinanceiro,
  EnviarPedidoInput,
  PaginaPublica,
  PedidoResumo,
  PerfilPublicoResumo,
  SalvarPerfilPublicoInput,
  AtualizarPerfilInput,
  MeuPerfil,
  CobrancaComPix,
  DadosDePagamento,
  SalvarPagamentoInput,
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
  EsqueciSenhaInput,
  RedefinirSenhaInput,
  ReenviarVerificacaoInput,
  RespostaAutenticacao,
  RespostaRegistro,
  VerificarEmailInput,
  ResumoAluno,
  StatusVinculo,
  UsuarioAutenticado,
  VinculoResumo,
} from '@vivio/contracts';
import { DIAS_PADRAO_FEEDBACK } from '@vivio/contracts';
import { ErroApi } from './erro';

export interface TokensArmazenados {
  accessToken: string;
  refreshToken: string;
}

export interface OpcoesCliente {
  /**
   * Onde a API ainda responde.
   *
   * Some quando o ultimo grupo sair dela. Enquanto isso, os dois motores
   * convivem no mesmo cliente e as telas nao percebem qual atende cada
   * chamada — que e o ponto de a migracao caber dentro do SDK.
   */
  baseUrl: string;
  /** O motor novo. Autenticacao ja passa toda por aqui. */
  supabase: OpcoesSupabase;
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
  /** Acesso direto ao Postgres para quem precisa consultar sem passar por metodo. */
  readonly supabase: MotorSupabase;

  constructor(private readonly opcoes: OpcoesCliente) {
    this.fetchImpl = opcoes.fetch ?? globalThis.fetch.bind(globalThis);
    this.supabase = new MotorSupabase(opcoes.supabase);
  }

  definirTokens(tokens: TokensArmazenados | null): void {
    this.tokens = tokens;
  }

  /*
    O que morava aqui, e por que sumiu.

    `guardar` gravava o par de tokens; `renovar` fazia a renovacao compartilhada
    — cinco 401 simultaneos nao podiam virar cinco refresh, porque o servidor,
    corretamente, lia refresh reapresentado como vazamento e derrubava a sessao
    inteira. Eram trinta linhas de codigo de concorrencia que existiam so para
    nao dar tiro no proprio pe.

    O `supabase-js` faz as duas coisas, e serializa a renovacao sozinho.
  */

  private async requisicao<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
    const { metodo = 'GET', corpo, query, autenticada = true, jaTentouRenovar = false } = opcoes;

    const url = new URL(`${this.opcoes.baseUrl.replace(/\/$/, '')}/api/v1${caminho}`);
    for (const [chave, valor] of Object.entries(query ?? {})) {
      if (valor !== undefined) url.searchParams.set(chave, String(valor));
    }

    const cabecalhos: Record<string, string> = {};
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (autenticada) {
      /*
        O token vem do Supabase, que agora e quem autentica.

        Enquanto os grupos de dados nao migram, eles continuam batendo na API —
        e a API aprendeu a aceitar esse token (`token-supabase.ts`). Ler do
        campo antigo aqui deixaria o cabecalho VAZIO, porque `login` nao guarda
        mais nada nele: toda chamada nao migrada voltava 401 com a pessoa
        logada, e a tela concluia que a sessao tinha morrido.

        `getSession()` do `supabase-js` renova sozinho quando falta pouco, o
        que substitui o `renovar()` que vivia aqui.
      */
      const token = await this.supabase.token();
      if (token) cabecalhos['Authorization'] = `Bearer ${token}`;
    }

    let resposta: Response;
    try {
      resposta = await this.fetchImpl(url.toString(), {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        // Nao ha mais cookie nosso: a credencial e o token do Supabase, no
        // cabecalho. `omit` deixa isso explicito em vez de depender do padrao.
        credentials: 'omit',
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
      /*
        Uma segunda chance, e so uma: pede a sessao de novo — o `supabase-js`
        renova o token nessa hora se ele acabou de expirar — e repete.

        O `renovar()` proprio, com toda a danca de concorrencia (cinco 401 ao
        mesmo tempo nao podiam virar cinco refresh, que o servidor leria como
        vazamento), saiu junto com a API. O `supabase-js` ja serializa isso.
      */
      const { data } = await this.supabase.db.auth.refreshSession();
      if (data.session) {
        return this.requisicao<T>(caminho, { ...opcoes, jaTentouRenovar: true });
      }
      await this.opcoes.aoPerderSessao?.();
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

  /*
    Autenticacao: toda no Supabase Auth.

    O que saiu daqui junto com a API: Argon2, tabela de sessao, rodizio de
    refresh, cookie httpOnly, os dois fluxos de e-mail e o `renovar()` com sua
    danca de concorrencia — cinco 401 simultaneos que nao podiam virar cinco
    refresh. Era codigo de seguranca escrito por nos, que e o tipo mais caro de
    manter e o pior de errar. O `supabase-js` renova sozinho antes de expirar.

    Os nomes dos metodos ficam: sao 158 chamadas nas telas, e nenhuma precisa
    saber que o motor mudou.
  */
  readonly auth = {
    /** Nao abre sessao: a conta so vale depois do e-mail confirmado. */
    registrarAluno: (dados: RegistrarAlunoInput): Promise<RespostaRegistro> =>
      this.supabase.registrarAluno(dados),

    registrarProfissional: (dados: RegistrarProfissionalInput): Promise<RespostaRegistro> =>
      this.supabase.registrarProfissional(dados),

    /**
     * Confirmacao de e-mail.
     *
     * Mudou de mecanica, e a assinatura acompanha. Antes, o link trazia
     * `?token=` e a API o gastava; agora o link e do proprio Supabase e chega
     * com a sessao ja montada na URL — o `supabase-js` a consome sozinho ao
     * carregar a pagina, e aqui so se le o que ele deixou.
     *
     * O parametro fica opcional para as telas antigas nao quebrarem, e e
     * ignorado: nao ha mais token nosso para gastar.
     */
    verificarEmail: async (_dados?: VerificarEmailInput): Promise<RespostaAutenticacao> => {
      const usuario = await this.supabase.usuarioAtual();
      if (!usuario) {
        throw new ErroApi('TOKEN_INVALIDO', 'O link expirou ou ja foi usado. Peca outro.', 401);
      }
      const { data } = await this.supabase.db.auth.getSession();
      return {
        accessToken: data.session!.access_token,
        refreshToken: data.session!.refresh_token,
        expiraEm: (data.session!.expires_at ?? 0) * 1000,
        usuario: { ...usuario, emailVerificado: true },
      };
    },

    reenviarVerificacao: (dados: ReenviarVerificacaoInput): Promise<void> =>
      this.supabase.reenviarVerificacao(dados.email),

    /** Responde igual exista o e-mail ou nao — a tela nao deve inventar diferenca. */
    esqueciSenha: (dados: EsqueciSenhaInput): Promise<void> => this.supabase.esqueciSenha(dados),

    /**
     * Troca a senha da sessao que o link de recuperacao abriu.
     *
     * O `token` do contrato antigo e ignorado: quem prova a posse do e-mail
     * agora e a sessao que o proprio link montou.
     *
     * Uma propriedade se perdeu no caminho, e vale dizer: antes o link so era
     * gasto ao ENVIAR a senha nova, entao abrir o e-mail no celular so para
     * ver do que se tratava nao queimava nada. No Supabase, abrir o link ja o
     * consome. Nao ha como manter os dois — o que autentica a troca e a sessao,
     * e a sessao nasce da abertura.
     */
    redefinirSenha: (dados: RedefinirSenhaInput): Promise<RespostaAutenticacao> =>
      this.supabase.redefinirSenha(dados.senha),

    /** Ha sessao agora? A tela de redefinicao usa para saber se o link valeu. */
    sessaoAberta: async (): Promise<boolean> => {
      const { data } = await this.supabase.db.auth.getSession();
      return data.session !== null;
    },

    login: (dados: LoginInput): Promise<RespostaAutenticacao> => this.supabase.entrar(dados),

    logout: async (): Promise<void> => {
      await this.supabase.sair();
      this.tokens = null;
    },
  };

  // --- usuário ------------------------------------------------------------

  readonly me = {
    /**
     * Quem esta logado, lido do TOKEN.
     *
     * Evita uma ida ao banco em todo boot de tela e, mais importante, garante
     * que a tela e as politicas olham o MESMO papel: se divergissem, o menu
     * mostraria o que o banco depois recusa.
     */
    obter: async (): Promise<UsuarioAutenticado> => {
      const u = await this.supabase.usuarioAtual();
      if (!u) throw new ErroApi('NAO_AUTENTICADO', 'Sua sessao expirou. Entre de novo.', 401);
      return u;
    },

    perfil: (): Promise<MeuPerfil> => this.supabase.meuPerfil(),

    /**
     * Trocar o registro no conselho REVOGA a verificacao — e quem faz isso e o
     * gatilho no banco, nao esta chamada. Se fosse o cliente a mandar
     * `verificadoEm: null`, bastaria nao mandar.
     */
    atualizarPerfil: (dados: AtualizarPerfilInput): Promise<MeuPerfil> =>
      this.supabase.atualizarMeuPerfil(dados),
  };

  // --- vínculos -----------------------------------------------------------

  /*
    Vinculo: convidar e responder passam por FUNCAO no banco.

    As regras sao transicoes com invariante — quem convidou nao aceita o
    proprio convite, um profissional ativo por tipo, registro no conselho
    conferido — e nada disso cabe num `with check`, que so enxerga a linha
    nova. Por isso a tabela nao tem politica de escrita: ou passa pelas
    funcoes, ou nao acontece.
  */
  readonly vinculos = {
    convidar: (email: string): Promise<VinculoResumo> => this.supabase.convidarVinculo(email),

    aceitar: (id: string): Promise<VinculoResumo> =>
      this.supabase.responderVinculo(id, 'ACEITAR'),

    recusar: (id: string): Promise<VinculoResumo> =>
      this.supabase.responderVinculo(id, 'RECUSAR'),

    encerrar: (id: string): Promise<VinculoResumo> =>
      this.supabase.responderVinculo(id, 'ENCERRAR'),

    /** A carteira do profissional. */
    meusAlunos: (status?: StatusVinculo): Promise<VinculoResumo[]> =>
      this.supabase.vinculosOndeSou('profissional', status),

    /** A equipe de cuidado do aluno. */
    meusProfissionais: (): Promise<VinculoResumo[]> => this.supabase.vinculosOndeSou('aluno'),
  };

  // --- alunos -------------------------------------------------------------

  readonly alunos = {
    resumo: (alunoId: string): Promise<ResumoAluno> =>
      this.requisicao<ResumoAluno>(`/alunos/${alunoId}/resumo`),
  };

  // --- consentimentos -----------------------------------------------------

  readonly consentimentos = {
    listar: (incluirRevogados = false): Promise<ConsentimentoResumo[]> =>
      this.supabase.listarConsentimentos(incluirRevogados),

    conceder: (dados: ConcederConsentimentoInput): Promise<ConsentimentoResumo> =>
      this.supabase.concederConsentimento(dados),

    /** Revogar marca a data; a linha fica, porque ela e a prova. */
    revogar: (id: string): Promise<void> => this.supabase.revogarConsentimento(id),
  };

  // --- auditoria ----------------------------------------------------------

  readonly auditoria = {
    /**
     * "Quem viu meus dados" — direito do titular pela LGPD.
     *
     * So o proprio aluno le a auditoria dele: nem o profissional, nem o admin.
     * Quem garante isso e a politica, nao esta chamada.
     */
    meusAcessos: (
      consulta: Partial<ConsultaAuditoria> = {},
    ): Promise<{ dados: AcessoRegistrado[]; proximoCursor: string | null }> =>
      this.supabase.meusAcessos(consulta),
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

    /** Demonstração de vários de uma vez — pedida no começo do treino. */
    midia: (ids: string[]): Promise<MidiaDeExercicios> =>
      this.requisicao<MidiaDeExercicios>('/exercicios/midia', { metodo: 'POST', corpo: { ids } }),

    /** Grava a demonstração do profissional; só os alunos dele veem. */
    gravarDemonstracao: (id: string, chave: string): Promise<void> =>
      this.requisicao<void>(`/exercicios/${id}/minha-demonstracao`, { metodo: 'POST', corpo: { chave } }),

    removerDemonstracao: (id: string): Promise<void> =>
      this.requisicao<void>(`/exercicios/${id}/minha-demonstracao`, { metodo: 'DELETE' }),

    /**
     * Transcreve um plano alimentar em PDF ou foto. Devolve RASCUNHO — nada é
     * salvo até o profissional conferir e mandar salvar pelo caminho normal.
     */
    importarDieta: (dados: {
      chave: string;
      mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
      alunoId?: string | null;
    }): Promise<LeituraDeDieta> =>
      this.requisicao<LeituraDeDieta>('/importacao-dieta', { metodo: 'POST', corpo: dados }),

    /** A fila de gravação: o que falta, do mais prescrito para o menos. */
    planoDeGravacao: (): Promise<ExercicioAGravar[]> =>
      this.requisicao<ExercicioAGravar[]>('/exercicios/plano-de-gravacao'),

    urlDoVideo: (id: string): Promise<UrlAssinada> =>
      this.requisicao<UrlAssinada>(`/exercicios/${id}/video`),
  };

  // --- planos de treino ---------------------------------------------------

  readonly treinos = {
    listar: (alunoId: string): Promise<PlanoTreinoResumo[]> => this.supabase.listarPlanos(alunoId),

    /** Payload completo do plano ativo — é o que o mobile guarda para o modo offline. */
    obterAtivo: (alunoId: string): Promise<PlanoTreinoCompleto> =>
      this.supabase.planoAtivo(alunoId),

    obter: (alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> =>
      this.supabase.obterPlano(alunoId, planoId),

    criar: (alunoId: string, dados: CriarPlanoTreinoInput): Promise<PlanoTreinoCompleto> =>
      this.supabase.criarPlano(alunoId, dados),

    /** Gera uma versão nova e arquiva a anterior — não sobrescreve. */
    novaVersao: (
      alunoId: string,
      planoId: string,
      dados: CriarPlanoTreinoInput,
    ): Promise<PlanoTreinoCompleto> => this.supabase.criarPlano(alunoId, dados, planoId),

    ativar: (alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> =>
      this.supabase.ativarPlano(alunoId, planoId),
  };

  // --- execuções ----------------------------------------------------------

  readonly execucoes = {
    listar: (alunoId: string, limit?: number): Promise<ExecucaoResumo[]> =>
      this.supabase.listarExecucoes(alunoId, limit),

    /** Coluna ANTERIOR da tela de execução — uma chamada para a sessão inteira. */
    anteriores: (alunoId: string, sessaoId: string): Promise<AnterioresDaSessao> =>
      this.supabase.anterioresDaSessao(alunoId, sessaoId),

    historicoDeCarga: (
      alunoId: string,
      exercicioId: string,
      limit?: number,
    ): Promise<HistoricoCarga> => this.supabase.historicoDeCarga(alunoId, exercicioId, limit),

    /** Idempotente por clienteUuid: reenviar a fila offline não duplica treino. */
    registrar: (alunoId: string, dados: RegistrarExecucaoInput): Promise<ExecucaoResumo> =>
      this.supabase.registrarExecucao(alunoId, dados),
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
      this.supabase.listarAgenda(consulta),

    /** Visão do aluno: os compromissos dele com qualquer profissional. */
    meus: (de: string, ate: string): Promise<CompromissoResumo[]> =>
      this.supabase.meusCompromissos(de, ate),

    horariosLivres: (data: string, duracaoMin?: number): Promise<HorarioLivre[]> =>
      this.supabase.horariosLivres(data, duracaoMin),

    marcar: (dados: CriarCompromissoInput): Promise<CompromissoResumo> =>
      this.supabase.marcarCompromisso(dados),

    remarcar: (id: string, dados: RemarcarCompromissoInput): Promise<CompromissoResumo> =>
      this.supabase.remarcarCompromisso(id, dados),

    mudarStatus: (id: string, dados: MudarStatusInput): Promise<CompromissoResumo> =>
      this.supabase.mudarStatusCompromisso(id, dados),

    listarDisponibilidade: (): Promise<JanelaDisponivel[]> =>
      this.supabase.listarDisponibilidade(),

    definirDisponibilidade: (dados: DefinirDisponibilidadeInput): Promise<JanelaDisponivel[]> =>
      this.supabase.definirDisponibilidade(dados),

    bloquear: (dados: CriarBloqueioInput): Promise<void> => this.supabase.criarBloqueio(dados),
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

  // --- exames laboratoriais ---------------------------------------------------

  /**
   * O que volta daqui já vem filtrado pelo papel de quem pediu: o
   * nutricionista recebe menos marcadores que o médico, e nenhum dos dois
   * decide isso na tela.
   */
  readonly exames = {
    listar: (alunoId: string): Promise<ExameResumo[]> => this.supabase.listarExames(alunoId),

    obter: (alunoId: string, exameId: string): Promise<ExameResumo> =>
      this.supabase.obterExame(alunoId, exameId),

    /**
     * A classificacao de cada resultado e calculada pelo BANCO, na entrada.
     *
     * Se viesse daqui, um cliente adulterado gravaria "OTIMO" numa glicemia de
     * 300 e o alerta clinico nunca nasceria — o medico veria o numero e o
     * personal nao receberia conduta nenhuma.
     */
    registrar: (alunoId: string, dados: RegistrarExameInput): Promise<ExameResumo> =>
      this.supabase.registrarExame(alunoId, dados),

    /**
     * Ainda na API: anexar o laudo depende do armazenamento, que nao migrou.
     * Sai daqui quando a midia sair — junto com `arquivoUrl`, que por enquanto
     * volta nulo.
     */
    anexarLaudo: (
      alunoId: string,
      exameId: string,
      dados: AnexarLaudoInput,
    ): Promise<{ temArquivo: true }> =>
      this.requisicao<{ temArquivo: true }>(`/alunos/${alunoId}/exames/${exameId}/laudo`, {
        metodo: 'PATCH',
        corpo: dados,
      }),
  };

  // --- condições de saúde ------------------------------------------------------

  /**
   * Ler é dos três profissionais e do aluno; escrever é só do médico. Um
   * personal que não sabe da lesão no ombro prescreve o exercício errado.
   */
  readonly condicoes = {
    listar: (alunoId: string): Promise<CondicaoResumo[]> =>
      this.supabase.listarCondicoes(alunoId),

    /** So o medico escreve — quem barra e a politica, nao esta linha. */
    registrar: (alunoId: string, dados: RegistrarCondicaoInput): Promise<CondicaoResumo> =>
      this.supabase.registrarCondicao(alunoId, dados),

    resolver: (
      alunoId: string,
      condicaoId: string,
      dados: ResolverCondicaoInput = {},
    ): Promise<CondicaoResumo> => this.supabase.resolverCondicao(alunoId, condicaoId, dados),
  };

  // --- alertas clínicos cruzados ----------------------------------------------

  /**
   * O personal entra aqui — e só aqui. Ele não lê exame, mas recebe a
   * orientação derivada dele, sem marcador e sem valor.
   */
  /*
    O alerta ja chega filtrado pelo papel de quem pergunta: a politica confere
    `papelDestino`. O cliente nao repete esse filtro — repetir criaria um
    segundo lugar para a regra divergir, e o lugar errado seria justamente o
    que o usuario controla.
  */
  readonly alertas = {
    listar: (alunoId: string): Promise<AlertaResumo[]> => this.supabase.listarAlertas(alunoId),

    reconhecer: (
      alunoId: string,
      alertaId: string,
      dados: ReconhecerAlertaInput = {},
    ): Promise<AlertaResumo> =>
      this.supabase.reconhecerAlerta(alunoId, alertaId, dados.anotacao),
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

  readonly feedback = {
    /** Feedback pos-treino da carteira, o mais grave primeiro. */
    daCarteira: (dias = DIAS_PADRAO_FEEDBACK, apenasAtencao = false): Promise<PainelDeFeedback> =>
      this.requisicao<PainelDeFeedback>('/feedback', { query: { dias, apenasAtencao } }),
  };

  readonly comparativo = {
    /** Antes e depois de 30, 60, 90 ou 120 dias. */
    montar: (alunoId: string, dias = 60): Promise<ComparativoDeEvolucao> =>
      this.requisicao<ComparativoDeEvolucao>(`/alunos/${alunoId}/comparativo`, {
        query: { dias },
      }),
  };

  readonly metas = {
    /** O progresso vem aferido na hora, a partir de medidas e execuções. */
    listar: (alunoId: string): Promise<MetaResumo[]> => this.supabase.listarMetas(alunoId),

    criar: (alunoId: string, dados: CriarMetaInput): Promise<MetaResumo> =>
      this.supabase.criarMeta(alunoId, dados),

    /** Único caminho da meta LIVRE; nas demais, a aferição já basta. */
    concluir: (alunoId: string, metaId: string): Promise<MetaResumo> =>
      this.supabase.concluirMeta(alunoId, metaId, true),

    reabrir: (alunoId: string, metaId: string): Promise<MetaResumo> =>
      this.supabase.concluirMeta(alunoId, metaId, false),

    remover: (alunoId: string, metaId: string): Promise<void> =>
      this.supabase.removerMeta(alunoId, metaId),
  };

  readonly resumo = {
    /**
     * A tela inicial do profissional, numa chamada so.
     *
     * Uma chamada e o ponto: a alternativa era o navegador pedir os alunos e
     * depois perguntar por cada um, que e o N+1 do lado do cliente — pior que o
     * do servidor, porque cada volta paga a latencia da rede inteira.
     */
    doProfissional: (): Promise<ResumoDoProfissional> =>
      this.requisicao<ResumoDoProfissional>('/resumo'),
  };

  readonly progresso = {
    /** Frequência, volume, tempo, adesão e evolução de carga, numa chamada só. */
    painel: (alunoId: string, dias = 30): Promise<PainelDeProgresso> =>
      this.supabase.painelDeProgresso(alunoId, dias),
  };

  readonly recordes = {
    /** Marcas pessoais do aluno, conquista mais recente primeiro. */
    meus: (alunoId: string): Promise<MeusRecordes> => this.supabase.meusRecordes(alunoId),
  };

  readonly calorimetrias = {
    listar: (alunoId: string): Promise<CalorimetriaResumo[]> =>
      this.requisicao<CalorimetriaResumo[]>(`/alunos/${alunoId}/calorimetrias`),

    registrar: (alunoId: string, dados: RegistrarCalorimetriaInput): Promise<CalorimetriaResumo> =>
      this.requisicao<CalorimetriaResumo>(`/alunos/${alunoId}/calorimetrias`, { metodo: 'POST', corpo: dados }),

    remover: (alunoId: string, id: string): Promise<void> =>
      this.requisicao<void>(`/alunos/${alunoId}/calorimetrias/${id}`, { metodo: 'DELETE' }),
  };

  readonly cardio = {
    /** Atividades do período, cada uma com a estimativa de caloria. */
    listar: (alunoId: string, dias = 30): Promise<CardioResumo[]> =>
      this.requisicao<CardioResumo[]>(`/alunos/${alunoId}/cardio`, { query: { dias } }),

    /** Musculação e cardio separados; `null` onde faltou peso para estimar. */
    calorias: (alunoId: string, dias = 30): Promise<ResumoDeCalorias> =>
      this.requisicao<ResumoDeCalorias>(`/alunos/${alunoId}/cardio/calorias`, { query: { dias } }),

    /** Só o próprio aluno registra a atividade dele. */
    registrar: (alunoId: string, dados: RegistrarCardioInput): Promise<CardioResumo> =>
      this.requisicao<CardioResumo>(`/alunos/${alunoId}/cardio`, { metodo: 'POST', corpo: dados }),

    remover: (alunoId: string, id: string): Promise<void> =>
      this.requisicao<void>(`/alunos/${alunoId}/cardio/${id}`, { metodo: 'DELETE' }),
  };

  readonly checkins = {
    /** Mais recente primeiro — e a ordem que as telas usam. */
    listar: (alunoId: string, dias = 30): Promise<CheckinResumo[]> =>
      this.supabase.listarCheckins(alunoId, dias),

    /** Adesao, energia media e dias sem registro — alimenta o painel. */
    resumo: (alunoId: string, dias = 30): Promise<ResumoDeCheckins> =>
      this.supabase.resumoDeCheckins(alunoId, dias),

    /**
     * Repetir no mesmo dia corrige o anterior.
     *
     * A janela retroativa de tres dias e imposta por GATILHO, nao por esta
     * chamada: preencher tres meses de uma vez transformaria a adesao num
     * numero que a pessoa escreve em vez de um que ela vive, e quem quer
     * contornar isso e justamente quem escreve o pedido.
     */
    registrar: (alunoId: string, dados: RegistrarCheckinInput): Promise<CheckinResumo> =>
      this.supabase.registrarCheckin(alunoId, dados),
  };

  readonly medidas = {
    listar: (alunoId: string): Promise<MedidaResumo[]> => this.supabase.listarMedidas(alunoId),

    registrar: (alunoId: string, dados: RegistrarMedidaInput): Promise<MedidaResumo> =>
      this.supabase.registrarMedida(alunoId, dados),

    /**
     * Series prontas para grafico.
     *
     * A conta e feita no cliente, com a MESMA funcao de `@vivio/contracts` que
     * a API chama: e conta sobre medidas que quem pergunta ja pode ler, e uma
     * agregacao assim nao precisa de servidor — precisa de um lugar com teste.
     */
    evolucao: (
      alunoId: string,
      consulta: Partial<ConsultaEvolucao> = {},
    ): Promise<EvolucaoCorporal> => this.supabase.evolucaoCorporal(alunoId, consulta),
  };

  // --- nutrição -------------------------------------------------------------

  readonly alimentos = {
    listar: (consulta: Partial<ListarAlimentosQuery> = {}): Promise<AlimentoResumo[]> =>
      this.supabase.listarAlimentos(consulta),

    grupos: (): Promise<string[]> => this.supabase.gruposDeAlimento(),
  };

  readonly dietas = {
    listar: (alunoId: string): Promise<PlanoDietaResumo[]> =>
      this.supabase.listarDietas(alunoId),

    obterAtiva: (alunoId: string): Promise<PlanoDietaCompleto> =>
      this.supabase.dietaAtiva(alunoId),

    criar: (alunoId: string, dados: CriarPlanoDietaInput): Promise<PlanoDietaCompleto> =>
      this.supabase.criarDieta(alunoId, dados),

    /** Gera uma versão nova e arquiva a anterior — não sobrescreve. */
    novaVersao: (
      alunoId: string,
      planoId: string,
      dados: CriarPlanoDietaInput,
    ): Promise<PlanoDietaCompleto> => this.supabase.criarDieta(alunoId, dados, planoId),

    substitutos: (
      alunoId: string,
      itemId: string,
      tolerancia?: number,
    ): Promise<SubstitutoSugerido[]> => this.supabase.substitutosPara(itemId, { tolerancia }),

    registrarRefeicao: (
      alunoId: string,
      dados: RegistrarRefeicaoInput,
    ): Promise<RegistroDeRefeicao> => this.supabase.registrarRefeicao(alunoId, dados),

    registrosDoDia: (alunoId: string, data?: string): Promise<RegistroDeRefeicao[]> =>
      this.supabase.registrosDoDia(alunoId, data),
  };

  readonly agua = {
    resumo: (alunoId: string, data?: string): Promise<ResumoDeAgua> =>
      this.supabase.resumoDeAgua(alunoId, data),

    registrar: (alunoId: string, dados: RegistrarAguaInput): Promise<ResumoDeAgua> =>
      this.supabase.registrarAgua(alunoId, dados),

    /** Corrigir um toque errado: o app tem botao de volume rapido. */
    remover: (alunoId: string, registroId: string): Promise<void> =>
      this.supabase.removerAgua(alunoId, registroId),

    definirMeta: (
      alunoId: string,
      dados: DefinirMetaAguaInput,
    ): Promise<{ metaMlDia: number; horaInicio: number; horaFim: number }> =>
      this.supabase.definirMetaAgua(alunoId, dados),
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

  // --- site profissional ----------------------------------------------------

  readonly site = {
    meu: (): Promise<PerfilPublicoResumo | null> =>
      this.requisicao<PerfilPublicoResumo | null>('/site'),

    salvar: (dados: SalvarPerfilPublicoInput): Promise<PerfilPublicoResumo> =>
      this.requisicao<PerfilPublicoResumo>('/site', { metodo: 'PUT', corpo: dados }),

    listarPedidos: (): Promise<PedidoResumo[]> => this.requisicao<PedidoResumo[]>('/site/pedidos'),

    marcarAtendido: (id: string): Promise<void> =>
      this.requisicao<void>(`/site/pedidos/${id}/atendido`, { metodo: 'PATCH' }),

    /** Página pública — sem autenticação, é o ponto do recurso. */
    porSlug: (slug: string): Promise<PaginaPublica> =>
      this.requisicao<PaginaPublica>(`/p/${slug}`, { autenticada: false }),

    enviarPedido: (slug: string, dados: EnviarPedidoInput): Promise<void> =>
      this.requisicao<void>(`/p/${slug}/contato`, {
        metodo: 'POST',
        corpo: dados,
        autenticada: false,
      }),
  };

  // --- financeiro -----------------------------------------------------------

  readonly financeiro = {
    resumo: (consulta: Partial<ConsultaFinanceiro> = {}): Promise<ResumoFinanceiro> =>
      this.supabase.resumoFinanceiro(consulta),

    /** Devolve a cobrança e as parcelas geradas junto. */
    criar: (dados: CriarCobrancaInput): Promise<CobrancaResumo[]> =>
      this.supabase.criarCobranca(dados),

    registrarPagamento: (id: string, dados: RegistrarPagamentoInput): Promise<CobrancaResumo> =>
      this.supabase.registrarPagamento(id, dados),

    estornar: (id: string): Promise<CobrancaResumo> => this.supabase.estornarCobranca(id),

    cancelar: (id: string): Promise<CobrancaResumo> => this.supabase.cancelarCobranca(id),

    remover: (id: string): Promise<{ removidas: number }> =>
      this.supabase.removerCobranca(id),

    /** Chave PIX usada para montar o código das cobranças. */
    obterPagamento: (): Promise<DadosDePagamento | null> =>
      this.supabase.obterDadosDePagamento(),

    salvarPagamento: (dados: SalvarPagamentoInput): Promise<DadosDePagamento> =>
      this.supabase.salvarDadosDePagamento(dados),

    gerarPix: (id: string): Promise<CobrancaComPix> => this.supabase.gerarPix(id),
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
