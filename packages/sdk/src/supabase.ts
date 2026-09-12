import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  FINALIDADE_POR_ESCOPO,
  VERSAO_TERMO_ATUAL,
  hojeUtc,
  montarEvolucaoCorporal,
  contarClassificacoes,
  enriquecerMarcador,
  resumoDeAgua,
  resumoDeCheckins,
  ordenarPlanosDeTreino,
  seriesDeTrabalho,
  volumeKg,
  montarAnterioresDaSessao,
  montarHistoricoDeCarga,
  apurarRecordes,
  montarMeusRecordes,
  resumoDeTreinoNoPeriodo,
  montarEvolucaoDeCarga,
  variacaoDePeso,
  TipoMeta,
  montarMetaResumo,
  ordenarMetas,
  STATUS_ATIVOS,
  fimDoCompromisso,
  montarHorariosLivres,
  gerarBrCode,
  hojeSemHora,
  montarCobrancaResumo,
  montarResumoFinanceiro,
  normalizarChavePix,
  soData,
  somarMeses,
  validarChavePix,
  vencimentosDaSerie,
  macrosDaPorcao,
  montarPlanoDietaCompleto,
  montarSubstitutos,
  ordenarPorStatusDoPlano,
  montarModeloCardapioCompleto,
  planoAPartirDoModelo,
  playerExternoSeguro,
  ErroDeCalculo,
  calcularPorBioimpedancia,
  calcularPorDobras,
  estimarCalorias,
  gastoDiario,
  idadeEmAnos,
  metDe,
  validadeDaCalorimetria,
  MET_MUSCULACAO,
  podePrescrever,
  ROTULO_TIPO_PRESCRITIVEL,
  montarReceita,
  montarRefeicaoSalva,
  chaveDeMidia,
  partesDaChave,
  urlPublicaDoCatalogo,
  LIMITES_MIDIA,
} from '@vivio/contracts';
import type {
  AcessoRegistrado,
  RespostaResumo,
  AplicarAnamneseInput,
  AnamneseResumo,
  PosologiaInput,
  MudarStatusPrescricaoInput,
  EmitirPrescricaoInput,
  ItemPrescricaoResumo,
  PrescricaoResumo,
  Dobra,
  ResultadoComposicao,
  RegistrarAvaliacaoInput,
  AvaliacaoResumo,
  RegistrarCalorimetriaInput,
  CalorimetriaResumo,
  TipoCardio,
  Intensidade,
  DadosParaTmb,
  ResumoDeCalorias,
  RegistrarCardioInput,
  CardioResumo,
  CriarModeloPrescricaoInput,
  ModeloPrescricaoResumo,
  CriarPrescritivelInput,
  ListarPrescritiveisQuery,
  PrescritivelResumo,
  SalvarModeloAnamneseInput,
  ModeloAnamneseResumo,
  PerguntaResumo,
  SalvarRefeicaoInput,
  SalvarReceitaInput,
  RefeicaoSalvaResumo,
  ReceitaResumo,
  LinhaDeRefeicaoSalva,
  LinhaDeReceita,
  RegistrarFotoInput,
  FotoEvolucaoResumo,
  AnguloFoto,
  UrlAssinada,
  TipoMidia,
  MidiaDeExercicios,
  ListarExerciciosQuery,
  ExercicioAGravar,
  CriarExercicioInput,
  AtualizarExercicioInput,
  AnterioresDaSessao,
  ExecucaoResumo,
  HistoricoCarga,
  LinhaDeMeta,
  MetaResumo,
  MeusRecordes,
  MomentoDaDor,
  RecordeBatido,
  RegistrarExecucaoInput,
  SerieComExecucao,
  SerieExecutadaResumo,
  TipoDeDor,
  TipoSerie,
  AlimentoResumo,
  CriarMaterialInput,
  MaterialDoAluno,
  MaterialResumo,
  DefinirLembreteInput,
  LembreteResumo,
  NotificacaoResumo,
  RegistrarDispositivoInput,
  EnviarPedidoInput,
  PaginaPublica,
  PedidoResumo,
  PerfilPublicoResumo,
  SalvarPerfilPublicoInput,
  ConversaResumo,
  EnviarMensagemInput,
  ListarMensagensQuery,
  MensagemResumo,
  TipoConversa,
  TipoMensagem,
  AplicarModeloInput,
  CriarModeloCardapioInput,
  LinhaDeModeloCardapio,
  ModeloCardapioCompleto,
  ModeloCardapioResumo,
  SalvarComoModeloInput,
  BuscarSubstitutosQuery,
  CriarPlanoDietaInput,
  LinhaDePlanoDieta,
  PlanoDietaCompleto,
  PlanoDietaResumo,
  RegistrarRefeicaoInput,
  RegistroDeRefeicao,
  StatusRefeicao,
  SubstitutoSugerido,
  CobrancaComPix,
  CobrancaResumo,
  ConsultaFinanceiro,
  CriarCobrancaInput,
  DadosDePagamento,
  FormaPagamento,
  LinhaDeCobranca,
  RegistrarPagamentoInput,
  ResumoFinanceiro,
  SalvarPagamentoInput,
  CompromissoResumo,
  ConsultaAgenda,
  CriarBloqueioInput,
  CriarCompromissoInput,
  DefinirDisponibilidadeInput,
  HorarioLivre,
  JanelaDisponivel,
  MudarStatusInput,
  RemarcarCompromissoInput,
  StatusCompromisso,
  TipoCompromisso,
  Classificacao,
  ExameResumo,
  CheckinResumo,
  AlertaResumo,
  ConsultaAuditoria,
  CriarMetaInput,
  CriarPlanoTreinoInput,
  ConsultaEvolucao,
  EvolucaoCorporal,
  CondicaoResumo,
  ConcederConsentimentoInput,
  ConsentimentoResumo,
  EsqueciSenhaInput,
  ExercicioResumo,
  GrupoMuscular,
  LoginInput,
  PainelDeProgresso,
  Papel,
  PlanoTreinoCompleto,
  PlanoTreinoResumo,
  RegistrarAlunoInput,
  RegistrarProfissionalInput,
  RespostaAutenticacao,
  AtualizarPerfilInput,
  ListarAlimentosQuery,
  Marcador,
  MedidaParaSerie,
  MedidaResumo,
  MeuPerfil,
  DefinirMetaAguaInput,
  RegistrarAguaInput,
  RegistrarCheckinInput,
  RegistrarExameInput,
  RegistrarCondicaoInput,
  RegistrarMedidaInput,
  ResolverCondicaoInput,
  ResumoDeAgua,
  ResumoDeCheckins,
  SessaoTreinoResumo,
  SexoBiologico,
  RespostaRegistro,
  ResumoPessoa,
  UsuarioAutenticado,
  VinculoResumo,
} from '@vivio/contracts';
import { ErroApi } from './erro';

/**
 * O motor que fala com o Supabase, no lugar da API.
 *
 * ## Por que existe um "motor" e não a troca direta nas telas
 *
 * São 158 chamadas ao SDK entre web e mobile, e nenhuma delas fala HTTP: todas
 * passam pelo `VivioClient`. Trocando o que está DENTRO dele, nenhuma tela
 * muda — o que também significa que a migração pode ir por partes, com o app
 * no ar o tempo todo, em vez de um dia de virada.
 *
 * ## O que o Supabase Auth substitui
 *
 * Argon2, tabela de sessão, rodízio de refresh, cookie httpOnly, os dois
 * gatilhos de e-mail: tudo isso era código nosso, e era código de segurança —
 * o tipo mais caro de manter e o pior de errar. O `supabase-js` renova o token
 * sozinho antes de expirar, e por isso o `renovar()` do cliente antigo, com
 * toda a dança de concorrência que ele precisava, some junto.
 *
 * O que NÃO some é o resto do cadastro: a linha em `User` e o perfil. Isso
 * nasce de gatilho em `auth.users` (`10-conta-nova.sql`) e não daqui, porque
 * cadastro que depende de o cliente lembrar da segunda metade um dia fica pela
 * metade.
 */
export interface OpcoesSupabase {
  url: string;
  chaveAnonima: string;
  /**
   * Onde a sessão é guardada. No navegador o padrão do `supabase-js`
   * (localStorage) serve; no mobile entra o SecureStore, que é armazenamento
   * do sistema operacional.
   */
  armazenamento?: {
    getItem: (chave: string) => string | null | Promise<string | null>;
    setItem: (chave: string, valor: string) => void | Promise<void>;
    removeItem: (chave: string) => void | Promise<void>;
  };
  /** `false` no servidor do Next: lá não há onde guardar sessão. */
  persistirSessao?: boolean;
  /** Para onde o link de redefinição de senha volta. */
  urlDeRetorno?: string;
}

/**
 * Traduz o erro do Supabase para o `ErroApi` que as telas já tratam.
 *
 * As telas fazem `catch (e) { if (e instanceof ErroApi) ... }` em dezenas de
 * lugares. Deixar vazar o erro do `supabase-js` obrigaria a mexer em todas —
 * e, pior, a mensagem chegaria em inglês para quem usa o app em português.
 */
export function erroDoSupabase(e: { message?: string; status?: number; code?: string }): ErroApi {
  const bruto = e.message ?? '';
  const status = e.status ?? 400;

  // As três que o usuário realmente encontra, ditas na língua dele.
  if (/Invalid login credentials/i.test(bruto)) {
    return new ErroApi('CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.', 401);
  }
  if (/Email not confirmed/i.test(bruto)) {
    return new ErroApi('EMAIL_NAO_VERIFICADO', 'Confirme seu e-mail para entrar.', 403);
  }
  if (/already registered|already been registered/i.test(bruto)) {
    return new ErroApi('EMAIL_JA_CADASTRADO', 'Este e-mail já está cadastrado.', 409);
  }
  if (/rate limit|too many/i.test(bruto)) {
    return new ErroApi(
      'LIMITE_EXCEDIDO',
      'Muitas tentativas. Espere um pouco e tente de novo.',
      429,
    );
  }

  /*
    42501 é "insufficient_privilege", e chega por dois caminhos bem diferentes.

    Quando quem recusa é a POLÍTICA, a frase é do Postgres e não se mostra a
    ninguém — "new row violates row-level security policy for table ...". Ela
    também não deve virar explicação: do lado de fora a recusa é sempre uma das
    três condições faltando (sessão, vínculo, consentimento), e dizer qual já
    confirma que o aluno existe e que ele tem dado clínico.

    Quando quem recusa é um GATILHO NOSSO, a frase foi escrita para a tela:
    "Chave de arquivo não pertence a você.", "Este pedido já foi encerrado.",
    "Só um pedido pendente pode ser respondido.". São recusas por conteúdo
    errado, não por falta de acesso, e trocá-las pela genérica era jogar fora a
    única parte útil — a pessoa via "você não tem acesso" sobre um botão que
    ela tem acesso e ficava sem saber o que corrigir.

    A mesma distinção que o 23505 já fazia, pelo mesmo sinal: a mensagem do
    Postgres é reconhecível, e o que não é dele é nosso.
  */
  if (e.code === '42501' || status === 403) {
    const doPostgres =
      bruto === '' || /row-level security|permission denied|insufficient privilege/i.test(bruto);
    return new ErroApi(
      'ACESSO_NEGADO',
      doPostgres ? 'Você não tem acesso a este conteúdo.' : bruto,
      403,
    );
  }

  /*
    `PGRST116` é o `.single()` que não achou linha; `P0002` é o
    `raise ... using errcode = 'P0002'` das nossas funções. Os dois são "não
    existe", e sem esta linha chegavam às telas como ERRO_INTERNO 400 — que faz
    a tela mostrar "erro inesperado" onde deveria mostrar "não encontrado", e
    manda o app tentar de novo por ser um 4xx que parece falha nossa.

    No `P0002` a mensagem do banco passa inteira: ela foi escrita para ser lida
    ("Exercício (abc) não encontrado."), ao contrário da do PostgREST.
  */
  if (e.code === 'PGRST116') {
    return new ErroApi('RECURSO_NAO_ENCONTRADO', 'Recurso não encontrado.', 404);
  }
  if (e.code === 'P0002') {
    return new ErroApi('RECURSO_NAO_ENCONTRADO', bruto || 'Recurso não encontrado.', 404);
  }

  if (e.code === '23505') {
    /*
      Conflito escrito por nós tem frase de tela — "Este plano já está ativo.",
      "Este aluno já possui um profissional ativo do tipo PERSONAL". Trocá-la
      pela genérica era jogar fora a única parte útil. Já a do Postgres cru
      ("duplicate key value violates unique constraint \"Vinculo_pkey\"") não
      se mostra a ninguém.
    */
    const nossa = bruto !== '' && !/duplicate key|unique constraint/i.test(bruto);
    return new ErroApi('CONFLITO', nossa ? bruto : 'Esse registro já existe.', 409);
  }
  if (e.code === '23514') {
    // `check_violation`: a função recusou o conteúdo, e disse por quê.
    return new ErroApi('DADOS_INVALIDOS', bruto || 'Dados inválidos.', 422);
  }
  if (e.code === '23P01') {
    /*
      `exclusion_violation`: a restrição `EXCLUDE` da agenda. Ela é o que
      impede dois atendimentos no mesmo horário, e a mensagem crua do Postgres
      cita o nome da restrição — o profissional precisa da frase, não do nome.
    */
    return new ErroApi('CONFLITO', 'Você já tem um compromisso neste horário.', 409);
  }

  return new ErroApi('ERRO_INTERNO', bruto || 'Erro inesperado.', status, { causa: e.code });
}

export class MotorSupabase {
  readonly db: SupabaseClient;

  constructor(private readonly opcoes: OpcoesSupabase) {
    this.db = createClient(opcoes.url, opcoes.chaveAnonima, {
      auth: {
        persistSession: opcoes.persistirSessao ?? true,
        autoRefreshToken: opcoes.persistirSessao ?? true,
        /*
          O token vem na URL depois do link de e-mail (confirmação, redefinição).
          Só faz sentido no navegador; no mobile o link abre por deep link e o
          fluxo é outro.
        */
        detectSessionInUrl: typeof window !== 'undefined',
        ...(opcoes.armazenamento ? { storage: opcoes.armazenamento } : {}),
      },
    });
  }

  /** O token de agora, para quem precisa chamar uma função fora do PostgREST. */
  async token(): Promise<string | null> {
    const { data } = await this.db.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /**
   * Quem está logado, montado do TOKEN e não de uma consulta.
   *
   * O papel vem da claim `vivio_papel`, que o hook `token_com_id_vivio` põe
   * lá a cada login. Ler do token evita uma ida ao banco em todo boot de tela
   * — e, mais importante, garante que a tela e as políticas estão olhando o
   * MESMO papel: se o hook e a consulta divergissem, a tela mostraria um menu
   * que o banco depois recusa.
   */
  async usuarioAtual(): Promise<UsuarioAutenticado | null> {
    const { data } = await this.db.auth.getSession();
    const sessao = data.session;
    if (!sessao) return null;

    const claims = lerClaims(sessao.access_token);
    const id = claims?.vivio_id;
    if (!id) {
      /*
        Sem a claim, a conta existe no Auth e não tem linha em `User`. Acontece
        se o gatilho de cadastro falhar. Deixar passar seria pior que recusar:
        a tela abriria e toda consulta voltaria vazia, sem explicar por quê.
      */
      throw new ErroApi(
        'CONTA_INCOMPLETA',
        'Sua conta não terminou de ser criada. Fale com o suporte.',
        409,
      );
    }
    return {
      id,
      email: sessao.user.email ?? '',
      nome: (sessao.user.user_metadata?.nome as string | undefined) ?? '',
      papel: (claims.vivio_papel ?? 'ALUNO') as Papel,
    };
  }

  private montarResposta(sessao: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    user: { email?: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> };
  }): RespostaAutenticacao {
    const claims = lerClaims(sessao.access_token);
    return {
      accessToken: sessao.access_token,
      refreshToken: sessao.refresh_token,
      expiraEm: (sessao.expires_at ?? 0) * 1000,
      usuario: {
        id: claims?.vivio_id ?? '',
        email: sessao.user.email ?? '',
        nome: (sessao.user.user_metadata?.nome as string | undefined) ?? '',
        papel: (claims?.vivio_papel ?? 'ALUNO') as Papel,
        emailVerificado: Boolean(sessao.user.email_confirmed_at),
      },
    };
  }

  async entrar(dados: LoginInput): Promise<RespostaAutenticacao> {
    const { data, error } = await this.db.auth.signInWithPassword({
      email: dados.email.toLowerCase().trim(),
      password: dados.senha,
    });
    if (error || !data.session) throw erroDoSupabase(error ?? { message: 'Sessão não veio.' });
    return this.montarResposta(data.session);
  }

  async sair(): Promise<void> {
    await this.db.auth.signOut();
  }

  /**
   * Cadastro. O `data` vira `raw_user_meta_data`, que o gatilho lê.
   *
   * Nada aqui é confiável do lado do banco, e é assim que tem de ser: o gatilho
   * trata esse objeto como entrada de usuário, com lista fechada de papel. O
   * que o app manda é sugestão, não decisão.
   */
  private async cadastrar(
    email: string,
    senha: string,
    meta: Record<string, unknown>,
  ): Promise<RespostaRegistro> {
    const limpo = email.toLowerCase().trim();
    const { data, error } = await this.db.auth.signUp({
      email: limpo,
      password: senha,
      options: {
        data: meta,
        ...(this.opcoes.urlDeRetorno ? { emailRedirectTo: this.opcoes.urlDeRetorno } : {}),
      },
    });
    if (error || !data.user) throw erroDoSupabase(error ?? { message: 'Cadastro não retornou.' });

    return {
      usuario: {
        id: data.user.id,
        email: limpo,
        nome: (meta.nome as string) ?? '',
        papel: (meta.papel as Papel) ?? 'ALUNO',
      },
      precisaConfirmarEmail: true,
    };
  }

  registrarAluno(d: RegistrarAlunoInput): Promise<RespostaRegistro> {
    return this.cadastrar(d.email, d.senha, {
      nome: d.nome.trim(),
      telefone: d.telefone,
      papel: 'ALUNO',
      dataNascimento: d.dataNascimento,
      alturaCm: d.alturaCm,
      objetivo: d.objetivo,
    });
  }

  registrarProfissional(d: RegistrarProfissionalInput): Promise<RespostaRegistro> {
    return this.cadastrar(d.email, d.senha, {
      nome: d.nome.trim(),
      telefone: d.telefone,
      papel: d.tipo,
      registroConselho: d.registroConselho.trim(),
      ufRegistro: d.ufRegistro.toUpperCase(),
      especialidades: d.especialidades,
      bio: d.bio,
    });
  }

  /**
   * Responde igual exista o e-mail ou não — a tela não deve inventar diferença.
   * Descobrir quem tem conta num app de saúde já é informação.
   */
  async esqueciSenha(d: EsqueciSenhaInput): Promise<void> {
    await this.db.auth.resetPasswordForEmail(d.email.toLowerCase().trim(), {
      ...(this.opcoes.urlDeRetorno ? { redirectTo: this.opcoes.urlDeRetorno } : {}),
    });
  }

  /** O link já abriu a sessão; aqui só se troca a senha dela. */
  async redefinirSenha(senhaNova: string): Promise<RespostaAutenticacao> {
    const { error } = await this.db.auth.updateUser({ password: senhaNova });
    if (error) throw erroDoSupabase(error);
    const { data } = await this.db.auth.getSession();
    // TOKEN_INVALIDO e não um código novo: `exigeNovoLogin` já é true nele, e
    // é isso que a tela precisa fazer.
    if (!data.session) throw new ErroApi('TOKEN_INVALIDO', 'O link expirou. Peça outro.', 401);
    return this.montarResposta(data.session);
  }

  async reenviarVerificacao(email: string): Promise<void> {
    await this.db.auth.resend({ type: 'signup', email: email.toLowerCase().trim() });
  }

  // --- dados -------------------------------------------------------------

  /**
   * Desembrulha a resposta do PostgREST, ou lança o `ErroApi` que as telas já
   * sabem tratar.
   *
   * Existe para que nenhum método precise repetir `if (error) throw` — que é o
   * tipo de linha que um dia falta em um lugar só.
   */
  private ou<T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T {
    if (r.error) throw erroDoSupabase(r.error);
    return r.data as T;
  }

  /**
   * UPDATE que não pegou nenhuma linha é recusa, e precisa doer.
   *
   * INSERT sem política ERRA; UPDATE sem política afeta ZERO linhas e
   * responde 200. Do lado de fora isso chega como sucesso: a tela diz
   * "salvo" sobre coisa nenhuma, e a pessoa descobre na próxima vez que
   * abrir. Com `.select()` a resposta traz o que mudou — vazio quer dizer
   * que a política não deixou, e aí é a mesma recusa de sempre.
   */
  private async exigirLinhaAlterada(
    consulta: PromiseLike<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>,
  ): Promise<void> {
    const r = await consulta;
    if (r.error) throw erroDoSupabase(r.error);
    if ((r.data ?? []).length === 0) {
      throw new ErroApi('ACESSO_NEGADO', 'Você não tem acesso a este conteúdo.', 403);
    }
  }

  /** Chama uma função do banco. */
  async rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = await this.db.rpc(nome, args);
    if (r.error) throw erroDoSupabase(r.error);
    return r.data as T;
  }

  private async meuId(): Promise<string> {
    const u = await this.usuarioAtual();
    if (!u) throw new ErroApi('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.', 401);
    return u.id;
  }

  // --- vínculo ------------------------------------------------------------

  /*
    Os dois lados de um vínculo, embutidos numa consulta só.

    `!Vinculo_alunoId_fkey` nomeia a chave estrangeira porque `Vinculo` aponta
    DUAS vezes para `User` — sem o nome, o PostgREST não sabe qual das duas
    ligações usar e recusa a consulta.
  */
  private static readonly CAMPOS_VINCULO =
    'id,tipo,status,iniciadoEm,encerradoEm,alunoId,convidadoPorId,' +
    'aluno:User!Vinculo_alunoId_fkey(id,nome,email,avatarUrl),' +
    'profissional:User!Vinculo_profissionalId_fkey(id,nome,email,avatarUrl)';

  /**
   * A contraparte é quem está do outro lado EM RELAÇÃO A QUEM PERGUNTA: o
   * mesmo vínculo mostra o aluno para o profissional e o profissional para o
   * aluno. Quem decide isso é o id de quem consultou, e por isso ele entra.
   */
  private paraVinculo(v: LinhaVinculo, eu: string): VinculoResumo {
    const souOAluno = v.alunoId === eu;
    return {
      id: v.id,
      tipo: v.tipo as VinculoResumo['tipo'],
      status: v.status as VinculoResumo['status'],
      iniciadoEm: instanteOuNulo(v.iniciadoEm),
      encerradoEm: instanteOuNulo(v.encerradoEm),
      contraparte: souOAluno ? v.profissional : v.aluno,
      // Convite que quem mandou pudesse aceitar não seria convite.
      aguardandoMinhaResposta: v.status === 'PENDENTE' && v.convidadoPorId !== eu,
    };
  }

  async vinculosOndeSou(
    lado: 'profissional' | 'aluno',
    status?: string,
  ): Promise<VinculoResumo[]> {
    const eu = await this.meuId();
    let q = this.db
      .from('Vinculo')
      .select(MotorSupabase.CAMPOS_VINCULO)
      .eq(lado === 'aluno' ? 'alunoId' : 'profissionalId', eu)
      .order('criadoEm', { ascending: false });
    if (status) q = q.eq('status', status);
    const linhas = this.ou(await q) as unknown as LinhaVinculo[];
    return linhas.map((v) => this.paraVinculo(v, eu));
  }

  /** Depois de convidar ou responder, devolve o vínculo já montado. */
  private async vinculoPorId(id: string): Promise<VinculoResumo> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db.from('Vinculo').select(MotorSupabase.CAMPOS_VINCULO).eq('id', id).single(),
    ) as unknown as LinhaVinculo;
    return this.paraVinculo(linha, eu);
  }

  /*
    Convidar e responder passam por FUNÇÃO, e não por escrita direta.

    As regras do vínculo são transições com invariante — quem convidou não
    aceita o próprio convite, um profissional ativo por tipo, registro no
    conselho conferido — e nada disso cabe num `with check`, que só enxerga a
    linha nova. Por isso a tabela não tem política de escrita nenhuma.
  */
  async convidarVinculo(email: string): Promise<VinculoResumo> {
    return this.vinculoPorId(await this.rpc<string>('convidar_vinculo', { p_email: email }));
  }

  async responderVinculo(
    id: string,
    acao: 'ACEITAR' | 'RECUSAR' | 'ENCERRAR',
  ): Promise<VinculoResumo> {
    return this.vinculoPorId(
      await this.rpc<string>('responder_vinculo', { p_vinculo_id: id, p_acao: acao }),
    );
  }

  // --- consentimento ------------------------------------------------------

  async listarConsentimentos(incluirRevogados = false): Promise<ConsentimentoResumo[]> {
    const eu = await this.meuId();
    let q = this.db
      .from('Consentimento')
      .select(
        'id,escopo,finalidade,versaoTermo,concedidoEm,revogadoEm,' +
          'profissional:User!Consentimento_profissionalId_fkey(id,nome,email,avatarUrl)',
      )
      .eq('alunoId', eu)
      .order('concedidoEm', { ascending: false });
    if (!incluirRevogados) q = q.is('revogadoEm', null);

    return (this.ou(await q) as unknown as LinhaConsentimento[]).map((c) => ({
      id: c.id,
      escopo: c.escopo as ConsentimentoResumo['escopo'],
      finalidade: c.finalidade,
      versaoTermo: c.versaoTermo,
      concedidoEm: instante(c.concedidoEm),
      revogadoEm: instanteOuNulo(c.revogadoEm),
      profissional: c.profissional,
    }));
  }

  async concederConsentimento(dados: ConcederConsentimentoInput): Promise<ConsentimentoResumo> {
    const eu = await this.meuId();
    const id = `${eu}-${dados.escopo}-${Date.now()}`;
    /*
      A finalidade não vem da tela: vem de `FINALIDADE_POR_ESCOPO`, no contrato.

      É o texto que o aluno leu ao aceitar, e é a prova de finalidade específica
      que a LGPD pede. Deixar o cliente escolhê-lo faria a prova valer nada —
      qualquer um poderia gravar "autorizo tudo" no lugar do termo real.
    */
    const linha = this.ou(
      await this.db
        .from('Consentimento')
        .insert({
          id,
          alunoId: eu,
          escopo: dados.escopo,
          profissionalId: dados.profissionalId ?? null,
          finalidade: FINALIDADE_POR_ESCOPO[dados.escopo],
          versaoTermo: VERSAO_TERMO_ATUAL,
        })
        .select(
          'id,escopo,finalidade,versaoTermo,concedidoEm,revogadoEm,' +
            'profissional:User!Consentimento_profissionalId_fkey(id,nome,email,avatarUrl)',
        )
        .single(),
    ) as unknown as LinhaConsentimento;

    return {
      id: linha.id,
      escopo: linha.escopo as ConsentimentoResumo['escopo'],
      finalidade: linha.finalidade,
      versaoTermo: linha.versaoTermo,
      concedidoEm: instante(linha.concedidoEm),
      revogadoEm: instanteOuNulo(linha.revogadoEm),
      profissional: linha.profissional,
    };
  }

  /**
   * Revogar é marcar a data, nunca apagar a linha.
   *
   * O consentimento revogado é a prova de que ele existiu e de quando deixou de
   * valer — apagar destruiria justamente o registro que a LGPD manda guardar.
   */
  async revogarConsentimento(id: string): Promise<void> {
    const eu = await this.meuId();
    this.ou(
      await this.db
        .from('Consentimento')
        .update({ revogadoEm: new Date().toISOString() })
        .eq('id', id)
        .eq('alunoId', eu)
        .is('revogadoEm', null),
    );
  }

  // --- alerta clínico -----------------------------------------------------

  /*
    A política já filtra por `papelDestino`: cada um recebe só os avisos
    endereçados ao papel dele. Não há filtro a repetir aqui — repetir seria
    criar um segundo lugar para a regra divergir.

    `marcadorOrigem` e `exameId` vêm nulos para quem não pode vê-los porque a
    linha NASCEU sem eles, e não porque alguém os apagou na saída. Ver
    `13-colunas-sensiveis.sql`.
  */
  async listarAlertas(alunoId: string): Promise<AlertaResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('AlertaClinico')
        .select(
          'id,papelDestino,severidade,titulo,orientacao,marcadorOrigem,exameId,condicaoId,' +
            'criadoEm,reconhecidoEm,' +
            'reconhecidoPor:User!AlertaClinico_reconhecidoPorId_fkey(id,nome)',
        )
        .eq('alunoId', alunoId)
        // Pendente primeiro; entre iguais, o mais novo antes.
        .order('reconhecidoEm', { ascending: true, nullsFirst: true })
        .order('criadoEm', { ascending: false })
        .limit(100),
    ) as unknown as LinhaAlerta[];

    return linhas.map((a) => ({
      id: a.id,
      papelDestino: a.papelDestino as AlertaResumo['papelDestino'],
      severidade: a.severidade as AlertaResumo['severidade'],
      titulo: a.titulo,
      orientacao: a.orientacao,
      marcadorOrigem: a.marcadorOrigem,
      exameId: a.exameId,
      condicaoId: a.condicaoId,
      criadoEm: instante(a.criadoEm),
      reconhecidoEm: instanteOuNulo(a.reconhecidoEm),
      reconhecidoPor: a.reconhecidoPor,
    }));
  }

  async reconhecerAlerta(
    alunoId: string,
    alertaId: string,
    anotacao?: string,
  ): Promise<AlertaResumo> {
    /*
      `reconhecidoEm` e `reconhecidoPorId` NÃO são mandados: o gatilho os
      carimba. Mandar o "quem" do lado do cliente seria deixar a assinatura do
      reconhecimento ser escolhida por quem assina.
    */
    this.ou(
      await this.db
        .from('AlertaClinico')
        .update({ reconhecidoEm: new Date().toISOString(), anotacao: anotacao ?? null })
        .eq('id', alertaId)
        .eq('alunoId', alunoId),
    );
    const lista = await this.listarAlertas(alunoId);
    const alvo = lista.find((a) => a.id === alertaId);
    if (!alvo) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Alerta não encontrado.', 404);
    return alvo;
  }

  // --- condição de saúde --------------------------------------------------

  private static readonly CAMPOS_CONDICAO =
    'id,tipo,descricao,regiao,gravidade,inicioEm,observacao,criadoEm,resolvidaEm,' +
    'registradoPor:User!CondicaoSaude_registradoPorId_fkey(id,nome),' +
    'resolvidaPor:User!CondicaoSaude_resolvidaPorId_fkey(id,nome)';

  private paraCondicao(c: LinhaCondicao): CondicaoResumo {
    return {
      id: c.id,
      tipo: c.tipo as CondicaoResumo['tipo'],
      descricao: c.descricao,
      regiao: c.regiao as CondicaoResumo['regiao'],
      gravidade: c.gravidade as CondicaoResumo['gravidade'],
      inicioEm: c.inicioEm,
      observacao: c.observacao,
      registradoPor: c.registradoPor,
      criadoEm: instante(c.criadoEm),
      resolvidaEm: instanteOuNulo(c.resolvidaEm),
      resolvidaPor: c.resolvidaPor,
    };
  }

  async listarCondicoes(alunoId: string): Promise<CondicaoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('CondicaoSaude')
        .select(MotorSupabase.CAMPOS_CONDICAO)
        .eq('alunoId', alunoId)
        // Ativas primeiro: é a lista de "o que respeitar hoje".
        .order('resolvidaEm', { ascending: true, nullsFirst: true })
        .order('criadoEm', { ascending: false }),
    ) as unknown as LinhaCondicao[];
    return linhas.map((c) => this.paraCondicao(c));
  }

  async registrarCondicao(
    alunoId: string,
    dados: RegistrarCondicaoInput,
  ): Promise<CondicaoResumo> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('CondicaoSaude')
        .insert({
          id: `${alunoId}-${Date.now()}`,
          alunoId,
          registradoPorId: eu,
          tipo: dados.tipo,
          descricao: dados.descricao,
          regiao: dados.regiao ?? null,
          gravidade: dados.gravidade,
          inicioEm: dados.inicioEm ?? null,
          observacao: dados.observacao ?? null,
        })
        .select(MotorSupabase.CAMPOS_CONDICAO)
        .single(),
    ) as unknown as LinhaCondicao;
    return this.paraCondicao(linha);
  }

  /**
   * Dar alta. O alerta que a condição gerou some junto, por gatilho — deixá-lo
   * pendente faria o personal continuar evitando agachamento por uma lesão que
   * já teve alta.
   */
  async resolverCondicao(
    alunoId: string,
    condicaoId: string,
    dados: ResolverCondicaoInput = {},
  ): Promise<CondicaoResumo> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('CondicaoSaude')
        .update({
          resolvidaEm: new Date().toISOString(),
          resolvidaPorId: eu,
          ...(dados.observacao === undefined ? {} : { observacao: dados.observacao }),
        })
        .eq('id', condicaoId)
        .eq('alunoId', alunoId)
        .select(MotorSupabase.CAMPOS_CONDICAO)
        .single(),
    ) as unknown as LinhaCondicao;
    return this.paraCondicao(linha);
  }


  // --- medida corporal ----------------------------------------------------

  private static readonly CAMPOS_MEDIDA =
    'id,data,pesoKg,percentualGordura,massaMagraKg,cinturaCm,quadrilCm,bracoCm,coxaCm,toraxCm,fonte';

  private paraMedida(m: Record<string, unknown>): MedidaResumo {
    return {
      id: m.id as string,
      data: String(m.data).slice(0, 10),
      pesoKg: n(m.pesoKg),
      percentualGordura: n(m.percentualGordura),
      massaMagraKg: n(m.massaMagraKg),
      cinturaCm: n(m.cinturaCm),
      quadrilCm: n(m.quadrilCm),
      bracoCm: n(m.bracoCm),
      coxaCm: n(m.coxaCm),
      toraxCm: n(m.toraxCm),
      fonte: m.fonte as string,
    };
  }

  async listarMedidas(alunoId: string): Promise<MedidaResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('Medida')
        .select(MotorSupabase.CAMPOS_MEDIDA)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .order('data', { ascending: false })
        .limit(200),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((m) => this.paraMedida(m));
  }

  async registrarMedida(alunoId: string, dados: RegistrarMedidaInput): Promise<MedidaResumo> {
    const eu = await this.meuId();
    const dia = (dados.data instanceof Date ? dados.data : new Date(dados.data))
      .toISOString()
      .slice(0, 10);
    /*
      `upsert` e não `insert`: a tabela tem unique (aluno, data), e pesar duas
      vezes no mesmo dia é corrigir a primeira, não criar uma segunda. Era o
      que a API fazia; um `insert` puro devolveria "já existe" para quem só
      digitou o peso errado.

      `atualizadoEm` vai à mão porque `@updatedAt` é do Prisma, não do
      Postgres: pelo PostgREST não há quem o preencha.
    */
    const linha = this.ou(
      await this.db
        .from('Medida')
        .upsert(
          {
            id: `${alunoId}-${dia}`,
            alunoId,
            ...dados,
            data: dia,
            registradoPorId: eu,
            deletadoEm: null,
            atualizadoEm: new Date().toISOString(),
          },
          { onConflict: 'alunoId,data' },
        )
        .select(MotorSupabase.CAMPOS_MEDIDA)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraMedida(linha);
  }

  /**
   * As séries do gráfico, calculadas aqui a partir das linhas.
   *
   * O cálculo mora em `@vivio/contracts` — a MESMA função que a API chama
   * enquanto ela existe. Não precisa de servidor: é conta sobre medidas que
   * quem pergunta já pode ler, e se não pudesse a política não as teria
   * devolvido.
   *
   * Vem em ordem CRESCENTE de data, ao contrário da listagem: `de`, `ate` e a
   * variação saem do primeiro e do último ponto.
   */
  async evolucaoCorporal(
    alunoId: string,
    consulta: Partial<ConsultaEvolucao> = {},
  ): Promise<EvolucaoCorporal> {
    let q = this.db
      .from('Medida')
      .select(MotorSupabase.CAMPOS_MEDIDA)
      .eq('alunoId', alunoId)
      .is('deletadoEm', null)
      .order('data', { ascending: true })
      .limit(consulta.limit ?? 60);
    if (consulta.de) q = q.gte('data', consulta.de);
    if (consulta.ate) q = q.lte('data', consulta.ate);

    const linhas = this.ou(await q) as unknown as MedidaParaSerie[];
    return montarEvolucaoCorporal(linhas);
  }

  // --- meu cadastro -------------------------------------------------------

  /*
    A chave estrangeira vai NOMEADA porque `PerfilProfissional` aponta duas
    vezes para `User` — o dono do perfil e o admin que o verificou. Sem o nome,
    o PostgREST recusa a consulta com "more than one relationship was found",
    que é o certo: adivinhar qual das duas ligações usar seria pior.
  */
  private static readonly CAMPOS_PERFIL =
    'id,nome,email,telefone,papel,emailVerifEm,' +
    'perfilProfissional:PerfilProfissional!PerfilProfissional_userId_fkey' +
    '(tipo,registroConselho,ufRegistro,especialidades,bio,verificadoEm,recusadoEm,motivoRecusa),' +
    'perfilAluno:PerfilAluno!PerfilAluno_userId_fkey(alturaCm,sexoBiologico,dataNascimento)';

  private paraPerfil(u: Record<string, unknown>): MeuPerfil {
    /*
      O PostgREST devolve relação um-para-um ora como objeto, ora como arranjo
      de um elemento, conforme consiga provar a unicidade pela chave. Aceitar
      os dois evita um `undefined` que só aparece em produção, num perfil que
      o teste não cobriu.
    */
    const um = <T>(v: unknown): T | null =>
      Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null);

    const pro = um<Record<string, unknown>>(u.perfilProfissional);
    const aluno = um<Record<string, unknown>>(u.perfilAluno);

    return {
      id: u.id as string,
      nome: u.nome as string,
      email: u.email as string,
      telefone: (u.telefone as string | null) ?? null,
      papel: u.papel as MeuPerfil['papel'],
      emailVerificado: u.emailVerifEm !== null,
      profissional: pro
        ? {
            tipo: pro.tipo as MeuPerfil['papel'],
            registroConselho: pro.registroConselho as string,
            ufRegistro: pro.ufRegistro as string,
            especialidades: (pro.especialidades as string[]) ?? [],
            bio: (pro.bio as string | null) ?? null,
            verificadoEm: instanteOuNulo(pro.verificadoEm),
            recusadoEm: instanteOuNulo(pro.recusadoEm),
            motivoRecusa: (pro.motivoRecusa as string | null) ?? null,
          }
        : null,
      aluno: aluno
        ? {
            alturaCm: n(aluno.alturaCm),
            sexoBiologico: (aluno.sexoBiologico as MeuPerfil['aluno'] extends null
              ? never
              : NonNullable<MeuPerfil['aluno']>['sexoBiologico']) ?? null,
            dataNascimento: String(aluno.dataNascimento).slice(0, 10),
          }
        : null,
    };
  }

  async meuPerfil(): Promise<MeuPerfil> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db.from('User').select(MotorSupabase.CAMPOS_PERFIL).eq('id', eu).single(),
    ) as unknown as Record<string, unknown>;
    return this.paraPerfil(linha);
  }

  /**
   * Salvar o cadastro. Até três escritas, porque são três tabelas.
   *
   * O que NÃO está aqui é tão importante quanto o que está: trocar o registro
   * no conselho revoga a verificação, e quem faz isso é o gatilho no banco. Se
   * fosse o cliente a mandar `verificadoEm: null`, bastaria não mandar.
   */
  async atualizarMeuPerfil(dados: AtualizarPerfilInput): Promise<MeuPerfil> {
    const eu = await this.meuId();

    this.ou(
      await this.db
        .from('User')
        .update({ nome: dados.nome.trim(), telefone: dados.telefone ?? null })
        .eq('id', eu),
    );

    const atual = await this.meuPerfil();

    if (atual.profissional) {
      this.ou(
        await this.db
          .from('PerfilProfissional')
          .update({
            bio: dados.bio ?? null,
            especialidades: dados.especialidades.map((e) => e.trim()),
            ...(dados.registroConselho
              ? { registroConselho: dados.registroConselho.trim() }
              : {}),
            ...(dados.ufRegistro ? { ufRegistro: dados.ufRegistro.toUpperCase() } : {}),
          })
          .eq('userId', eu),
      );
    }

    if (atual.aluno && (dados.alturaCm !== undefined || dados.sexoBiologico !== undefined)) {
      this.ou(
        await this.db
          .from('PerfilAluno')
          .update({
            ...(dados.alturaCm !== undefined ? { alturaCm: dados.alturaCm } : {}),
            ...(dados.sexoBiologico !== undefined
              ? { sexoBiologico: dados.sexoBiologico }
              : {}),
          })
          .eq('userId', eu),
      );
    }

    return this.meuPerfil();
  }

  // --- quem viu meus dados ------------------------------------------------

  /**
   * O direito do titular de saber quem acessou os dados dele.
   *
   * A política já garante o essencial: só o próprio aluno lê a auditoria dele
   * — nem o profissional, nem o admin. O filtro por `alunoId` aqui é o do
   * PostgREST, não a defesa; a defesa é a política.
   *
   * ## A paginação mudou de mecânica sem mudar de formato
   *
   * O Prisma paginava por `cursor: { id }`, que o PostgREST não tem. Aqui é
   * keyset por `criadoEm`, com o id como desempate — e o cursor continua sendo
   * o id da última linha, exatamente como antes. Manter o formato importa: uma
   * página pedida pela API e continuada por aqui (ou o contrário) não pode
   * quebrar enquanto os dois caminhos convivem.
   *
   * O desempate por id não é preciosismo: dois acessos gravados no mesmo
   * instante são comuns — um mesmo carregamento de tela gera vários — e sem
   * ele a página seguinte repetiria ou pularia linhas.
   */
  async meusAcessos(
    consulta: Partial<ConsultaAuditoria> = {},
  ): Promise<{ dados: AcessoRegistrado[]; proximoCursor: string | null }> {
    const eu = await this.meuId();
    const limite = consulta.limit ?? 30;

    let q = this.db
      .from('LogAuditoria')
      .select('id,acao,recursoTipo,escopo,criadoEm,ator:User!LogAuditoria_atorId_fkey(id,nome,papel)')
      .eq('alunoId', eu)
      // O próprio acesso do aluno aos seus dados não polui a lista.
      .neq('atorId', eu)
      .order('criadoEm', { ascending: false })
      .order('id', { ascending: false })
      // Um a mais do que cabe: é assim que se sabe se há próxima página sem
      // contar o total.
      .limit(limite + 1);

    if (consulta.escopo) q = q.eq('escopo', consulta.escopo);

    if (consulta.cursor) {
      const ancora = await this.db
        .from('LogAuditoria')
        .select('criadoEm')
        .eq('id', consulta.cursor)
        .maybeSingle();
      const quando = (ancora.data as { criadoEm: string } | null)?.criadoEm;
      // Cursor que não existe mais devolve a primeira página, e não erro: a
      // linha pode ter saído entre uma página e outra.
      if (quando) {
        q = q.or(
          `criadoEm.lt.${quando},and(criadoEm.eq.${quando},id.lt.${consulta.cursor})`,
        );
      }
    }

    const linhas = this.ou(await q) as unknown as LinhaAuditoria[];
    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;

    return {
      dados: pagina.map((r) => ({
        id: r.id,
        acao: r.acao as AcessoRegistrado['acao'],
        recursoTipo: r.recursoTipo,
        escopo: r.escopo as AcessoRegistrado['escopo'],
        criadoEm: instante(r.criadoEm),
        ator: r.ator,
      })),
      proximoCursor: temMais ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  // --- check-in diário ----------------------------------------------------

  private static readonly CAMPOS_CHECKIN =
    'id,data,treinou,energia,teveDor,localDor,observacao,criadoEm';

  private paraCheckin(c: Record<string, unknown>): CheckinResumo {
    return {
      id: c.id as string,
      // A coluna é DATE em UTC. Formatar pelo fuso local deslocaria o dia — e
      // é justamente o dia que o check-in significa.
      data: String(c.data).slice(0, 10),
      treinou: c.treinou as boolean,
      energia: c.energia as number,
      teveDor: c.teveDor as boolean,
      localDor: (c.localDor as string | null) ?? null,
      observacao: (c.observacao as string | null) ?? null,
      criadoEm: instante(c.criadoEm),
    };
  }

  async listarCheckins(alunoId: string, dias = 30): Promise<CheckinResumo[]> {
    const de = new Date(hojeUtc().getTime() - (dias - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const linhas = this.ou(
      await this.db
        .from('CheckinDiario')
        .select(MotorSupabase.CAMPOS_CHECKIN)
        .eq('alunoId', alunoId)
        .gte('data', de)
        .order('data', { ascending: false }),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((c) => this.paraCheckin(c));
  }

  /**
   * O painel do profissional. A conta mora em `@vivio/contracts`, e a decisão
   * que importa nela é o denominador da adesão: dias COM check-in, não dias do
   * período — quem não registrou não deixou de treinar, apenas não contou.
   */
  async resumoDeCheckins(alunoId: string, dias = 30): Promise<ResumoDeCheckins> {
    return resumoDeCheckins(await this.listarCheckins(alunoId, dias), dias);
  }

  /**
   * Registrar de novo no mesmo dia CORRIGE o anterior, em vez de criar outro:
   * quem marcou "não treinei" de manhã e treinou à noite precisa consertar.
   *
   * A janela retroativa e a limpeza de `localDor` sem dor ficam no gatilho, e
   * não aqui: são regras que o cliente teria interesse em contornar.
   */
  async registrarCheckin(
    alunoId: string,
    dados: RegistrarCheckinInput,
  ): Promise<CheckinResumo> {
    const linha = this.ou(
      await this.db
        .from('CheckinDiario')
        .upsert(
          {
            id: `${alunoId}-${dados.data}`,
            alunoId,
            data: dados.data,
            treinou: dados.treinou,
            energia: dados.energia,
            teveDor: dados.teveDor,
            localDor: dados.localDor ?? null,
            observacao: dados.observacao ?? null,
            atualizadoEm: new Date().toISOString(),
          },
          { onConflict: 'alunoId,data' },
        )
        .select(MotorSupabase.CAMPOS_CHECKIN)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraCheckin(linha);
  }

  // --- água ---------------------------------------------------------------

  /**
   * O copo do dia. A conta mora em `@vivio/contracts` — a mesma que a API
   * chama enquanto ela existe.
   *
   * Duas consultas em paralelo, e não um embed: `MetaAgua` é uma linha por
   * aluno e `RegistroAgua` são várias por dia; embutir uma na outra faria o
   * PostgREST repetir a meta em cada gole.
   */
  async resumoDeAgua(alunoId: string, data?: string): Promise<ResumoDeAgua> {
    const dia = data ?? new Date().toISOString().slice(0, 10);

    const [meta, registros] = await Promise.all([
      this.db.from('MetaAgua').select('metaMlDia').eq('alunoId', alunoId).maybeSingle(),
      this.db
        .from('RegistroAgua')
        .select('id,volumeMl,registradoEm')
        .eq('alunoId', alunoId)
        .eq('data', dia)
        .order('registradoEm', { ascending: false }),
    ]);

    return resumoDeAgua(
      dia,
      (this.ou(meta) as { metaMlDia: number } | null)?.metaMlDia ?? null,
      (
        this.ou(registros) as unknown as {
          id: string;
          volumeMl: number;
          registradoEm: string;
        }[]
      ).map((r) => ({ ...r, registradoEm: instante(r.registradoEm) })),
    );
  }

  async registrarAgua(alunoId: string, dados: RegistrarAguaInput): Promise<ResumoDeAgua> {
    const dia =
      dados.data instanceof Date
        ? dados.data.toISOString().slice(0, 10)
        : String(dados.data).slice(0, 10);
    this.ou(
      await this.db.from('RegistroAgua').insert({
        id: `${alunoId}-${Date.now()}`,
        alunoId,
        data: dia,
        volumeMl: dados.volumeMl,
      }),
    );
    return this.resumoDeAgua(alunoId, dia);
  }

  /**
   * Apagar é corrigir um toque errado — o app tem botões de volume rápido, e
   * marcar 750 ml em vez de 200 acontece.
   *
   * O `alunoId` no filtro não é a defesa (a política é), mas evita uma ida ao
   * banco que apagaria zero linhas e pareceria sucesso.
   */
  async removerAgua(alunoId: string, registroId: string): Promise<void> {
    this.ou(
      await this.db.from('RegistroAgua').delete().eq('id', registroId).eq('alunoId', alunoId),
    );
  }

  async definirMetaAgua(
    alunoId: string,
    dados: DefinirMetaAguaInput,
  ): Promise<{ metaMlDia: number; horaInicio: number; horaFim: number }> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('MetaAgua')
        .upsert(
          {
            id: alunoId,
            alunoId,
            definidoPorId: eu,
            metaMlDia: dados.metaMlDia,
            horaInicio: dados.horaInicio,
            horaFim: dados.horaFim,
          },
          { onConflict: 'alunoId' },
        )
        .select('metaMlDia,horaInicio,horaFim')
        .single(),
    ) as unknown as { metaMlDia: number; horaInicio: number; horaFim: number };
    return linha;
  }

  // --- exame ---------------------------------------------------------------

  /*
    `chaveArquivo` NÃO entra na lista de colunas — o `grant` do banco nem a
    deixaria sair. O arquivo é do médico e do aluno, e chega por URL assinada
    de quem confere o papel; a chave crua não precisa sair do banco.
  */
  private static readonly CAMPOS_EXAME =
    'id,laboratorio,dataColeta,sexo,observacao,mimeType,criadoEm,' +
    'registradoPor:User!Exame_registradoPorId_fkey(id,nome),' +
    'resultados:ResultadoMarcador(marcador,valor,classificacao)';

  /**
   * O link do laudo, para quem pode abri-lo — `null` para todo o resto.
   *
   * A chave do arquivo é invisível até para quem lê o exame: o nutricionista
   * lê os marcadores e nunca o arquivo, e a coluna não tem permissão de leitura
   * para ninguém. Quem responde quem pode é o banco, na mesma linha que a
   * política do compartimento consulta.
   *
   * Só o exame individual pede o link. Na lista, `arquivoUrl` fica nulo de
   * propósito: seriam duas idas à rede por exame numa tela que mostra o
   * histórico inteiro, para um link que ninguém clica dali.
   */
  private async urlDoLaudo(exameId: string): Promise<string | null> {
    const chave = await this.rpc<string | null>('chave_do_laudo', { p_exame_id: exameId });
    if (!chave) return null;
    // Arquivo que sumiu do armazenamento com a linha de pé não derruba a tela
    // do exame — os marcadores continuam sendo o que importa ali.
    return await this.urlDeLeitura(chave)
      .then((r) => r.url)
      .catch(() => null);
  }

  private paraExame(e: Record<string, unknown>, arquivoUrl: string | null = null): ExameResumo {
    const sexo = e.sexo as SexoBiologico;
    /*
      Os resultados já chegam filtrados pelo escopo de quem perguntou — a
      política de `ResultadoMarcador` cuida disso. Por isso `contagem` conta o
      que ELE vê: dizer "45 marcadores" e listar 16 seria pior que não dizer
      nada.
    */
    const resultados = ((e.resultados ?? []) as Array<Record<string, unknown>>).map((r) =>
      enriquecerMarcador(
        r.marcador as Marcador,
        n(r.valor) ?? 0,
        r.classificacao as Classificacao,
        sexo,
      ),
    );

    return {
      id: e.id as string,
      laboratorio: e.laboratorio as string,
      dataColeta: String(e.dataColeta).slice(0, 10),
      sexo,
      observacao: (e.observacao as string | null) ?? null,
      registradoPor: e.registradoPor as { id: string; nome: string },
      resultados,
      contagem: contarClassificacoes(resultados),
      /*
        Nulo na lista, assinado no exame individual: a tela só oferece "abrir o
        laudo" no detalhe, e assinar na listagem seria pagar duas idas à rede
        por exame para um link que ninguém clica dali.
      */
      arquivoUrl,
      temArquivo: e.mimeType !== null && e.mimeType !== undefined,
    };
  }

  async listarExames(alunoId: string): Promise<ExameResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('Exame')
        .select(MotorSupabase.CAMPOS_EXAME)
        .eq('alunoId', alunoId)
        .order('dataColeta', { ascending: false }),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((e) => this.paraExame(e));
  }

  async obterExame(alunoId: string, exameId: string): Promise<ExameResumo> {
    const linha = this.ou(
      await this.db
        .from('Exame')
        .select(MotorSupabase.CAMPOS_EXAME)
        .eq('id', exameId)
        .eq('alunoId', alunoId)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraExame(linha, await this.urlDoLaudo(exameId));
  }

  /**
   * Lança o exame e os resultados.
   *
   * A `classificacao` NÃO é mandada: o gatilho a calcula na entrada. Se viesse
   * daqui, um cliente adulterado gravaria "OTIMO" numa glicemia de 300 e o
   * alerta clínico nunca nasceria.
   *
   * Duas escritas, e não uma transação: o PostgREST não abre transação entre
   * requisições. Se a segunda falhar, sobra um exame sem resultado — visível e
   * corrigível, ao contrário de um resultado órfão. A política de
   * `ResultadoMarcador` também barra o marcador fora do escopo de quem lança,
   * então a segunda falha é sempre a que carrega a mensagem útil.
   */
  async registrarExame(alunoId: string, dados: RegistrarExameInput): Promise<ExameResumo> {
    const eu = await this.meuId();
    const id = `${alunoId}-${Date.now()}`;
    const dia = (dados.dataColeta instanceof Date ? dados.dataColeta : new Date(dados.dataColeta))
      .toISOString()
      .slice(0, 10);

    this.ou(
      await this.db.from('Exame').insert({
        id,
        alunoId,
        registradoPorId: eu,
        laboratorio: dados.laboratorio.trim(),
        dataColeta: dia,
        sexo: dados.sexo,
        observacao: dados.observacao ?? null,
      }),
    );

    this.ou(
      await this.db.from('ResultadoMarcador').insert(
        dados.resultados.map((r, i) => ({
          id: `${id}-${i}`,
          exameId: id,
          marcador: r.marcador,
          valor: r.valor,
          // Ignorada pelo gatilho, e mandada só porque a coluna é NOT NULL.
          classificacao: 'ATENCAO',
        })),
      ),
    );

    return this.obterExame(alunoId, id);
  }

  // --- catálogo de alimentos ----------------------------------------------

  async listarAlimentos(consulta: Partial<ListarAlimentosQuery> = {}): Promise<AlimentoResumo[]> {
    let q = this.db
      .from('Alimento')
      .select('id,nome,grupo,kcal,proteinaG,carboidratoG,gorduraG,fibraG,medidaCaseira,medidaGramas')
      .order('grupo', { ascending: true })
      .order('nome', { ascending: true })
      .limit(consulta.limit ?? 50);
    if (consulta.grupo) q = q.eq('grupo', consulta.grupo);
    // `ilike` com `%` dos dois lados: a busca é por pedaço do nome, e caixa não
    // pode separar "Arroz" de "arroz". Acento continua separando, como antes.
    if (consulta.q) q = q.ilike('nome', `%${consulta.q}%`);

    return (this.ou(await q) as unknown as Record<string, unknown>[]).map((a) => ({
      id: a.id as string,
      nome: a.nome as string,
      grupo: a.grupo as string,
      porcao100g: {
        kcal: n(a.kcal) ?? 0,
        proteinaG: n(a.proteinaG) ?? 0,
        carboidratoG: n(a.carboidratoG) ?? 0,
        gorduraG: n(a.gorduraG) ?? 0,
        // Fibra ausente conta como zero: a soma da dieta não pode virar `NaN`
        // por causa de um alimento sem o campo preenchido.
        fibraG: n(a.fibraG) ?? 0,
      },
      medidaCaseira: (a.medidaCaseira as string | null) ?? null,
      medidaGramas: n(a.medidaGramas),
    }));
  }

  /**
   * Os grupos do catálogo.
   *
   * Por função, e não por consulta: `distinct` não existe no PostgREST, e
   * trazer as ~600 linhas para reduzir a dez grupos no cliente seria pagar rede
   * por uma conta que o banco faz de graça.
   */
  async gruposDeAlimento(): Promise<string[]> {
    return this.rpc<string[]>('grupos_de_alimento');
  }

  // --- plano de treino ------------------------------------------------------

  /*
    `videoChave` está na lista, e a chave do laudo de exame não estava.

    A diferença não é o tipo do campo: é de quem é o arquivo. O laudo é do
    médico e do aluno por especificação, e a chave dele era uma coisa a mais
    para vazar para o personal. O vídeo do exercício é conteúdo que quem lê a
    linha já pode assistir — a política de `Exercicio` só devolve o que é
    GLOBAL ou dele mesmo. Sai daqui como `temVideo`, que é o que a tela usa.
  */
  private static readonly CAMPOS_EXERCICIO_DO_ITEM =
    'id,nome,grupoMuscular,equipamento,instrucoes,passos,escopo,videoChave,' +
    'criadoPorId,imagemCredito,videoCredito,videoExternoUrl';

  /*
    `!PlanoTreino_personalId_fkey` porque o plano aponta DUAS vezes para `User`
    — aluno e personal. Sem dizer por qual caminho, o PostgREST recusa o embed
    por ambiguidade, e a tela ficaria sem o nome de quem prescreveu.
  */
  private static readonly CAMPOS_PLANO =
    'id,nome,objetivo,versao,status,criadoEm,inicioEm,fimEm,' +
    'personal:User!PlanoTreino_personalId_fkey(id,nome)';

  private static readonly CAMPOS_PLANO_COMPLETO =
    `${MotorSupabase.CAMPOS_PLANO},` +
    'sessoes:SessaoTreino(id,nome,ordem,diaSugerido,' +
    'itens:ItemTreino(id,ordem,series,repsAlvo,cargaSugeridaKg,descansoSeg,' +
    `tecnica,observacao,supersetGrupo,exercicio:Exercicio(${MotorSupabase.CAMPOS_EXERCICIO_DO_ITEM})))`;

  private paraPlano(p: Record<string, unknown>, totalSessoes: number): PlanoTreinoResumo {
    return {
      id: p.id as string,
      nome: p.nome as string,
      objetivo: (p.objetivo as string | null) ?? null,
      versao: Number(p.versao),
      status: p.status as PlanoTreinoResumo['status'],
      criadoEm: instante(p.criadoEm),
      inicioEm: instanteOuNulo(p.inicioEm),
      fimEm: instanteOuNulo(p.fimEm),
      totalSessoes,
      personal: p.personal as { id: string; nome: string },
    };
  }

  /**
   * Sessões e itens saem ordenados por `ordem`.
   *
   * A ordenação é feita aqui e não no pedido: o PostgREST ordena embutido só
   * no primeiro nível, e a ordem dos ITENS é a que importa de verdade — ela é
   * a sequência do treino. Um plano que chega embaralhado manda a pessoa fazer
   * agachamento depois de terminar a perna.
   *
   * São no máximo 10 sessões de 30 itens, pelo contrato: ordenar isso no
   * cliente não se mede.
   */
  private paraPlanoCompleto(p: Record<string, unknown>): PlanoTreinoCompleto {
    const sessoes: SessaoTreinoResumo[] = ((p.sessoes ?? []) as Record<string, unknown>[])
      .map((s) => ({
        id: s.id as string,
        nome: s.nome as string,
        ordem: Number(s.ordem),
        diaSugerido: s.diaSugerido === null || s.diaSugerido === undefined ? null : Number(s.diaSugerido),
        itens: ((s.itens ?? []) as Record<string, unknown>[])
          .map((i) => {
            const e = (i.exercicio ?? {}) as Record<string, unknown>;
            return {
              id: i.id as string,
              ordem: Number(i.ordem),
              series: Number(i.series),
              repsAlvo: i.repsAlvo as string,
              cargaSugeridaKg: n(i.cargaSugeridaKg),
              descansoSeg: i.descansoSeg === null || i.descansoSeg === undefined ? null : Number(i.descansoSeg),
              tecnica: (i.tecnica as string | null) ?? null,
              observacao: (i.observacao as string | null) ?? null,
              supersetGrupo: (i.supersetGrupo as string | null) ?? null,
              exercicio: {
                id: e.id as string,
                nome: e.nome as string,
                grupoMuscular: e.grupoMuscular as GrupoMuscular,
                equipamento: (e.equipamento as string | null) ?? null,
                instrucoes: (e.instrucoes as string | null) ?? null,
                passos: (e.passos as string[] | null) ?? [],
                escopo: e.escopo as 'GLOBAL' | 'PRIVADO',
                temVideo: e.videoChave !== null && e.videoChave !== undefined,
                criadoPorId: (e.criadoPorId as string | null) ?? null,
                /*
                  Sem link assinado, como na API: o plano tem dezenas de itens,
                  a assinatura vale poucos minutos e o mobile guarda isto em
                  cache para treinar sem rede — o link chegaria morto. A tela
                  pede a mídia na hora de treinar, pela biblioteca.
                */
                imagemUrl: null,
                /* Pelo mesmo motivo: não perguntamos, então não afirmamos. */
                temDemonstracao: null,
                imagemCredito: (e.imagemCredito as string | null) ?? null,
                videoCredito: (e.videoCredito as string | null) ?? null,
                // Vai no plano: o endereço do player não expira, ao contrário do
                // link assinado. E passa pela lista de hosts antes de virar iframe.
                videoExternoUrl: playerExternoSeguro(e.videoExternoUrl as string | null),
              } satisfies ExercicioResumo,
            };
          })
          .sort((a, b) => a.ordem - b.ordem),
      }))
      .sort((a, b) => a.ordem - b.ordem);

    return { ...this.paraPlano(p, sessoes.length), sessoes };
  }

  async listarPlanos(alunoId: string): Promise<PlanoTreinoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('PlanoTreino')
        // `sessoes:SessaoTreino(count)` conta no banco. Trazer as sessões só
        // para medir o tamanho delas seria puxar o plano inteiro por um número.
        .select(`${MotorSupabase.CAMPOS_PLANO},sessoes:SessaoTreino(count)`)
        .eq('alunoId', alunoId),
    ) as unknown as Record<string, unknown>[];

    return ordenarPlanosDeTreino(
      linhas.map((p) =>
        this.paraPlano(p, (p.sessoes as Array<{ count: number }> | null)?.[0]?.count ?? 0),
      ),
    );
  }

  async planoAtivo(alunoId: string): Promise<PlanoTreinoCompleto> {
    const linha = this.ou(
      await this.db
        .from('PlanoTreino')
        .select(MotorSupabase.CAMPOS_PLANO_COMPLETO)
        .eq('alunoId', alunoId)
        .eq('status', 'ATIVO')
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;

    // Mensagem própria, e não a genérica do `single()`: "nenhum plano ativo" é
    // o estado normal de quem acabou de contratar o personal, e a tela usa
    // este texto para oferecer montar o primeiro.
    if (!linha) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Plano de treino ativo não encontrado.', 404);
    }
    return this.paraPlanoCompleto(linha);
  }

  async obterPlano(alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> {
    const linha = this.ou(
      await this.db
        .from('PlanoTreino')
        .select(MotorSupabase.CAMPOS_PLANO_COMPLETO)
        .eq('id', planoId)
        .eq('alunoId', alunoId)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraPlanoCompleto(linha);
  }

  /**
   * Cria o plano inteiro numa chamada só.
   *
   * `p_versao_de` nulo é plano novo; preenchido, é a versão seguinte daquele —
   * e se a anterior estava valendo, a nova assume o lugar dela. A função do
   * banco é uma transação: ou plano, sessões e itens entram juntos, ou nada
   * entra. É a diferença para o exame, que aceita duas escritas — aqui um
   * plano com metade das sessões manda a pessoa embora da academia no meio.
   */
  async criarPlano(
    alunoId: string,
    dados: CriarPlanoTreinoInput,
    versaoDe?: string,
  ): Promise<PlanoTreinoCompleto> {
    const id = await this.rpc<string>('criar_plano_treino', {
      p_aluno_id: alunoId,
      p_plano: dados,
      p_versao_de: versaoDe ?? null,
    });
    return this.obterPlano(alunoId, id);
  }

  async ativarPlano(alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> {
    await this.rpc<null>('ativar_plano_treino', { p_plano_id: planoId });
    return this.obterPlano(alunoId, planoId);
  }

  // --- treino realizado -----------------------------------------------------

  private static readonly CAMPOS_EXECUCAO =
    'id,clienteUuid,sessaoId,iniciadoEm,finalizadoEm,duracaoSeg,' +
    'sessao:SessaoTreino(nome),' +
    'series:SerieExecutada(itemTreinoId,exercicioId,serieNum,repsFeitas,cargaKg,tipo,rpe),' +
    'feedback:FeedbackTreino(dificuldade,teveDor,localDor,dorTipo,dorMomento,' +
    'dorExercicioId,sensacao,comentario)';

  private paraExecucao(e: Record<string, unknown>): ExecucaoResumo {
    /*
      Ordem estável das séries: a tela lê como lista, e ordem que muda entre
      dois carregamentos faz a mesma sessão parecer outra.
    */
    const series: SerieExecutadaResumo[] = ((e.series ?? []) as Record<string, unknown>[])
      .map((s) => ({
        itemTreinoId: s.itemTreinoId as string,
        exercicioId: s.exercicioId as string,
        serieNum: Number(s.serieNum),
        repsFeitas: Number(s.repsFeitas),
        cargaKg: n(s.cargaKg) ?? 0,
        tipo: s.tipo as TipoSerie,
        rpe: s.rpe === null || s.rpe === undefined ? null : Number(s.rpe),
      }))
      .sort(
        (a, b) => a.itemTreinoId.localeCompare(b.itemTreinoId) || a.serieNum - b.serieNum,
      );

    /*
      O feedback é 1-para-1 no schema, mas o `@unique` do Prisma vira um
      ÍNDICE único, e não uma constraint — o PostgREST decide entre objeto e
      lista olhando a constraint. Aceitar as duas formas custa uma linha e
      evita que a nota do treino suma se essa detecção mudar de ideia.
    */
    const f = umSo(e.feedback);

    return {
      id: e.id as string,
      clienteUuid: e.clienteUuid as string,
      sessaoId: e.sessaoId as string,
      sessaoNome: ((e.sessao ?? {}) as { nome?: string }).nome ?? '',
      iniciadoEm: instante(e.iniciadoEm),
      finalizadoEm: instanteOuNulo(e.finalizadoEm),
      duracaoSeg: e.duracaoSeg === null || e.duracaoSeg === undefined ? null : Number(e.duracaoSeg),
      totalSeries: seriesDeTrabalho(series).length,
      volumeTotalKg: volumeKg(series),
      /*
        Vazio por padrão: só o registro de uma execução nova apura recorde.
        Listar o histórico não deve ir atrás do "melhor de todos os tempos" de
        cada exercício de cada linha — e "bateu recorde" é notícia do momento,
        não atributo permanente da sessão.
      */
      recordes: [],
      series,
      feedback: f
        ? {
            dificuldade: Number(f.dificuldade),
            teveDor: Boolean(f.teveDor),
            localDor: (f.localDor as string | null) ?? null,
            /*
              Os três campos da dor são texto no banco, e opcionais de
              propósito: quem está com dor não deve ser obrigado a classificar
              nada para conseguir avisar.
            */
            dorTipo: (f.dorTipo as TipoDeDor | null) ?? null,
            dorMomento: (f.dorMomento as MomentoDaDor | null) ?? null,
            dorExercicioId: (f.dorExercicioId as string | null) ?? null,
            sensacao: (f.sensacao as string | null) ?? null,
            comentario: (f.comentario as string | null) ?? null,
          }
        : null,
    };
  }

  async listarExecucoes(alunoId: string, limite = 30): Promise<ExecucaoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('ExecucaoTreino')
        .select(MotorSupabase.CAMPOS_EXECUCAO)
        .eq('alunoId', alunoId)
        .order('iniciadoEm', { ascending: false })
        .limit(limite),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((e) => this.paraExecucao(e));
  }

  /**
   * As séries do aluno nos exercícios pedidos, com o instante da sessão.
   *
   * É a matéria-prima das três contas da tela de execução. Uma consulta só —
   * perguntar exercício por exercício seriam N idas à rede com a pessoa de pé
   * na academia.
   */
  private async seriesDoAluno(
    alunoId: string,
    exercicioIds: string[],
  ): Promise<SerieComExecucao[]> {
    if (exercicioIds.length === 0) return [];
    const linhas = this.ou(
      await this.db
        .from('SerieExecutada')
        .select(
          'exercicioId,execucaoId,serieNum,repsFeitas,cargaKg,tipo,rpe,' +
            // `!inner` porque o filtro é pelo pai: sem ele o PostgREST devolve
            // a série com o pai nulo em vez de descartá-la.
            'execucao:ExecucaoTreino!inner(alunoId,iniciadoEm,criadoEm)',
        )
        .eq('execucao.alunoId', alunoId)
        .in('exercicioId', exercicioIds),
    ) as unknown as Record<string, unknown>[];

    return linhas.map((s) => {
      const e = s.execucao as Record<string, unknown>;
      return {
        exercicioId: s.exercicioId as string,
        execucaoId: s.execucaoId as string,
        serieNum: Number(s.serieNum),
        repsFeitas: Number(s.repsFeitas),
        cargaKg: n(s.cargaKg) ?? 0,
        tipo: s.tipo as string,
        rpe: s.rpe === null || s.rpe === undefined ? null : Number(s.rpe),
        iniciadoEm: instante(e.iniciadoEm),
        criadoEm: instante(e.criadoEm),
      };
    });
  }

  /** As execuções em que o aluno relatou dor. Guarda que vem antes do número. */
  private async execucoesComDor(alunoId: string): Promise<Set<string>> {
    const linhas = this.ou(
      await this.db
        .from('FeedbackTreino')
        .select('execucaoId,execucao:ExecucaoTreino!inner(alunoId)')
        .eq('teveDor', true)
        .eq('execucao.alunoId', alunoId),
    ) as unknown as { execucaoId: string }[];
    return new Set(linhas.map((f) => f.execucaoId));
  }

  async anterioresDaSessao(alunoId: string, sessaoId: string): Promise<AnterioresDaSessao> {
    const sessao = this.ou(
      await this.db
        .from('SessaoTreino')
        .select(
          // `repsAlvo` entra porque a sugestão é dupla progressão: sem a faixa
          // que o plano pede, não dá para dizer se o aluno fechou o topo.
          'id,plano:PlanoTreino!inner(alunoId),itens:ItemTreino(exercicioId,repsAlvo)',
        )
        .eq('id', sessaoId)
        .eq('plano.alunoId', alunoId)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;

    if (!sessao) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Sessão de treino não encontrado.', 404);

    const itens = (sessao.itens ?? []) as { exercicioId: string; repsAlvo: string }[];
    const exercicioIds = [...new Set(itens.map((i) => i.exercicioId))];
    if (exercicioIds.length === 0) return { porExercicio: {}, ultimaVezEm: {}, sugestao: {} };

    const [series, comDor] = await Promise.all([
      this.seriesDoAluno(alunoId, exercicioIds),
      this.execucoesComDor(alunoId),
    ]);

    return montarAnterioresDaSessao({ series, itens, execucoesComDor: comDor });
  }

  async historicoDeCarga(
    alunoId: string,
    exercicioId: string,
    limite = 20,
  ): Promise<HistoricoCarga> {
    const exercicio = this.ou(
      await this.db.from('Exercicio').select('id,nome').eq('id', exercicioId).maybeSingle(),
    ) as unknown as { id: string; nome: string } | null;
    if (!exercicio) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Exercício não encontrado.', 404);

    return montarHistoricoDeCarga({
      exercicioId: exercicio.id,
      exercicioNome: exercicio.nome,
      series: await this.seriesDoAluno(alunoId, [exercicioId]),
      limite,
    });
  }

  /**
   * Envia o treino realizado.
   *
   * Idempotente por `clienteUuid`, e a idempotência é do BANCO: reenviar a fila
   * offline devolve a execução que já está gravada com `jaRegistrada: true`, em
   * vez de criar uma segunda ou de dar erro. Erro faria o app manter o item na
   * fila para sempre.
   */
  async registrarExecucao(
    alunoId: string,
    dados: RegistrarExecucaoInput,
  ): Promise<ExecucaoResumo> {
    const resposta = await this.rpc<{ id: string; jaRegistrada: boolean }>('registrar_execucao', {
      p_aluno_id: alunoId,
      p_dados: {
        ...dados,
        iniciadoEm: paraIso(dados.iniciadoEm),
        finalizadoEm: dados.finalizadoEm ? paraIso(dados.finalizadoEm) : null,
      },
    });

    const linha = this.ou(
      await this.db
        .from('ExecucaoTreino')
        .select(MotorSupabase.CAMPOS_EXECUCAO)
        .eq('id', resposta.id)
        .single(),
    ) as unknown as Record<string, unknown>;
    const resumo = this.paraExecucao(linha);

    // Reenvio não ganha medalha de novo: ela já foi dada quando o treino
    // entrou, e repeti-la faria o aluno comemorar duas vezes o mesmo peso.
    if (resposta.jaRegistrada) return { ...resumo, jaRegistrada: true };

    return { ...resumo, recordes: await this.recordesDa(alunoId, resumo) };
  }

  /**
   * Compara o que acabou de entrar com tudo o que veio antes.
   *
   * O histórico é buscado INTEIRO, sem corte de data: recorde é "melhor de
   * todos os tempos", e limitar faria marca antiga sair da comparação e voltar
   * como medalha nova.
   */
  private async recordesDa(alunoId: string, execucao: ExecucaoResumo): Promise<RecordeBatido[]> {
    const exercicioIds = [...new Set(execucao.series.map((s) => s.exercicioId))];
    if (exercicioIds.length === 0) return [];

    const [todas, nomes] = await Promise.all([
      this.seriesDoAluno(alunoId, exercicioIds),
      this.db.from('Exercicio').select('id,nome').in('id', exercicioIds),
    ]);

    return apurarRecordes({
      deHoje: execucao.series.map((s) => ({
        exercicioId: s.exercicioId,
        cargaKg: s.cargaKg,
        repsFeitas: s.repsFeitas,
        tipo: s.tipo,
      })),
      // Sem a execução de agora: com ela dentro, o melhor histórico já inclui
      // o de hoje e nada nunca seria recorde.
      anteriores: todas
        .filter((s) => s.execucaoId !== execucao.id)
        .map((s) => ({
          exercicioId: s.exercicioId,
          cargaKg: s.cargaKg,
          repsFeitas: s.repsFeitas,
          tipo: s.tipo,
        })),
      nomes: Object.fromEntries(
        ((nomes.data ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]),
      ),
    });
  }

  // --- marcas pessoais e painel de progresso --------------------------------

  /**
   * O instante como o `timestamp` do banco o guarda: hora de UTC, sem `Z`.
   *
   * As colunas de data-e-hora são `timestamp without time zone` com valor em
   * UTC. Mandar o `Z` faria o Postgres descartá-lo em silêncio na comparação —
   * funciona, mas por acidente. Sem ele, o que se compara é o que está lá.
   */
  private static horaDoBanco(quando: Date): string {
    return quando.toISOString().slice(0, 19);
  }

  /**
   * Todas as séries do aluno, com nome do exercício e dia.
   *
   * Traz o histórico inteiro, e é o preço de a marca pessoal ser DERIVADA: uma
   * tabela de recordes envelheceria no dia em que uma execução fosse
   * corrigida, e passaria a dizer que a pessoa levantou um peso que ela apagou.
   * Para quem tem dois anos de casa são alguns milhares de linhas de cinco
   * campos curtos — e é a tela de "meus recordes", que se abre de vez em
   * quando, não a de treinar.
   */
  async meusRecordes(alunoId: string): Promise<MeusRecordes> {
    const linhas = this.ou(
      await this.db
        .from('SerieExecutada')
        .select(
          'exercicioId,cargaKg,repsFeitas,tipo,' +
            'exercicio:Exercicio(nome),execucao:ExecucaoTreino!inner(alunoId,iniciadoEm)',
        )
        .eq('execucao.alunoId', alunoId),
    ) as unknown as Record<string, unknown>[];

    return montarMeusRecordes(
      linhas.map((s) => ({
        exercicioId: s.exercicioId as string,
        exercicioNome: (umSo(s.exercicio)?.nome as string | undefined) ?? 'Exercício',
        cargaKg: n(s.cargaKg) ?? 0,
        repsFeitas: Number(s.repsFeitas),
        tipo: s.tipo as string,
        dia: instante((umSo(s.execucao) ?? {}).iniciadoEm).slice(0, 10),
      })),
    );
  }

  async painelDeProgresso(alunoId: string, dias = 30): Promise<PainelDeProgresso> {
    const de = MotorSupabase.horaDoBanco(new Date(Date.now() - dias * 86_400_000));

    const [execucoes, series, checkins, medidas] = await Promise.all([
      this.db
        .from('ExecucaoTreino')
        .select('iniciadoEm,duracaoSeg,series:SerieExecutada(cargaKg,repsFeitas,tipo)')
        .eq('alunoId', alunoId)
        .gte('iniciadoEm', de),
      this.db
        .from('SerieExecutada')
        .select(
          'exercicioId,cargaKg,repsFeitas,tipo,execucao:ExecucaoTreino!inner(alunoId,iniciadoEm)',
        )
        .eq('execucao.alunoId', alunoId)
        .gte('execucao.iniciadoEm', de),
      this.resumoDeCheckins(alunoId, dias),
      this.db
        .from('Medida')
        .select('pesoKg,data')
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .not('pesoKg', 'is', null)
        .gte('data', de.slice(0, 10))
        .order('data', { ascending: true }),
    ]);

    const linhasDeSerie = this.ou(series) as unknown as Record<string, unknown>[];
    const exercicioIds = [...new Set(linhasDeSerie.map((s) => s.exercicioId as string))];
    const nomes =
      exercicioIds.length === 0
        ? []
        : ((
            await this.db.from('Exercicio').select('id,nome').in('id', exercicioIds)
          ).data as { id: string; nome: string }[] | null) ?? [];

    return {
      dias,
      treino: resumoDeTreinoNoPeriodo(
        (this.ou(execucoes) as unknown as Record<string, unknown>[]).map((e) => ({
          iniciadoEm: instante(e.iniciadoEm),
          duracaoSeg:
            e.duracaoSeg === null || e.duracaoSeg === undefined ? null : Number(e.duracaoSeg),
          series: ((e.series ?? []) as Record<string, unknown>[]).map((s) => ({
            cargaKg: n(s.cargaKg) ?? 0,
            repsFeitas: Number(s.repsFeitas),
            tipo: s.tipo as string,
          })),
        })),
        dias,
      ),
      /*
        `null` quando o aluno nunca registrou check-in — diferente de zero, que
        significaria "registrou e não treinou". A tela precisa distinguir "sem
        dado" de "dado ruim" para não cobrar quem só não conhece o recurso.
      */
      checkins:
        checkins.comCheckin === 0
          ? null
          : {
              comCheckin: checkins.comCheckin,
              aderencia: checkins.aderencia,
              energiaMedia: checkins.energiaMedia,
              diasComDor: checkins.diasComDor,
              diasSemCheckin: checkins.diasSemCheckin,
            },
      cargas: montarEvolucaoDeCarga(
        linhasDeSerie.map((s) => ({
          exercicioId: s.exercicioId as string,
          quando: instante((umSo(s.execucao) ?? {}).iniciadoEm),
          cargaKg: n(s.cargaKg) ?? 0,
          repsFeitas: Number(s.repsFeitas),
          tipo: s.tipo as string,
        })),
        Object.fromEntries(nomes.map((e) => [e.id, e.nome])),
      ),
      variacaoPesoKg: variacaoDePeso(
        ((this.ou(medidas) as unknown as Record<string, unknown>[]) ?? []).map(
          (m) => n(m.pesoKg) ?? 0,
        ),
      ),
    };
  }

  // --- metas ----------------------------------------------------------------

  private static readonly CAMPOS_META =
    'id,tipo,titulo,alvo,exercicioId,valorInicial,prazo,observacao,criadoEm,concluidaEm,' +
    'exercicio:Exercicio(nome)';

  private paraLinhaDeMeta(m: Record<string, unknown>): LinhaDeMeta {
    return {
      id: m.id as string,
      tipo: m.tipo as string,
      titulo: m.titulo as string,
      alvo: n(m.alvo),
      exercicioId: (m.exercicioId as string | null) ?? null,
      exercicioNome: (umSo(m.exercicio)?.nome as string | undefined) ?? null,
      valorInicial: n(m.valorInicial),
      // `date` chega do PostgREST como texto `AAAA-MM-DD`; o corte tira hora, se vier.
      prazo: m.prazo === null || m.prazo === undefined ? null : (m.prazo as string).slice(0, 10),
      observacao: (m.observacao as string | null) ?? null,
      criadoEm: instante(m.criadoEm),
      concluidaEm: instanteOuNulo(m.concluidaEm),
    };
  }

  /**
   * O valor de agora de cada meta, tirado do que já existe no sistema.
   *
   * Uma consulta por TIPO, e não uma por meta: quem tem seis metas de carga em
   * exercícios diferentes faria seis idas à rede para desenhar uma tela só.
   *
   * `null` significa "ainda não há medição", e é diferente de zero — quem
   * nunca se pesou não pesa zero, e a barra tem de ficar vazia em vez de
   * dizer que a pessoa está no começo do caminho.
   */
  private async aferirMetas(
    alunoId: string,
    metas: LinhaDeMeta[],
  ): Promise<Map<string, number | null>> {
    const tipos = new Set(metas.map((m) => m.tipo));
    const exercicioIds = [
      ...new Set(
        metas
          .filter((m) => m.tipo === TipoMeta.CARGA_EXERCICIO && m.exercicioId)
          .map((m) => m.exercicioId!),
      ),
    ];

    const ultimaMedida = async (campo: 'pesoKg' | 'cinturaCm'): Promise<number | null> => {
      const r = await this.db
        .from('Medida')
        .select(campo)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .not(campo, 'is', null)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle();
      return r.data ? n((r.data as Record<string, unknown>)[campo]) : null;
    };

    const [peso, cintura, series, frequencia] = await Promise.all([
      tipos.has(TipoMeta.PESO_CORPORAL) ? ultimaMedida('pesoKg') : Promise.resolve(null),
      tipos.has(TipoMeta.MEDIDA_CINTURA) ? ultimaMedida('cinturaCm') : Promise.resolve(null),
      exercicioIds.length === 0
        ? Promise.resolve(null)
        : this.db
            .from('SerieExecutada')
            .select('exercicioId,cargaKg,repsFeitas,tipo,execucao:ExecucaoTreino!inner(alunoId)')
            .eq('execucao.alunoId', alunoId)
            .in('exercicioId', exercicioIds),
      tipos.has(TipoMeta.FREQUENCIA_SEMANAL)
        ? this.db
            .from('ExecucaoTreino')
            .select('id', { count: 'exact', head: true })
            .eq('alunoId', alunoId)
            .gte(
              'iniciadoEm',
              MotorSupabase.horaDoBanco(new Date(Date.now() - JANELA_FREQUENCIA_DIAS * 86_400_000)),
            )
        : Promise.resolve(null),
    ]);

    /*
      Maior carga numa SÉRIE DE TRABALHO. Sem isso a meta de carga seria batida
      por quem aqueceu pesado uma vez — e o aquecimento entra de volta quando é
      tudo o que existe, que é a regra do resto do app.
    */
    const cargaPorExercicio = new Map<string, number>();
    for (const id of exercicioIds) {
      const doExercicio = ((series?.data ?? []) as Record<string, unknown>[])
        .filter((s) => s.exercicioId === id)
        .map((s) => ({
          cargaKg: n(s.cargaKg) ?? 0,
          repsFeitas: Number(s.repsFeitas),
          tipo: s.tipo as string,
        }));
      if (doExercicio.length === 0) continue;
      cargaPorExercicio.set(id, Math.max(...seriesDeTrabalho(doExercicio).map((s) => s.cargaKg)));
    }

    /*
      Média das últimas quatro semanas, e não da última: uma semana ruim
      (viagem, gripe) jogaria a meta a zero e a seguinte a devolveria — o número
      ficaria pulando sem dizer nada.
    */
    const total = frequencia?.count ?? 0;
    const porSemana =
      total === 0 ? null : Number(((total / JANELA_FREQUENCIA_DIAS) * 7).toFixed(1));

    const valores = new Map<string, number | null>();
    for (const m of metas) {
      switch (m.tipo) {
        case TipoMeta.PESO_CORPORAL:
          valores.set(m.id, peso);
          break;
        case TipoMeta.MEDIDA_CINTURA:
          valores.set(m.id, cintura);
          break;
        case TipoMeta.CARGA_EXERCICIO:
          valores.set(m.id, m.exercicioId ? cargaPorExercicio.get(m.exercicioId) ?? null : null);
          break;
        case TipoMeta.FREQUENCIA_SEMANAL:
          valores.set(m.id, porSemana);
          break;
        default:
          // LIVRE não tem número, e é isso que a torna LIVRE.
          valores.set(m.id, null);
      }
    }
    return valores;
  }

  async listarMetas(alunoId: string): Promise<MetaResumo[]> {
    const linhas = (
      this.ou(
        await this.db
          .from('Meta')
          .select(MotorSupabase.CAMPOS_META)
          .eq('alunoId', alunoId)
          .is('deletadoEm', null),
      ) as unknown as Record<string, unknown>[]
    ).map((m) => this.paraLinhaDeMeta(m));

    const valores = await this.aferirMetas(alunoId, linhas);
    return ordenarMetas(linhas.map((m) => montarMetaResumo(m, valores.get(m.id) ?? null)));
  }

  private async obterMeta(alunoId: string, metaId: string): Promise<MetaResumo> {
    const linha = this.paraLinhaDeMeta(
      this.ou(
        await this.db
          .from('Meta')
          .select(MotorSupabase.CAMPOS_META)
          .eq('id', metaId)
          .eq('alunoId', alunoId)
          .is('deletadoEm', null)
          .single(),
      ) as unknown as Record<string, unknown>,
    );
    const valores = await this.aferirMetas(alunoId, [linha]);
    return montarMetaResumo(linha, valores.get(linha.id) ?? null);
  }

  /**
   * Cria a meta e congela o valor inicial no mesmo instante.
   *
   * Sem isso não há régua: "faltam 3 kg" não diz se a pessoa andou 10% ou 90%
   * do caminho. O valor é aferido AQUI porque a aferição de carga precisa da
   * regra de série de trabalho, que já existe testada no contrato — reescrevê-la
   * em SQL é como as regras de alerta divergiram da fonte. O que o banco
   * garante é que ninguém o reescreve depois.
   */
  async criarMeta(alunoId: string, dados: CriarMetaInput): Promise<MetaResumo> {
    const id = `${alunoId}-meta-${Date.now()}`;
    const eu = await this.meuId();

    const provisoria: LinhaDeMeta = {
      id,
      tipo: dados.tipo,
      titulo: dados.titulo,
      alvo: dados.alvo ?? null,
      exercicioId: dados.exercicioId ?? null,
      exercicioNome: null,
      valorInicial: null,
      prazo: dados.prazo ?? null,
      observacao: dados.observacao ?? null,
      criadoEm: new Date().toISOString(),
      concluidaEm: null,
    };
    const valorInicial = (await this.aferirMetas(alunoId, [provisoria])).get(id) ?? null;

    this.ou(
      await this.db.from('Meta').insert({
        id,
        alunoId,
        // O gatilho reescreve com quem está pedindo; vai porque a coluna é
        // NOT NULL.
        criadoPorId: eu,
        tipo: dados.tipo,
        titulo: dados.titulo.trim(),
        alvo: dados.alvo ?? null,
        exercicioId: dados.exercicioId ?? null,
        valorInicial,
        prazo: dados.prazo ?? null,
        observacao: dados.observacao ?? null,
      }),
    );

    return this.obterMeta(alunoId, id);
  }

  async concluirMeta(alunoId: string, metaId: string, concluida: boolean): Promise<MetaResumo> {
    await this.exigirLinhaAlterada(
      this.db
        .from('Meta')
        .update({ concluidaEm: concluida ? new Date().toISOString() : null })
        .eq('id', metaId)
        .eq('alunoId', alunoId)
        .select('id'),
    );
    return this.obterMeta(alunoId, metaId);
  }

  /** Soft delete: a meta pode estar citada num relatório já enviado. */
  async removerMeta(alunoId: string, metaId: string): Promise<void> {
    await this.exigirLinhaAlterada(
      this.db
        .from('Meta')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', metaId)
        .eq('alunoId', alunoId)
        .select('id'),
    );
  }

  // --- agenda ---------------------------------------------------------------

  /*
    Dois embeds para `User` na mesma linha — aluno e profissional —, e o
    PostgREST recusa por ambiguidade sem o nome da chave. Sem eles a agenda
    voltaria sem os nomes, que é a única coisa que a tela mostra em cada bloco.
  */
  private static readonly CAMPOS_COMPROMISSO =
    'id,tipo,titulo,inicioEm,fimEm,local,observacao,status,motivoCancelamento,' +
    'aluno:User!Compromisso_alunoId_fkey(id,nome,email),' +
    'profissional:User!Compromisso_profissionalId_fkey(id,nome,papel)';

  private paraCompromisso(c: Record<string, unknown>): CompromissoResumo {
    const inicioEm = instante(c.inicioEm);
    const fimEm = instante(c.fimEm);
    return {
      id: c.id as string,
      tipo: c.tipo as TipoCompromisso,
      titulo: (c.titulo as string | null) ?? null,
      inicioEm,
      fimEm,
      duracaoMin: Math.round(
        (new Date(fimEm).getTime() - new Date(inicioEm).getTime()) / 60_000,
      ),
      local: (c.local as string | null) ?? null,
      observacao: (c.observacao as string | null) ?? null,
      status: c.status as StatusCompromisso,
      motivoCancelamento: (c.motivoCancelamento as string | null) ?? null,
      aluno: umSo(c.aluno) as unknown as CompromissoResumo['aluno'],
      profissional: umSo(c.profissional) as unknown as CompromissoResumo['profissional'],
    };
  }

  private async compromissosNoPeriodo(
    coluna: 'profissionalId' | 'alunoId',
    de: string,
    ate: string,
    incluirCancelados: boolean,
  ): Promise<CompromissoResumo[]> {
    const eu = await this.meuId();
    let q = this.db
      .from('Compromisso')
      .select(MotorSupabase.CAMPOS_COMPROMISSO)
      .eq(coluna, eu)
      .gte('inicioEm', MotorSupabase.horaDoBanco(new Date(de)))
      .lte('inicioEm', MotorSupabase.horaDoBanco(new Date(ate)))
      .order('inicioEm', { ascending: true });
    if (!incluirCancelados) q = q.neq('status', 'CANCELADO');

    return (this.ou(await q) as unknown as Record<string, unknown>[]).map((c) =>
      this.paraCompromisso(c),
    );
  }

  async listarAgenda(consulta: ConsultaAgenda): Promise<CompromissoResumo[]> {
    return this.compromissosNoPeriodo(
      'profissionalId',
      consulta.de,
      consulta.ate,
      consulta.incluirCancelados,
    );
  }

  /** O que o aluno vê: os compromissos dele com qualquer profissional. */
  async meusCompromissos(de: string, ate: string): Promise<CompromissoResumo[]> {
    return this.compromissosNoPeriodo('alunoId', de, ate, false);
  }

  /**
   * As vagas do dia.
   *
   * Quem pergunta é o dono da agenda, e por isso a conta pode ser feita aqui:
   * os compromissos e os bloqueios dele já são dados que ele lê um a um. Para
   * o aluno seria outra história — ele não enxerga o compromisso de terceiros,
   * e uma lista de vagas montada só com o que ele vê ofereceria horário
   * ocupado.
   */
  async horariosLivres(dataISO: string, duracaoMin?: number): Promise<HorarioLivre[]> {
    const eu = await this.meuId();
    const dia = `${dataISO}T00:00:00`;
    const fimDoDia = `${dataISO}T23:59:59`;
    // `getUTCDay` devolve 0 para domingo; o app usa 1=segunda...7=domingo.
    const numeroDoDia = new Date(`${dataISO}T00:00:00.000Z`).getUTCDay();

    const [janelas, ocupados, bloqueios] = await Promise.all([
      this.db
        .from('DisponibilidadeSlot')
        .select('id,diaSemana,horaInicio,horaFim,duracaoMin')
        .eq('profissionalId', eu)
        .eq('diaSemana', numeroDoDia === 0 ? 7 : numeroDoDia),
      this.db
        .from('Compromisso')
        .select('inicioEm,fimEm')
        .eq('profissionalId', eu)
        .in('status', [...STATUS_ATIVOS])
        .lte('inicioEm', fimDoDia)
        .gte('fimEm', dia),
      this.db
        .from('BloqueioAgenda')
        .select('inicioEm,fimEm')
        .eq('profissionalId', eu)
        .lte('inicioEm', fimDoDia)
        .gte('fimEm', dia),
    ]);

    const intervalos = [
      ...(this.ou(ocupados) as unknown as Record<string, unknown>[]),
      ...(this.ou(bloqueios) as unknown as Record<string, unknown>[]),
    ].map((o) => ({ inicioEm: instante(o.inicioEm), fimEm: instante(o.fimEm) }));

    return montarHorariosLivres({
      dataISO,
      janelas: this.ou(janelas) as unknown as JanelaDisponivel[],
      ocupados: intervalos,
      duracaoMin,
    });
  }

  private async obterCompromisso(id: string): Promise<CompromissoResumo> {
    return this.paraCompromisso(
      this.ou(
        await this.db
          .from('Compromisso')
          .select(MotorSupabase.CAMPOS_COMPROMISSO)
          .eq('id', id)
          .single(),
      ) as unknown as Record<string, unknown>,
    );
  }

  async marcarCompromisso(dados: CriarCompromissoInput): Promise<CompromissoResumo> {
    const eu = await this.meuId();
    const id = `${eu}-agenda-${Date.now()}`;
    // O fim sai do tipo quando não é dito: avaliação física é uma hora, retorno
    // é meia. É a mesma tabela que a tela usa para sugerir.
    const fimEm = fimDoCompromisso(dados);

    this.ou(
      await this.db.from('Compromisso').insert({
        id,
        // O gatilho reescreve os dois com quem está pedindo; vão porque as
        // colunas são NOT NULL.
        profissionalId: eu,
        criadoPorId: eu,
        alunoId: dados.alunoId,
        tipo: dados.tipo,
        titulo: dados.titulo ?? null,
        inicioEm: paraIso(dados.inicioEm),
        fimEm: fimEm.toISOString(),
        local: dados.local ?? null,
        observacao: dados.observacao ?? null,
      }),
    );
    return this.obterCompromisso(id);
  }

  async remarcarCompromisso(
    id: string,
    dados: RemarcarCompromissoInput,
  ): Promise<CompromissoResumo> {
    await this.exigirLinhaAlterada(
      this.db
        .from('Compromisso')
        .update({
          inicioEm: paraIso(dados.inicioEm),
          fimEm: paraIso(dados.fimEm),
          local: dados.local ?? null,
          observacao: dados.observacao ?? null,
          // Remarcar zera a confirmação: o aluno precisa confirmar o horário
          // novo, e um "confirmado" herdado seria confirmação de outra coisa.
          status: 'AGENDADO',
        })
        .eq('id', id)
        .select('id'),
    );
    return this.obterCompromisso(id);
  }

  async mudarStatusCompromisso(id: string, dados: MudarStatusInput): Promise<CompromissoResumo> {
    await this.exigirLinhaAlterada(
      this.db
        .from('Compromisso')
        .update({
          status: dados.status,
          motivoCancelamento: dados.status === 'CANCELADO' ? dados.motivo ?? null : null,
        })
        .eq('id', id)
        .select('id'),
    );
    return this.obterCompromisso(id);
  }

  async listarDisponibilidade(): Promise<JanelaDisponivel[]> {
    const eu = await this.meuId();
    return this.ou(
      await this.db
        .from('DisponibilidadeSlot')
        .select('id,diaSemana,horaInicio,horaFim,duracaoMin')
        .eq('profissionalId', eu)
        .order('diaSemana', { ascending: true })
        .order('horaInicio', { ascending: true }),
    ) as unknown as JanelaDisponivel[];
  }

  /**
   * Substitui a semana de atendimento inteira, numa transação.
   *
   * Apagar as janelas e falhar ao gravar as novas deixaria o profissional sem
   * agenda nenhuma — e o app mostraria "nenhum horário disponível" para todos
   * os alunos dele.
   */
  async definirDisponibilidade(dados: DefinirDisponibilidadeInput): Promise<JanelaDisponivel[]> {
    await this.rpc<null>('definir_disponibilidade', { p_janelas: dados.janelas });
    return this.listarDisponibilidade();
  }

  // --- plano alimentar ------------------------------------------------------

  private static readonly CAMPOS_ALIMENTO =
    'id,nome,grupo,kcal,proteinaG,carboidratoG,gorduraG,fibraG,medidaCaseira,medidaGramas';

  private paraAlimento(a: Record<string, unknown>): AlimentoResumo {
    return {
      id: a.id as string,
      nome: a.nome as string,
      grupo: a.grupo as string,
      porcao100g: {
        kcal: n(a.kcal) ?? 0,
        proteinaG: n(a.proteinaG) ?? 0,
        carboidratoG: n(a.carboidratoG) ?? 0,
        gorduraG: n(a.gorduraG) ?? 0,
        // Fibra ausente conta como zero: a soma da dieta não pode virar `NaN`
        // por causa de um alimento sem o campo preenchido.
        fibraG: n(a.fibraG) ?? 0,
      },
      medidaCaseira: (a.medidaCaseira as string | null) ?? null,
      medidaGramas: n(a.medidaGramas),
    };
  }

  private static readonly CAMPOS_DIETA =
    'id,nome,observacao,versao,status,kcalAlvo,proteinaAlvoG,carboAlvoG,gorduraAlvoG,criadoEm,' +
    'nutricionista:User!PlanoDieta_nutricionistaId_fkey(id,nome),' +
    'refeicoes:Refeicao(id,nome,horarioSugerido,ordem,' +
    `itens:ItemRefeicao(id,ordem,quantidadeG,observacao,alimento:Alimento(${MotorSupabase.CAMPOS_ALIMENTO})))`;

  private paraLinhaDeDieta(p: Record<string, unknown>): LinhaDePlanoDieta {
    return {
      id: p.id as string,
      nome: p.nome as string,
      observacao: (p.observacao as string | null) ?? null,
      versao: Number(p.versao),
      status: p.status as LinhaDePlanoDieta['status'],
      kcalAlvo: p.kcalAlvo === null || p.kcalAlvo === undefined ? null : Number(p.kcalAlvo),
      proteinaAlvoG:
        p.proteinaAlvoG === null || p.proteinaAlvoG === undefined ? null : Number(p.proteinaAlvoG),
      carboAlvoG:
        p.carboAlvoG === null || p.carboAlvoG === undefined ? null : Number(p.carboAlvoG),
      gorduraAlvoG:
        p.gorduraAlvoG === null || p.gorduraAlvoG === undefined ? null : Number(p.gorduraAlvoG),
      nutricionista: umSo(p.nutricionista) as unknown as { id: string; nome: string },
      refeicoes: ((p.refeicoes ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        nome: r.nome as string,
        horarioSugerido: (r.horarioSugerido as string | null) ?? null,
        ordem: Number(r.ordem),
        itens: ((r.itens ?? []) as Record<string, unknown>[]).map((i) => ({
          id: i.id as string,
          ordem: Number(i.ordem),
          quantidadeG: n(i.quantidadeG) ?? 0,
          observacao: (i.observacao as string | null) ?? null,
          alimento: this.paraAlimento((i.alimento ?? {}) as Record<string, unknown>),
        })),
      })),
    };
  }

  async listarDietas(alunoId: string): Promise<PlanoDietaResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('PlanoDieta')
        .select(MotorSupabase.CAMPOS_DIETA)
        .eq('alunoId', alunoId)
        /*
          A ordem por data vem do banco, e com desempate: versionar uma dieta
          cria a nova no mesmo milissegundo em que arquiva a antiga, e
          empatadas o Postgres devolve em ordem arbitrária.
        */
        .order('criadoEm', { ascending: false })
        .order('versao', { ascending: false })
        .order('id', { ascending: false }),
    ) as unknown as Record<string, unknown>[];

    /*
      O resumo é o completo sem as refeições — e não uma consulta mais magra.
      `macrosTotais` é a soma dos itens, então a lista precisa dos itens de
      qualquer jeito: o número que a tela mostra ao lado do alvo é o real.
    */
    return ordenarPorStatusDoPlano(
      linhas.map((p) => {
        const { refeicoes: _r, ...resumo } = montarPlanoDietaCompleto(this.paraLinhaDeDieta(p));
        return resumo;
      }),
    );
  }

  async dietaAtiva(alunoId: string): Promise<PlanoDietaCompleto> {
    const linha = this.ou(
      await this.db
        .from('PlanoDieta')
        .select(MotorSupabase.CAMPOS_DIETA)
        .eq('alunoId', alunoId)
        .eq('status', 'ATIVO')
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;

    if (!linha) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Plano alimentar ativo não encontrado.', 404);
    }
    return montarPlanoDietaCompleto(this.paraLinhaDeDieta(linha));
  }

  async obterDieta(alunoId: string, planoId: string): Promise<PlanoDietaCompleto> {
    const linha = this.ou(
      await this.db
        .from('PlanoDieta')
        .select(MotorSupabase.CAMPOS_DIETA)
        .eq('id', planoId)
        .eq('alunoId', alunoId)
        .single(),
    ) as unknown as Record<string, unknown>;
    return montarPlanoDietaCompleto(this.paraLinhaDeDieta(linha));
  }

  /**
   * Cria a dieta inteira numa chamada.
   *
   * Mesma forma do plano de treino, e pelo mesmo motivo: dieta, refeições e
   * itens nascem juntos. Metade do cardápio gravado é o aluno abrindo o almoço
   * e não encontrando o jantar, sem nada avisando que faltou.
   */
  async criarDieta(
    alunoId: string,
    dados: CriarPlanoDietaInput,
    versaoDe?: string,
  ): Promise<PlanoDietaCompleto> {
    const id = await this.rpc<string>('criar_plano_dieta', {
      p_aluno_id: alunoId,
      p_plano: dados,
      p_versao_de: versaoDe ?? null,
    });
    return this.obterDieta(alunoId, id);
  }

  async ativarDieta(alunoId: string, planoId: string): Promise<PlanoDietaCompleto> {
    await this.rpc<null>('ativar_plano_dieta', { p_plano_id: planoId });
    return this.obterDieta(alunoId, planoId);
  }

  /**
   * Substituições equivalentes para um item da refeição.
   *
   * Os candidatos vêm do mesmo grupo do alimento original — trocar arroz por
   * outro carboidrato é substituição; trocar por peito de frango é outra dieta.
   */
  async substitutosPara(
    itemRefeicaoId: string,
    consulta: Partial<BuscarSubstitutosQuery> = {},
  ): Promise<SubstitutoSugerido[]> {
    const item = this.ou(
      await this.db
        .from('ItemRefeicao')
        .select(`id,quantidadeG,alimentoId,alimento:Alimento(${MotorSupabase.CAMPOS_ALIMENTO})`)
        .eq('id', itemRefeicaoId)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;

    if (!item) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Item da refeição não encontrado.', 404);

    const original = this.paraAlimento((item.alimento ?? {}) as Record<string, unknown>);
    const candidatos = this.ou(
      await this.db
        .from('Alimento')
        .select(MotorSupabase.CAMPOS_ALIMENTO)
        .eq('grupo', original.grupo)
        .neq('id', original.id)
        .gt('kcal', 0)
        .limit(60),
    ) as unknown as Record<string, unknown>[];

    return montarSubstitutos({
      original: macrosDaPorcao(original.porcao100g, n(item.quantidadeG) ?? 0),
      candidatos: candidatos.map((a) => this.paraAlimento(a)),
      tolerancia: consulta.tolerancia ?? 0.1,
      limit: consulta.limit ?? 8,
    });
  }

  /** Marcar a mesma refeição no mesmo dia atualiza — o aluno pode corrigir. */
  async registrarRefeicao(
    alunoId: string,
    dados: RegistrarRefeicaoInput,
  ): Promise<RegistroDeRefeicao> {
    const dia = soData(dados.data);
    this.ou(
      await this.db.from('RegistroRefeicao').upsert(
        {
          id: `${alunoId}-${dados.refeicaoId}-${dia}`,
          alunoId,
          refeicaoId: dados.refeicaoId,
          data: dia,
          status: dados.status,
          comentario: dados.comentario ?? null,
        },
        { onConflict: 'alunoId,refeicaoId,data' },
      ),
    );

    const registros = await this.registrosDoDia(alunoId, dia);
    const salvo = registros.find((r) => r.refeicaoId === dados.refeicaoId);
    if (!salvo) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Refeição não encontrada.', 404);
    return salvo;
  }

  async registrosDoDia(alunoId: string, data?: string): Promise<RegistroDeRefeicao[]> {
    const dia = data ?? hojeUtc().toISOString().slice(0, 10);
    const linhas = this.ou(
      await this.db
        .from('RegistroRefeicao')
        .select('id,refeicaoId,data,status,comentario,refeicao:Refeicao(nome)')
        .eq('alunoId', alunoId)
        .eq('data', dia)
        .order('criadoEm', { ascending: true }),
    ) as unknown as Record<string, unknown>[];

    return linhas.map((r) => ({
      id: r.id as string,
      refeicaoId: r.refeicaoId as string,
      refeicaoNome: (umSo(r.refeicao)?.nome as string | undefined) ?? '',
      data: String(r.data).slice(0, 10),
      status: r.status as StatusRefeicao,
      comentario: (r.comentario as string | null) ?? null,
    }));
  }

  // --- material -------------------------------------------------------------

  /*
    `chave` fica de fora da lista. É o caminho do arquivo no armazenamento
    privado, e nada na tela precisa dele: quem abre recebe uma URL assinada,
    curta, emitida por quem confere o direito. É a mesma regra da chave do
    laudo de exame.
  */
  private static readonly CAMPOS_MATERIAL =
    'id,titulo,descricao,tipo,nomeArquivo,mimeType,tamanhoBytes,url,etiquetas,criadoEm';

  async listarMateriais(etiqueta?: string): Promise<MaterialResumo[]> {
    const eu = await this.meuId();
    let q = this.db
      .from('Material')
      .select(
        `${MotorSupabase.CAMPOS_MATERIAL},` +
          'compartilhamentos:MaterialCompartilhado(alunoId,vistoEm,aluno:User(id,nome))',
      )
      .eq('autorId', eu)
      .is('deletadoEm', null)
      .order('criadoEm', { ascending: false })
      .limit(200);
    // `cs` é "contains": a coluna é lista de etiquetas, e o filtro é por uma.
    if (etiqueta) q = q.contains('etiquetas', [etiqueta.trim().toLowerCase()]);

    return (this.ou(await q) as unknown as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      titulo: m.titulo as string,
      descricao: (m.descricao as string | null) ?? null,
      tipo: m.tipo as MaterialResumo['tipo'],
      nomeArquivo: (m.nomeArquivo as string | null) ?? null,
      mimeType: (m.mimeType as string | null) ?? null,
      tamanhoBytes:
        m.tamanhoBytes === null || m.tamanhoBytes === undefined ? null : Number(m.tamanhoBytes),
      url: (m.url as string | null) ?? null,
      etiquetas: (m.etiquetas as string[] | null) ?? [],
      criadoEm: instante(m.criadoEm),
      compartilhadoCom: ((m.compartilhamentos ?? []) as Record<string, unknown>[])
        .map((c) => ({
          alunoId: c.alunoId as string,
          nome: (umSo(c.aluno)?.nome as string | undefined) ?? '',
          vistoEm: instanteOuNulo(c.vistoEm),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }));
  }

  /** Visão do aluno: só o que foi compartilhado com ele. */
  async meusMateriais(): Promise<MaterialDoAluno[]> {
    const eu = await this.meuId();
    const linhas = this.ou(
      await this.db
        .from('MaterialCompartilhado')
        .select(
          `compartilhadoEm,vistoEm,material:Material!inner(${MotorSupabase.CAMPOS_MATERIAL},` +
            'deletadoEm,autor:User!Material_autorId_fkey(id,nome))',
        )
        .eq('alunoId', eu)
        .is('material.deletadoEm', null)
        .order('compartilhadoEm', { ascending: false })
        .limit(200),
    ) as unknown as Record<string, unknown>[];

    return linhas.map((c) => {
      const m = umSo(c.material) as Record<string, unknown>;
      return {
        id: m.id as string,
        titulo: m.titulo as string,
        descricao: (m.descricao as string | null) ?? null,
        tipo: m.tipo as MaterialDoAluno['tipo'],
        nomeArquivo: (m.nomeArquivo as string | null) ?? null,
        mimeType: (m.mimeType as string | null) ?? null,
        tamanhoBytes:
          m.tamanhoBytes === null || m.tamanhoBytes === undefined ? null : Number(m.tamanhoBytes),
        url: (m.url as string | null) ?? null,
        etiquetas: (m.etiquetas as string[] | null) ?? [],
        compartilhadoEm: instante(c.compartilhadoEm),
        vistoEm: instanteOuNulo(c.vistoEm),
        autor: umSo(m.autor) as unknown as { id: string; nome: string },
      };
    });
  }

  private async obterMaterial(id: string): Promise<MaterialResumo> {
    const encontrado = (await this.listarMateriais()).find((m) => m.id === id);
    if (!encontrado) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Material não encontrado.', 404);
    }
    return encontrado;
  }

  async criarMaterial(dados: CriarMaterialInput): Promise<MaterialResumo> {
    const eu = await this.meuId();
    const id = `${eu}-material-${Date.now()}`;
    const ehArquivo = dados.tipo === 'ARQUIVO';

    this.ou(
      await this.db.from('Material').insert({
        id,
        autorId: eu,
        titulo: dados.titulo.trim(),
        descricao: dados.descricao ?? null,
        tipo: dados.tipo,
        // Arquivo e link são excludentes: guardar os dois faria a tela ter de
        // escolher qual obedecer.
        chave: ehArquivo ? dados.chave : null,
        nomeArquivo: ehArquivo ? dados.nomeArquivo : null,
        mimeType: ehArquivo ? dados.mimeType : null,
        tamanhoBytes: ehArquivo ? dados.tamanhoBytes : null,
        url: ehArquivo ? null : dados.url,
        etiquetas: dados.etiquetas,
      }),
    );
    return this.obterMaterial(id);
  }

  /** Soft delete: o arquivo em si sai do armazenamento pela API, por enquanto. */
  async removerMaterial(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('Material')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('chave'),
    ) as unknown as { chave: string | null }[];

    const removido = linhas[0];
    if (!removido) {
      throw new ErroApi('ACESSO_NEGADO', 'Você não tem acesso a este conteúdo.', 403);
    }

    /*
      O arquivo sai do armazenamento junto — até 200 MB por material. Apagado
      que continua baixável por um link assinado antigo é só aparência de
      exclusão; e sem apagar, cada limpeza de biblioteca deixaria os arquivos
      para trás sem ninguém para reclamar deles.

      Depois do carimbo, para uma falha aqui não deixar o arquivo de pé com a
      linha dizendo que ele foi apagado.
    */
    if (removido.chave) await this.removerMidia(removido.chave);
  }

  /**
   * Compartilha com alunos da carteira.
   *
   * Só com quem tem vínculo ATIVO — a política recusa o lote inteiro se um dos
   * nomes não for aluno de quem envia. É tudo ou nada de propósito: metade
   * entregue com um erro na tela deixaria o profissional sem saber quem
   * recebeu.
   */
  async compartilharMaterial(id: string, alunoIds: string[]): Promise<MaterialResumo> {
    if (alunoIds.length > 0) {
      this.ou(
        await this.db.from('MaterialCompartilhado').upsert(
          [...new Set(alunoIds)].map((alunoId) => ({
            id: `${id}-${alunoId}`,
            materialId: id,
            alunoId,
          })),
          // Recompartilhar não apaga o "visto em" nem duplica.
          { onConflict: 'materialId,alunoId', ignoreDuplicates: true },
        ),
      );
    }
    return this.obterMaterial(id);
  }

  async descompartilharMaterial(id: string, alunoId: string): Promise<void> {
    this.ou(
      await this.db
        .from('MaterialCompartilhado')
        .delete()
        .eq('materialId', id)
        .eq('alunoId', alunoId),
    );
  }

  // --- lembretes e notificações ---------------------------------------------

  private paraLembrete(c: Record<string, unknown>): LembreteResumo {
    return {
      id: c.id as string,
      tipo: c.tipo as LembreteResumo['tipo'],
      // Colunas de array vêm como array; nulo é lista vazia, e não ausência.
      horarios: (c.horarios as string[] | null) ?? [],
      diasDaSemana: ((c.diasDaSemana as number[] | null) ?? []).map(Number),
      canais: (c.canais as LembreteResumo['canais'] | null) ?? [],
      ativo: Boolean(c.ativo),
    };
  }

  async listarLembretes(): Promise<LembreteResumo[]> {
    const eu = await this.meuId();
    const linhas = this.ou(
      await this.db
        .from('ConfiguracaoLembrete')
        .select('id,tipo,horarios,diasDaSemana,canais,ativo')
        .eq('alunoId', eu)
        .order('tipo', { ascending: true }),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((c) => this.paraLembrete(c));
  }

  /** Um lembrete por tipo: definir de novo reescreve o que estava lá. */
  async definirLembrete(dados: DefinirLembreteInput): Promise<LembreteResumo> {
    const eu = await this.meuId();
    this.ou(
      await this.db.from('ConfiguracaoLembrete').upsert(
        {
          id: `${eu}-${dados.tipo}`,
          alunoId: eu,
          tipo: dados.tipo,
          horarios: dados.horarios,
          diasDaSemana: dados.diasDaSemana,
          canais: dados.canais,
          ativo: dados.ativo,
        },
        { onConflict: 'alunoId,tipo' },
      ),
    );

    const salvo = (await this.listarLembretes()).find((l) => l.tipo === dados.tipo);
    if (!salvo) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Lembrete não encontrado.', 404);
    return salvo;
  }

  /**
   * Registra o aparelho.
   *
   * O mesmo token migra de conta — celular emprestado, troca de login —, e por
   * isso o `upsert` REATRIBUI em vez de duplicar: sem isso o dono anterior
   * continuaria recebendo os lembretes de quem está com o aparelho agora.
   */
  async registrarDispositivo(dados: RegistrarDispositivoInput): Promise<void> {
    /*
      Por função, e não por `upsert`: a reatribuição resolve um conflito com a
      linha de OUTRA pessoa, e o Postgres exige poder lê-la para isso. Fazer o
      upsert daqui obrigaria a abrir o registro de quem estava com o aparelho —
      e "este token pertence a alguém" é justamente o que não se conta.
    */
    await this.rpc<null>('registrar_dispositivo', {
      p_token: dados.token,
      p_plataforma: dados.plataforma,
    });
  }

  /** Sair carimba `ativo = false`; o registro fica, para explicar um push errado. */
  async removerDispositivo(token: string): Promise<void> {
    const eu = await this.meuId();
    this.ou(
      await this.db
        .from('TokenDispositivo')
        .update({ ativo: false })
        .eq('userId', eu)
        .eq('token', token),
    );
  }

  async listarNotificacoes(limite = 30): Promise<NotificacaoResumo[]> {
    const eu = await this.meuId();
    const linhas = this.ou(
      await this.db
        .from('Notificacao')
        .select('id,tipo,titulo,corpo,deeplink,agendadaPara,enviadaEm,lidaEm')
        .eq('userId', eu)
        .order('criadoEm', { ascending: false })
        .limit(limite),
    ) as unknown as Record<string, unknown>[];

    return linhas.map((n) => ({
      id: n.id as string,
      tipo: n.tipo as NotificacaoResumo['tipo'],
      titulo: n.titulo as string,
      corpo: n.corpo as string,
      deeplink: (n.deeplink as string | null) ?? null,
      agendadaPara: instante(n.agendadaPara),
      enviadaEm: instanteOuNulo(n.enviadaEm),
      lidaEm: instanteOuNulo(n.lidaEm),
    }));
  }

  /**
   * Marca lida. Já lida continua com a hora da PRIMEIRA abertura — reabrir a
   * lista não pode reescrever quando a pessoa viu o aviso.
   */
  async marcarNotificacaoLida(id: string): Promise<void> {
    const eu = await this.meuId();
    this.ou(
      await this.db
        .from('Notificacao')
        .update({ lidaEm: new Date().toISOString() })
        .eq('id', id)
        .eq('userId', eu),
    );
  }

  // --- página pública -------------------------------------------------------

  private static readonly CAMPOS_PERFIL_PUBLICO =
    'id,slug,titulo,apresentacao,cidade,uf,atendeOnline,atendePresencial,' +
    'whatsapp,instagram,publicado';

  async meuPerfilPublico(): Promise<PerfilPublicoResumo | null> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('PerfilPublico')
        .select(`${MotorSupabase.CAMPOS_PERFIL_PUBLICO},pedidos:PedidoDeContato(atendidoEm)`)
        .eq('profissionalId', eu)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    if (!linha) return null;

    const pedidos = (linha.pedidos ?? []) as { atendidoEm: string | null }[];
    return {
      id: linha.id as string,
      slug: linha.slug as string,
      titulo: linha.titulo as string,
      apresentacao: (linha.apresentacao as string | null) ?? null,
      cidade: (linha.cidade as string | null) ?? null,
      uf: (linha.uf as string | null) ?? null,
      atendeOnline: Boolean(linha.atendeOnline),
      atendePresencial: Boolean(linha.atendePresencial),
      whatsapp: (linha.whatsapp as string | null) ?? null,
      instagram: (linha.instagram as string | null) ?? null,
      publicado: Boolean(linha.publicado),
      pedidosPendentes: pedidos.filter((p) => !p.atendidoEm).length,
    };
  }

  /**
   * Cria ou atualiza a página.
   *
   * O gatilho normaliza o endereço, recusa os reservados e barra publicar sem
   * o registro conferido — "uma página dizendo médico sem verificação seria a
   * plataforma emprestando credibilidade a quem não comprovou nada". Salvar
   * rascunho é livre.
   */
  async salvarPerfilPublico(dados: SalvarPerfilPublicoInput): Promise<PerfilPublicoResumo> {
    const eu = await this.meuId();
    this.ou(
      await this.db.from('PerfilPublico').upsert(
        {
          id: eu,
          profissionalId: eu,
          slug: dados.slug,
          titulo: dados.titulo.trim(),
          apresentacao: dados.apresentacao ?? null,
          cidade: dados.cidade ?? null,
          uf: dados.uf ?? null,
          atendeOnline: dados.atendeOnline,
          atendePresencial: dados.atendePresencial,
          whatsapp: dados.whatsapp ?? null,
          instagram: dados.instagram ?? null,
          publicado: dados.publicado,
        },
        { onConflict: 'profissionalId' },
      ),
    );
    return (await this.meuPerfilPublico())!;
  }

  /**
   * A página que qualquer pessoa vê — inclusive sem sessão.
   *
   * Vem de uma função porque a página é uma PROJEÇÃO: nome, registro no
   * conselho e especialidades moram em tabelas que ninguém sem conta pode ler,
   * e abrir uma política para o `anon` nelas seria escancarar duas portas para
   * entregar uma janela.
   */
  async paginaPublica(slug: string): Promise<PaginaPublica> {
    const pagina = await this.rpc<PaginaPublica | null>('pagina_publica', { p_slug: slug });
    // Despublicada, não verificada e conta removida respondem igual: quem
    // procurou não descobre qual das três.
    if (!pagina) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Página não encontrada.', 404);
    return pagina;
  }

  /** O formulário da página. É a única escrita feita por quem não tem conta. */
  async enviarPedidoDeContato(slug: string, dados: EnviarPedidoInput): Promise<void> {
    await this.rpc<null>('enviar_pedido_de_contato', {
      p_slug: slug,
      p_nome: dados.nome,
      p_email: dados.email,
      p_telefone: dados.telefone ?? null,
      p_mensagem: dados.mensagem ?? null,
    });
  }

  async listarPedidosDeContato(): Promise<PedidoResumo[]> {
    const eu = await this.meuId();
    const linhas = this.ou(
      await this.db
        .from('PedidoDeContato')
        .select('id,nome,email,telefone,mensagem,atendidoEm,criadoEm,perfil:PerfilPublico!inner(profissionalId)')
        .eq('perfil.profissionalId', eu)
        .order('criadoEm', { ascending: false })
        .limit(200),
    ) as unknown as Record<string, unknown>[];

    return linhas.map((p) => ({
      id: p.id as string,
      nome: p.nome as string,
      email: p.email as string,
      telefone: (p.telefone as string | null) ?? null,
      mensagem: (p.mensagem as string | null) ?? null,
      atendidoEm: instanteOuNulo(p.atendidoEm),
      criadoEm: instante(p.criadoEm),
    }));
  }

  /** Alterna: marcar de novo desmarca — o profissional corrige o clique errado. */
  async alternarPedidoAtendido(pedidoId: string): Promise<void> {
    const atual = this.ou(
      await this.db.from('PedidoDeContato').select('atendidoEm').eq('id', pedidoId).maybeSingle(),
    ) as unknown as { atendidoEm: string | null } | null;
    if (!atual) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Pedido de contato não encontrado.', 404);
    }

    await this.exigirLinhaAlterada(
      this.db
        .from('PedidoDeContato')
        .update({ atendidoEm: atual.atendidoEm ? null : new Date().toISOString() })
        .eq('id', pedidoId)
        .select('id'),
    );
  }

  // --- conversa -------------------------------------------------------------

  private static readonly CAMPOS_MENSAGEM =
    'id,clienteUuid,conversaId,tipo,corpo,enviadaEm,removidaEm,autorId,' +
    'autor:User!Mensagem_autorId_fkey(id,nome,papel)';

  private paraMensagem(m: Record<string, unknown>, eu: string): MensagemResumo {
    const removidaEm = instanteOuNulo(m.removidaEm);
    return {
      id: m.id as string,
      clienteUuid: m.clienteUuid as string,
      conversaId: m.conversaId as string,
      tipo: m.tipo as TipoMensagem,
      // Mensagem removida não mostra o corpo — mas continua na lista, no lugar
      // dela, para a conversa não perder o fio.
      corpo: removidaEm ? null : ((m.corpo as string | null) ?? null),
      enviadaEm: instante(m.enviadaEm),
      removidaEm,
      autor: umSo(m.autor) as unknown as MensagemResumo['autor'],
      minha: m.autorId === eu,
    };
  }

  /**
   * As conversas de quem pergunta, com a última mensagem e as não lidas.
   *
   * Duas consultas: uma traz as conversas e quem está do outro lado; a outra é
   * a função `minhas_conversas`, que faz as duas contas que o PostgREST não
   * sabe fazer — "a última de cada conversa" e "quantas não lidas". Trazer as
   * mensagens para contá-las aqui seria baixar o histórico inteiro para
   * desenhar uma lista.
   */
  async listarConversas(): Promise<ConversaResumo[]> {
    const eu = await this.meuId();

    const [participacoes, agregados] = await Promise.all([
      this.db
        .from('ParticipanteConversa')
        .select(
          'conversaId,conversa:Conversa!inner(id,tipo,alunoId,' +
            'participantes:ParticipanteConversa(userId,saiuEm,user:User(id,nome,papel,avatarUrl)))',
        )
        .eq('userId', eu)
        .is('saiuEm', null),
      this.rpc<
        {
          conversaId: string;
          naoLidas: number;
          ultimaCorpo: string | null;
          ultimaEnviadaEm: string | null;
          ultimaAutorId: string | null;
          ultimaRemovidaEm: string | null;
        }[]
      >('minhas_conversas'),
    ]);

    const porConversa = new Map(agregados.map((a) => [a.conversaId, a]));

    const resumos = (this.ou(participacoes) as unknown as Record<string, unknown>[]).map((p) => {
      const c = umSo(p.conversa) as Record<string, unknown>;
      const participantes = (c.participantes ?? []) as Record<string, unknown>[];
      const outro = participantes.find((x) => x.userId !== eu && x.saiuEm === null);
      const agregado = porConversa.get(c.id as string);

      return {
        id: c.id as string,
        tipo: c.tipo as TipoConversa,
        alunoId: c.alunoId as string,
        contraparte: outro
          ? (umSo(outro.user) as unknown as ConversaResumo['contraparte'])
          : null,
        ultimaMensagem:
          agregado && agregado.ultimaEnviadaEm
            ? {
                corpo: agregado.ultimaRemovidaEm ? null : agregado.ultimaCorpo,
                enviadaEm: instante(agregado.ultimaEnviadaEm),
                autorId: agregado.ultimaAutorId!,
              }
            : null,
        naoLidas: Number(agregado?.naoLidas ?? 0),
      } satisfies ConversaResumo;
    });

    // Conversa com movimento primeiro; sem mensagem nenhuma vai para o fim.
    return resumos.sort((a, b) => {
      const ta = a.ultimaMensagem ? Date.parse(a.ultimaMensagem.enviadaEm) : 0;
      const tb = b.ultimaMensagem ? Date.parse(b.ultimaMensagem.enviadaEm) : 0;
      return tb - ta;
    });
  }

  private async conversaPorId(conversaId: string): Promise<ConversaResumo> {
    const encontrada = (await this.listarConversas()).find((c) => c.id === conversaId);
    // 404 e não 403: quem não participa não precisa saber que a conversa existe.
    if (!encontrada) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Conversa não encontrada.', 404);
    }
    return encontrada;
  }

  async abrirConversa(comUsuarioId: string): Promise<ConversaResumo> {
    return this.conversaPorId(await this.rpc<string>('abrir_conversa', {
      p_com_usuario_id: comUsuarioId,
    }));
  }

  /**
   * As mensagens, da mais recente para a mais antiga.
   *
   * A paginação é por CURSOR e não por página: numa conversa que recebe
   * mensagem enquanto se rola, a página 2 traria de novo o que já apareceu na
   * 1. O cursor é a última mensagem lida, e o que veio depois dela não
   * desloca nada.
   */
  async listarMensagens(
    conversaId: string,
    consulta: Partial<ListarMensagensQuery> = {},
  ): Promise<{ dados: MensagemResumo[]; proximoCursor: string | null }> {
    const eu = await this.meuId();
    const limite = consulta.limit ?? 40;

    let q = this.db
      .from('Mensagem')
      .select(MotorSupabase.CAMPOS_MENSAGEM)
      .eq('conversaId', conversaId)
      .order('enviadaEm', { ascending: false })
      .order('id', { ascending: false })
      .limit(limite + 1);

    if (consulta.cursor) {
      /*
        O cursor é o id da última já mostrada; o corte é pelo instante dela.
        Com o `id` como segundo critério de ordem, duas mensagens do mesmo
        milissegundo não se atropelam entre páginas.
      */
      const marco = this.ou(
        await this.db
          .from('Mensagem')
          .select('enviadaEm')
          .eq('id', consulta.cursor)
          .maybeSingle(),
      ) as unknown as { enviadaEm: string } | null;
      if (marco) q = q.lt('enviadaEm', marco.enviadaEm);
    }

    const linhas = this.ou(await q) as unknown as Record<string, unknown>[];
    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;

    return {
      dados: pagina.map((m) => this.paraMensagem(m, eu)),
      proximoCursor: temMais ? ((pagina[pagina.length - 1]?.id as string) ?? null) : null,
    };
  }

  /**
   * Envia. Idempotente por `clienteUuid`: a mesma mensagem reenviada — toque
   * duplo, rede oscilando, fila offline — não vira duas bolhas na tela.
   */
  async enviarMensagem(
    conversaId: string,
    dados: EnviarMensagemInput,
  ): Promise<MensagemResumo> {
    const eu = await this.meuId();

    const existente = this.ou(
      await this.db
        .from('Mensagem')
        .select(MotorSupabase.CAMPOS_MENSAGEM)
        .eq('clienteUuid', dados.clienteUuid)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    if (existente) return this.paraMensagem(existente, eu);

    this.ou(
      await this.db.from('Mensagem').insert({
        id: `${conversaId}-${dados.clienteUuid}`,
        conversaId,
        // O gatilho reescreve com quem está pedindo; vai porque é NOT NULL.
        autorId: eu,
        corpo: dados.corpo.trim(),
        clienteUuid: dados.clienteUuid,
      }),
    );

    const salva = this.ou(
      await this.db
        .from('Mensagem')
        .select(MotorSupabase.CAMPOS_MENSAGEM)
        .eq('clienteUuid', dados.clienteUuid)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraMensagem(salva, eu);
  }

  /** Marca "vi até agora". O contador de não lidas é derivado deste carimbo. */
  async marcarConversaVista(conversaId: string): Promise<void> {
    const eu = await this.meuId();
    await this.exigirLinhaAlterada(
      this.db
        .from('ParticipanteConversa')
        .update({ vistoEm: new Date().toISOString() })
        .eq('conversaId', conversaId)
        .eq('userId', eu)
        .select('userId'),
    );
  }

  // --- modelo de cardápio ---------------------------------------------------

  private static readonly CAMPOS_MODELO =
    'id,nome,descricao,kcalAlvo,proteinaAlvoG,carboAlvoG,gorduraAlvoG,criadoEm,' +
    'refeicoes:RefeicaoModelo(id,nome,horarioSugerido,ordem,' +
    `itens:ItemModelo(id,ordem,quantidadeG,observacao,alimento:Alimento(${MotorSupabase.CAMPOS_ALIMENTO})))`;

  private paraLinhaDeModelo(m: Record<string, unknown>): LinhaDeModeloCardapio {
    const inteiro = (v: unknown): number | null =>
      v === null || v === undefined ? null : Number(v);
    return {
      id: m.id as string,
      nome: m.nome as string,
      descricao: (m.descricao as string | null) ?? null,
      kcalAlvo: inteiro(m.kcalAlvo),
      proteinaAlvoG: inteiro(m.proteinaAlvoG),
      carboAlvoG: inteiro(m.carboAlvoG),
      gorduraAlvoG: inteiro(m.gorduraAlvoG),
      criadoEm: instante(m.criadoEm),
      refeicoes: ((m.refeicoes ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        nome: r.nome as string,
        horarioSugerido: (r.horarioSugerido as string | null) ?? null,
        ordem: Number(r.ordem),
        itens: ((r.itens ?? []) as Record<string, unknown>[]).map((i) => ({
          id: i.id as string,
          ordem: Number(i.ordem),
          quantidadeG: n(i.quantidadeG) ?? 0,
          observacao: (i.observacao as string | null) ?? null,
          alimento: this.paraAlimento((i.alimento ?? {}) as Record<string, unknown>),
        })),
      })),
    };
  }

  async listarModelosDeCardapio(): Promise<ModeloCardapioResumo[]> {
    const eu = await this.meuId();
    const linhas = this.ou(
      await this.db
        .from('ModeloCardapio')
        .select(MotorSupabase.CAMPOS_MODELO)
        .eq('nutricionistaId', eu)
        .is('deletadoEm', null)
        .order('atualizadoEm', { ascending: false }),
    ) as unknown as Record<string, unknown>[];

    // O resumo é o completo sem as refeições: `macrosTotais` é a soma dos
    // itens, então a lista precisa deles de qualquer jeito.
    return linhas.map((m) => {
      const { refeicoes: _r, ...resumo } = montarModeloCardapioCompleto(
        this.paraLinhaDeModelo(m),
      );
      return resumo;
    });
  }

  async obterModeloDeCardapio(modeloId: string): Promise<ModeloCardapioCompleto> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('ModeloCardapio')
        .select(MotorSupabase.CAMPOS_MODELO)
        .eq('id', modeloId)
        .eq('nutricionistaId', eu)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;

    if (!linha) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Modelo de cardápio não encontrado.', 404);
    }
    return montarModeloCardapioCompleto(this.paraLinhaDeModelo(linha));
  }

  async criarModeloDeCardapio(
    dados: CriarModeloCardapioInput,
  ): Promise<ModeloCardapioCompleto> {
    const id = await this.rpc<string>('criar_modelo_cardapio', { p_modelo: dados });
    return this.obterModeloDeCardapio(id);
  }

  /**
   * Transforma um plano já entregue a um paciente em molde reutilizável.
   *
   * Só o plano que ELE escreveu: a dieta de um aluno em comum com outro
   * nutricionista é leitura, não matéria-prima. É a mesma regra que a API
   * aplicava, e aqui ela é o filtro da consulta.
   */
  async salvarPlanoComoModelo(dados: SalvarComoModeloInput): Promise<ModeloCardapioCompleto> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('PlanoDieta')
        .select(MotorSupabase.CAMPOS_DIETA)
        .eq('id', dados.planoDietaId)
        .eq('nutricionistaId', eu)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;

    if (!linha) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Plano alimentar não encontrado.', 404);
    }

    const plano = montarPlanoDietaCompleto(this.paraLinhaDeDieta(linha));
    return this.criarModeloDeCardapio({
      nome: dados.nome,
      descricao: dados.descricao,
      kcalAlvo: plano.kcalAlvo ?? undefined,
      proteinaAlvoG: plano.proteinaAlvoG ?? undefined,
      carboAlvoG: plano.carboAlvoG ?? undefined,
      gorduraAlvoG: plano.gorduraAlvoG ?? undefined,
      refeicoes: plano.refeicoes.map((r) => ({
        nome: r.nome,
        horarioSugerido: r.horarioSugerido ?? undefined,
        itens: r.itens.map((i) => ({
          alimentoId: i.alimento.id,
          quantidadeG: i.quantidadeG,
          observacao: i.observacao ?? undefined,
        })),
      })),
    });
  }

  /** Soft delete: o molde pode ter virado dieta que está valendo. */
  async removerModeloDeCardapio(modeloId: string): Promise<void> {
    await this.obterModeloDeCardapio(modeloId);
    await this.exigirLinhaAlterada(
      this.db
        .from('ModeloCardapio')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', modeloId)
        .select('id'),
    );
  }

  /**
   * Aplica o molde num paciente.
   *
   * A dieta criada é INDEPENDENTE: ajustar a dieta dele depois não mexe no
   * molde, e editar o molde não altera dietas já entregues. É o ponto de
   * existir um molde — ele é ponto de partida, não vínculo.
   */
  async aplicarModelo(
    alunoId: string,
    modeloId: string,
    dados: AplicarModeloInput,
  ): Promise<PlanoDietaCompleto> {
    const modelo = await this.obterModeloDeCardapio(modeloId);
    return this.criarDieta(alunoId, planoAPartirDoModelo(modelo, dados));
  }

  // --- financeiro -----------------------------------------------------------

  private static readonly CAMPOS_COBRANCA =
    'id,descricao,valorCentavos,vencimento,status,pagaEm,formaPagamento,observacao,loteId,' +
    'aluno:User!Cobranca_alunoId_fkey(id,nome)';

  private paraLinhaDeCobranca(c: Record<string, unknown>): LinhaDeCobranca {
    return {
      id: c.id as string,
      aluno: umSo(c.aluno) as unknown as { id: string; nome: string },
      descricao: c.descricao as string,
      valorCentavos: Number(c.valorCentavos),
      vencimento: String(c.vencimento).slice(0, 10),
      status: c.status as string,
      // `pagaEm` é um instante no banco e uma data na tela: a hora de quando
      // alguém digitou a baixa não diz nada a ninguém.
      pagaEm: c.pagaEm === null || c.pagaEm === undefined ? null : instante(c.pagaEm).slice(0, 10),
      formaPagamento: (c.formaPagamento as FormaPagamento | null) ?? null,
      observacao: (c.observacao as string | null) ?? null,
    };
  }

  async resumoFinanceiro(consulta: Partial<ConsultaFinanceiro> = {}): Promise<ResumoFinanceiro> {
    const eu = await this.meuId();
    const mes = consulta.mes ?? new Date().toISOString().slice(0, 7);
    const inicio = `${mes}-01`;
    const fim = soData(somarMeses(new Date(`${inicio}T00:00:00.000Z`), 1));

    let q = this.db
      .from('Cobranca')
      .select(MotorSupabase.CAMPOS_COBRANCA)
      .eq('profissionalId', eu)
      .gte('vencimento', inicio)
      .lt('vencimento', fim)
      .order('vencimento', { ascending: true });
    if (consulta.alunoId) q = q.eq('alunoId', consulta.alunoId);

    const linhas = (this.ou(await q) as unknown as Record<string, unknown>[]).map((c) =>
      this.paraLinhaDeCobranca(c),
    );
    /*
      O filtro de situação é aplicado DEPOIS, na função do contrato: ATRASADA
      não existe como coluna — é PENDENTE que passou do vencimento —, e os
      totais precisam do mês inteiro mesmo quando a lista é filtrada.
    */
    return montarResumoFinanceiro({
      mes,
      cobrancas: linhas.sort(
        (a, b) => a.vencimento.localeCompare(b.vencimento) || a.aluno.nome.localeCompare(b.aluno.nome),
      ),
      situacao: consulta.situacao,
    });
  }

  private async obterCobranca(id: string): Promise<CobrancaResumo> {
    return montarCobrancaResumo(
      this.paraLinhaDeCobranca(
        this.ou(
          await this.db
            .from('Cobranca')
            .select(MotorSupabase.CAMPOS_COBRANCA)
            .eq('id', id)
            .single(),
        ) as unknown as Record<string, unknown>,
      ),
      hojeSemHora(),
    );
  }

  /**
   * Cria a cobrança e, se pedido, as parcelas seguintes.
   *
   * As parcelas nascem juntas em vez de saírem de um job mensal: o profissional
   * vê o ano inteiro de uma vez, e não existe mês que "não gerou" porque o
   * agendador falhou.
   */
  async criarCobranca(dados: CriarCobrancaInput): Promise<CobrancaResumo[]> {
    const eu = await this.meuId();
    const carimbo = Date.now();
    // Um lote só quando há mais de uma parcela: é o que liga a série para
    // apagá-la inteira depois.
    const loteId = dados.repetirMeses > 1 ? `${eu}-lote-${carimbo}` : null;
    const vencimentos = vencimentosDaSerie(dados.vencimento, dados.repetirMeses);

    this.ou(
      await this.db.from('Cobranca').insert(
        vencimentos.map((vencimento, i) => ({
          id: `${eu}-cobranca-${carimbo}-${i}`,
          // O gatilho reescreve com quem está pedindo; vai porque é NOT NULL.
          profissionalId: eu,
          alunoId: dados.alunoId,
          descricao: dados.descricao.trim(),
          valorCentavos: dados.valorCentavos,
          vencimento,
          observacao: dados.observacao ?? null,
          loteId,
        })),
      ),
    );

    const hoje = hojeSemHora();
    return (
      this.ou(
        await this.db
          .from('Cobranca')
          .select(MotorSupabase.CAMPOS_COBRANCA)
          .in(
            'id',
            vencimentos.map((_, i) => `${eu}-cobranca-${carimbo}-${i}`),
          )
          .order('vencimento', { ascending: true }),
      ) as unknown as Record<string, unknown>[]
    ).map((c) => montarCobrancaResumo(this.paraLinhaDeCobranca(c), hoje));
  }

  async registrarPagamento(
    id: string,
    dados: RegistrarPagamentoInput,
  ): Promise<CobrancaResumo> {
    const atual = await this.obterCobranca(id);
    if (atual.situacao === 'PAGA') {
      throw new ErroApi('CONFLITO', 'Esta cobrança já está paga.', 409);
    }
    await this.exigirLinhaAlterada(
      this.db
        .from('Cobranca')
        .update({
          status: 'PAGA',
          pagaEm: `${soData(dados.pagaEm)}T00:00:00.000Z`,
          formaPagamento: dados.formaPagamento,
          ...(dados.observacao ? { observacao: dados.observacao } : {}),
        })
        .eq('id', id)
        .select('id'),
    );
    return this.obterCobranca(id);
  }

  /** Desfaz o pagamento — erro de digitação acontece. */
  async estornarCobranca(id: string): Promise<CobrancaResumo> {
    // `pagaEm` e `formaPagamento` são limpos pelo gatilho: uma cobrança
    // pendente que ainda diz "recebido no PIX" é pior que uma sem informação.
    await this.exigirLinhaAlterada(
      this.db.from('Cobranca').update({ status: 'PENDENTE' }).eq('id', id).select('id'),
    );
    return this.obterCobranca(id);
  }

  async cancelarCobranca(id: string): Promise<CobrancaResumo> {
    await this.exigirLinhaAlterada(
      this.db.from('Cobranca').update({ status: 'CANCELADA' }).eq('id', id).select('id'),
    );
    return this.obterCobranca(id);
  }

  /**
   * Remove a série inteira de parcelas — só as que ainda não foram pagas.
   *
   * O `status <> 'PAGA'` está na política, e não só neste filtro: quem apagar
   * pelo caminho de fora esbarra na mesma regra.
   */
  async removerCobranca(id: string): Promise<{ removidas: number }> {
    const linha = this.ou(
      await this.db.from('Cobranca').select('id,loteId').eq('id', id).single(),
    ) as unknown as { id: string; loteId: string | null };

    const alvo = linha.loteId
      ? this.db.from('Cobranca').delete().eq('loteId', linha.loteId)
      : this.db.from('Cobranca').delete().eq('id', id);

    const apagadas = this.ou(await alvo.select('id')) as unknown as { id: string }[];
    return { removidas: apagadas.length };
  }

  async obterDadosDePagamento(): Promise<DadosDePagamento | null> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('DadosDePagamento')
        .select('tipoChave,chave,recebedor,cidade')
        .eq('profissionalId', eu)
        .maybeSingle(),
    ) as unknown as DadosDePagamento | null;
    return linha ?? null;
  }

  async salvarDadosDePagamento(dados: SalvarPagamentoInput): Promise<DadosDePagamento> {
    const problema = validarChavePix(dados.tipoChave, dados.chave);
    if (problema) throw new ErroApi('CONFLITO', problema, 409);

    const eu = await this.meuId();
    this.ou(
      await this.db.from('DadosDePagamento').upsert(
        {
          profissionalId: eu,
          tipoChave: dados.tipoChave,
          // Guarda já normalizada: o código é montado a partir daqui, e
          // formatar na hora de gerar espalharia a regra por dois lugares.
          chave: normalizarChavePix(dados.tipoChave, dados.chave),
          recebedor: dados.recebedor.trim(),
          cidade: dados.cidade.trim(),
        },
        { onConflict: 'profissionalId' },
      ),
    );

    return (await this.obterDadosDePagamento())!;
  }

  /**
   * Gera o "copia e cola" de uma cobrança.
   *
   * O identificador leva o id curto da cobrança, então o profissional
   * reconhece o depósito no extrato — é a única conciliação possível sem
   * gateway.
   */
  async gerarPix(cobrancaId: string): Promise<CobrancaComPix> {
    const cobranca = await this.obterCobranca(cobrancaId);
    if (cobranca.situacao === 'PAGA') {
      throw new ErroApi('CONFLITO', 'Esta cobrança já está paga.', 409);
    }

    const dados = await this.obterDadosDePagamento();
    if (!dados) {
      throw new ErroApi(
        'CONFLITO',
        'Cadastre sua chave PIX em Receba Fácil antes de gerar o código.',
        409,
      );
    }

    return {
      cobrancaId: cobranca.id,
      valorCentavos: cobranca.valorCentavos,
      descricao: cobranca.descricao,
      aluno: cobranca.aluno.nome,
      brCode: gerarBrCode({
        chave: dados.chave,
        recebedor: dados.recebedor,
        cidade: dados.cidade,
        valorCentavos: cobranca.valorCentavos,
        identificador: cobranca.id.slice(-10),
      }),
    };
  }

  async criarBloqueio(dados: CriarBloqueioInput): Promise<void> {
    const eu = await this.meuId();
    this.ou(
      await this.db.from('BloqueioAgenda').insert({
        id: `${eu}-bloqueio-${Date.now()}`,
        profissionalId: eu,
        inicioEm: paraIso(dados.inicioEm),
        fimEm: paraIso(dados.fimEm),
        motivo: dados.motivo ?? null,
      }),
    );
  }

  // --- arquivos no Storage --------------------------------------------------

  /*
    Quanto tempo vale um link de leitura.

    Cinco minutos é o que a API usava, e é o certo para laudo e foto de
    evolução: o link vaza inteiro em qualquer histórico de navegação, e a
    janela curta é o que limita o estrago.

    O treino é o caso que não cabia nesse número. A tela pede a mídia de todos
    os exercícios da sessão de uma vez, no começo — e a sessão dura uma hora.
    Com cinco minutos, o vídeo do último exercício chegava morto, e o aluno via
    um quadrado preto justamente no movimento que ele menos conhece. É
    demonstração de exercício, não dado de saúde: uma hora aqui custa pouco.
  */
  private static readonly VALIDADE_LEITURA_SEG = 5 * 60;
  private static readonly VALIDADE_TREINO_SEG = 60 * 60;

  private static expiraEm(segundos: number): string {
    return new Date(Date.now() + segundos * 1000).toISOString();
  }

  /**
   * Link de leitura de um arquivo guardado.
   *
   * O catálogo é público e responde com URL direta — é a figura do acervo, a
   * mesma para todo mundo, e assinar cada uma seria pagar um HMAC por item de
   * uma lista de cem para esconder o que não é segredo. Todo o resto é
   * assinado, e é o Storage que decide se assina: a política do compartimento
   * roda com a sessão de quem pediu.
   */
  async urlDeLeitura(
    chave: string,
    segundos = MotorSupabase.VALIDADE_LEITURA_SEG,
  ): Promise<UrlAssinada> {
    const partes = partesDaChave(chave);
    if (!partes) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Arquivo não encontrado.', 404);

    const publica = urlPublicaDoCatalogo(this.opcoes.url, chave);
    if (publica) {
      // Não expira. A data existe porque o contrato a tem, e quem lê precisa de
      // um valor que não faça a tela pedir outro link a cada minuto.
      return { url: publica, expiraEm: MotorSupabase.expiraEm(365 * 24 * 3600) };
    }

    const r = await this.db.storage
      .from(partes.compartimento)
      .createSignedUrl(partes.caminho, segundos);
    if (r.error || !r.data?.signedUrl) {
      /*
        O Storage responde o mesmo "Object not found" para arquivo que não
        existe e para arquivo que a política não deixa ver — de propósito, e
        está certo: distinguir os dois contaria que o arquivo existe.
      */
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Arquivo não encontrado.', 404);
    }
    return { url: r.data.signedUrl, expiraEm: MotorSupabase.expiraEm(segundos) };
  }

  /**
   * Links de vários arquivos de uma vez.
   *
   * A tela de execução pede a mídia de seis exercícios no começo do treino;
   * uma assinatura por arquivo seriam seis idas à rede no meio da academia. O
   * Storage assina em lote, mas só dentro de um compartimento — daí o
   * agrupamento.
   *
   * Chave que o Storage recusa simplesmente não entra no mapa. Quem chama
   * trata a ausência (é o caso da maioria do acervo hoje), e derrubar a tela de
   * treino inteira porque um vídeo sumiu seria a troca errada.
   */
  async urlsDeLeitura(
    chaves: readonly string[],
    segundos = MotorSupabase.VALIDADE_LEITURA_SEG,
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    const porCompartimento = new Map<string, { chave: string; caminho: string }[]>();

    for (const chave of new Set(chaves)) {
      const partes = partesDaChave(chave);
      if (!partes) continue;
      const publica = urlPublicaDoCatalogo(this.opcoes.url, chave);
      if (publica) {
        mapa.set(chave, publica);
        continue;
      }
      const lista = porCompartimento.get(partes.compartimento) ?? [];
      lista.push({ chave, caminho: partes.caminho });
      porCompartimento.set(partes.compartimento, lista);
    }

    await Promise.all(
      [...porCompartimento].map(async ([compartimento, itens]) => {
        const r = await this.db.storage
          .from(compartimento)
          .createSignedUrls(
            itens.map((i) => i.caminho),
            segundos,
          );
        if (r.error || !r.data) return;
        /*
          A resposta vem na ordem do pedido, mas quem liga o link de volta à
          chave é o `path` de cada item: a ordem é detalhe de implementação do
          Storage, e um item recusado no meio da lista deslocaria todo o resto.
        */
        const porCaminho = new Map(
          r.data.filter((d) => d.signedUrl).map((d) => [d.path ?? '', d.signedUrl]),
        );
        for (const i of itens) {
          const url = porCaminho.get(i.caminho);
          if (url) mapa.set(i.chave, url);
        }
      }),
    );

    return mapa;
  }

  /**
   * Envia um arquivo e devolve a chave que os registros guardam.
   *
   * Antes o servidor decidia o endereço e assinava uma autorização de PUT;
   * agora o cliente monta o endereço e o Storage decide se aceita. A diferença
   * que importa: o endereço começa com o id de quem envia, e a política do
   * compartimento recusa qualquer coisa fora dessa pasta. Um cliente adulterado
   * pode pedir o caminho que quiser — o banco é que responde não.
   *
   * O limite de tamanho e a lista de formatos também estão no compartimento. A
   * conferência aqui é só para a pessoa saber ANTES de subir 90 MB por uma
   * conexão de celular que o arquivo não serve.
   */
  async enviarMidia(tipo: TipoMidia, arquivo: Blob, mimeType?: string): Promise<string> {
    const tipoReal = mimeType ?? arquivo.type;
    const limite = LIMITES_MIDIA[tipo];
    if (!limite.mimesAceitos.includes(tipoReal)) {
      throw new ErroApi(
        'DADOS_INVALIDOS',
        `Formato de arquivo não aceito: ${tipoReal || 'desconhecido'}.`,
        422,
      );
    }
    if (arquivo.size > limite.tamanhoMaximoBytes) {
      const mb = Math.floor(limite.tamanhoMaximoBytes / (1024 * 1024));
      throw new ErroApi('DADOS_INVALIDOS', `Arquivo acima do limite de ${mb} MB.`, 422);
    }

    const eu = await this.meuId();
    const chave = chaveDeMidia(tipo, eu, tipoReal);
    const partes = partesDaChave(chave);
    if (!partes) throw new ErroApi('ERRO_INTERNO', 'Falha ao enviar o arquivo.', 500);

    /*
      O tipo tem de estar NO BLOB, e não só na opção.

      O `supabase-js` manda Blob como `multipart/form-data`, e nesse caminho
      quem o Storage lê é o tipo do próprio Blob — a opção `contentType` não
      chega até a conferência. Um Blob sem tipo (é o que sai de `fetch().blob()`
      no celular, e de qualquer montagem à mão) era recusado como "mime type
      not supported" mesmo sendo um JPEG perfeitamente aceito, e a tela dizia
      "formato não aceito" sobre a foto que a pessoa acabara de tirar.
    */
    const corpo = arquivo.type === tipoReal ? arquivo : new Blob([arquivo], { type: tipoReal });

    const r = await this.db.storage
      .from(partes.compartimento)
      .upload(partes.caminho, corpo, { contentType: tipoReal, upsert: false });
    if (r.error) {
      const texto = r.error.message ?? '';
      /*
        O Storage recusa por política com uma frase que não se mostra a ninguém
        ("new row violates row-level security policy"). Traduzir aqui é o que
        faz a tela dizer o que houve em vez de "erro inesperado".
      */
      if (/row-level security|not authorized|violates/i.test(texto)) {
        throw new ErroApi('ACESSO_NEGADO', 'Você não pode enviar este arquivo.', 403);
      }
      if (/exceeded the maximum|payload too large/i.test(texto)) {
        throw new ErroApi('DADOS_INVALIDOS', 'Arquivo acima do limite.', 422);
      }
      if (/mime type|not supported/i.test(texto)) {
        throw new ErroApi('DADOS_INVALIDOS', 'Formato de arquivo não aceito.', 422);
      }
      throw new ErroApi('ERRO_INTERNO', 'Falha ao enviar o arquivo.', 502);
    }
    return chave;
  }

  /**
   * Apaga um arquivo.
   *
   * Silencioso de propósito: quem chama está trocando um vídeo ou desfazendo
   * uma gravação, e a linha do banco já mudou. Falhar aqui deixaria o registro
   * apontando para um arquivo que já não deveria existir — pior do que um
   * arquivo órfão, que só ocupa espaço.
   */
  async removerMidia(chave: string): Promise<void> {
    const partes = partesDaChave(chave);
    if (!partes) return;
    await this.db.storage.from(partes.compartimento).remove([partes.caminho]);
  }

  // --- exercícios -----------------------------------------------------------

  private static readonly CAMPOS_EXERCICIO =
    'id,nome,grupoMuscular,equipamento,instrucoes,escopo,videoChave,criadoPorId,' +
    'passos,imagemChave,imagemCredito,videoCredito,videoExternoUrl';

  /**
   * `temDemonstracao` chega de fora porque exige uma consulta que nem toda
   * chamada faz. O padrão é `null` — "não perguntei" —, e não `false`: quem
   * acabou de renomear um exercício não consultou demonstração nenhuma, e
   * afirmar que não existe seria inventar resposta.
   */
  private paraExercicio(
    e: Record<string, unknown>,
    imagemUrl: string | null = null,
    temDemonstracao: boolean | null = null,
  ): ExercicioResumo {
    return {
      id: e.id as string,
      nome: e.nome as string,
      grupoMuscular: e.grupoMuscular as ExercicioResumo['grupoMuscular'],
      equipamento: (e.equipamento as string | null) ?? null,
      instrucoes: (e.instrucoes as string | null) ?? null,
      passos: (e.passos as string[] | null) ?? [],
      escopo: e.escopo as ExercicioResumo['escopo'],
      temVideo: (e.videoChave ?? null) !== null,
      temDemonstracao,
      criadoPorId: (e.criadoPorId as string | null) ?? null,
      imagemUrl,
      imagemCredito: (e.imagemCredito as string | null) ?? null,
      videoCredito: (e.videoCredito as string | null) ?? null,
      // Passa pela lista de hosts aqui também: o valor vira `src` de iframe.
      videoExternoUrl: playerExternoSeguro(e.videoExternoUrl as string | null),
    };
  }

  /**
   * A biblioteca GLOBAL mais o que a pessoa criou.
   *
   * O recorte não está nesta consulta — está na política `exercicio_le`. Um
   * `or(...)` aqui seria uma segunda cópia da mesma regra, que um dia diverge.
   */
  async listarExercicios(
    consulta: Partial<ListarExerciciosQuery> = {},
  ): Promise<ExercicioResumo[]> {
    let q = this.db
      .from('Exercicio')
      .select(MotorSupabase.CAMPOS_EXERCICIO)
      .is('deletadoEm', null)
      .order('grupoMuscular', { ascending: true })
      .order('nome', { ascending: true })
      .limit(consulta.limit ?? 50);

    if (consulta.grupoMuscular) q = q.eq('grupoMuscular', consulta.grupoMuscular);
    // `ilike` com os dois curingas é o `contains` sem diferenciar maiúsculas do
    // Prisma. O que a pessoa digita vai como valor, não como SQL.
    if (consulta.q) q = q.ilike('nome', `%${consulta.q}%`);

    const linhas = this.ou(await q) as unknown as Record<string, unknown>[];

    /*
      Uma consulta para a página inteira, e não uma por exercício: a biblioteca
      passa de cem itens, e N+1 aqui seria sentido.

      A imagem é assinada AQUI, na listagem, e não só no exercício individual —
      diferente do laudo de exame, onde a decisão foi a oposta. O motivo é o
      uso: a biblioteca é navegada olhando, e uma lista de nomes sem figura não
      serve para escolher exercício.
    */
    const ids = linhas.map((l) => l.id as string);
    const demonstracoes = await this.demonstracoesParaMim(ids);
    const imagens = await this.urlsDeLeitura(
      linhas.map((l) => l.imagemChave as string | null).filter((c): c is string => !!c),
    );

    return linhas.map((l) =>
      this.paraExercicio(
        l,
        imagens.get(l.imagemChave as string) ?? null,
        demonstracoes.has(l.id as string),
      ),
    );
  }

  async obterExercicio(id: string): Promise<ExercicioResumo> {
    const linha = this.ou(
      await this.db
        .from('Exercicio')
        .select(MotorSupabase.CAMPOS_EXERCICIO)
        .eq('id', id)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    if (!linha) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Exercício não encontrado.', 404);

    const demonstracoes = await this.demonstracoesParaMim([id]);
    const imagemChave = linha.imagemChave as string | null;
    const imagem = imagemChave ? await this.urlDeLeitura(imagemChave).catch(() => null) : null;
    return this.paraExercicio(linha, imagem?.url ?? null, demonstracoes.has(id));
  }

  /**
   * Cria na biblioteca de quem pediu.
   *
   * Nem `escopo` nem `criadoPorId` vão no corpo: quem os define é o gatilho
   * `governar_exercicio`, no banco. Mandá-los daqui só criaria a ilusão de que
   * o cliente escolhe — ADMIN cria GLOBAL, os outros criam PRIVADO, e é o papel
   * no token que decide.
   */
  async criarExercicio(dados: CriarExercicioInput): Promise<ExercicioResumo> {
    const eu = await this.meuId();
    const linha = this.ou(
      await this.db
        .from('Exercicio')
        .insert({
          id: `${eu}-ex-${Date.now()}`,
          nome: dados.nome.trim(),
          grupoMuscular: dados.grupoMuscular,
          equipamento: dados.equipamento ?? null,
          instrucoes: dados.instrucoes ?? null,
        })
        .select(MotorSupabase.CAMPOS_EXERCICIO)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraExercicio(linha);
  }

  async atualizarExercicio(id: string, dados: AtualizarExercicioInput): Promise<ExercicioResumo> {
    const campos: Record<string, unknown> = {};
    if (dados.nome !== undefined) campos.nome = dados.nome.trim();
    if (dados.grupoMuscular !== undefined) campos.grupoMuscular = dados.grupoMuscular;
    if (dados.equipamento !== undefined) campos.equipamento = dados.equipamento;
    if (dados.instrucoes !== undefined) campos.instrucoes = dados.instrucoes;

    const linhas = this.ou(
      await this.db
        .from('Exercicio')
        .update(campos)
        .eq('id', id)
        .is('deletadoEm', null)
        .select(MotorSupabase.CAMPOS_EXERCICIO),
    ) as unknown as Record<string, unknown>[];

    const linha = linhas[0];
    if (!linha) throw await this.recusaDeExercicio(id);
    return this.paraExercicio(linha);
  }

  /**
   * Remoção é carimbo: o exercício aparece em planos antigos, e apagar a linha
   * levaria junto a carga que o aluno levantou.
   */
  async removerExercicio(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('Exercicio')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) throw await this.recusaDeExercicio(id);
  }

  /**
   * Por que o UPDATE não pegou nada — a frase que a tela mostra.
   *
   * UPDATE recusado por política afeta zero linhas e responde 200, então o
   * motivo tem de ser reconstruído. São dois, e confundi-los é o que faz o
   * profissional achar que o app quebrou: o exercício é do acervo global (e aí
   * só o admin cuida dele), ou não existe para ele — que é a mesma resposta
   * para "não existe" e "é de outra pessoa", de propósito.
   */
  private async recusaDeExercicio(id: string): Promise<ErroApi> {
    const linha = this.ou(
      await this.db.from('Exercicio').select('escopo').eq('id', id).maybeSingle(),
    ) as { escopo: string } | null;

    if (linha?.escopo === 'GLOBAL') {
      return new ErroApi(
        'PAPEL_NAO_AUTORIZADO',
        'Exercícios da biblioteca global só o admin edita.',
        403,
      );
    }
    return new ErroApi('RECURSO_NAO_ENCONTRADO', 'Exercício não encontrado.', 404);
  }

  /**
   * Aponta o exercício para um vídeo já enviado.
   *
   * A conferência de dono está no gatilho (`exercicios/<eu>/…`), e não aqui: é
   * a única cópia que um cliente adulterado não contorna.
   */
  async vincularVideo(id: string, chave: string): Promise<ExercicioResumo> {
    const anterior = this.ou(
      await this.db.from('Exercicio').select('videoChave').eq('id', id).maybeSingle(),
    ) as { videoChave: string | null } | null;

    const linhas = this.ou(
      await this.db
        .from('Exercicio')
        .update({ videoChave: chave })
        .eq('id', id)
        .is('deletadoEm', null)
        .select(MotorSupabase.CAMPOS_EXERCICIO),
    ) as unknown as Record<string, unknown>[];

    const linha = linhas[0];
    if (!linha) throw await this.recusaDeExercicio(id);

    /*
      Trocar o vídeo apaga o anterior: são até 100 MB cada, e sem isto regravar
      algumas vezes enche o compartimento de arquivos que ninguém alcança.
      Depois do update, para uma falha aqui não deixar o exercício apontando
      para um arquivo que já não existe.
    */
    if (anterior?.videoChave && anterior.videoChave !== chave) {
      await this.removerMidia(anterior.videoChave);
    }
    return this.paraExercicio(linha);
  }

  /**
   * Link do vídeo de um exercício.
   *
   * A gravação de quem acompanha a pessoa vence a do acervo — a mesma ordem de
   * `midiaDeExercicios`. Sem isso o profissional não conseguia rever a própria
   * demonstração num exercício GLOBAL: o exercício não tem `videoChave` e o
   * pedido morria em 404 logo depois do envio, justo quando ele quer conferir o
   * enquadramento para regravar na hora.
   */
  async urlDoVideoDoExercicio(id: string): Promise<UrlAssinada> {
    const linha = this.ou(
      await this.db
        .from('Exercicio')
        .select('videoChave')
        .eq('id', id)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as { videoChave: string | null } | null;
    if (!linha) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Exercício não encontrado.', 404);

    const minhas = await this.demonstracoesParaMim([id]);
    const chave = minhas.get(id) ?? linha.videoChave;
    if (!chave) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Vídeo do exercício não encontrado.', 404);
    }
    return this.urlDeLeitura(chave);
  }

  /**
   * A mídia de vários exercícios de uma vez — o pedido do começo do treino.
   *
   * O plano de treino não traz `imagemUrl` de propósito: a assinatura vale
   * pouco e o plano fica em cache offline, então o link chegaria morto. Mas
   * quem está treinando precisa ver o movimento na hora, e pedir uma assinatura
   * por exercício seriam seis idas à rede no meio da academia.
   */
  async midiaDeExercicios(ids: string[]): Promise<MidiaDeExercicios> {
    if (ids.length === 0) return {};

    const linhas = this.ou(
      await this.db
        .from('Exercicio')
        .select('id,imagemChave,videoChave,videoExternoUrl')
        .in('id', ids)
        .is('deletadoEm', null),
    ) as unknown as {
      id: string;
      imagemChave: string | null;
      videoChave: string | null;
      videoExternoUrl: string | null;
    }[];

    const minhas = await this.demonstracoesParaMim(ids);

    const chaves: string[] = [];
    for (const e of linhas) {
      if (e.imagemChave) chaves.push(e.imagemChave);
      const video = minhas.get(e.id) ?? e.videoChave;
      if (video) chaves.push(video);
    }
    const urls = await this.urlsDeLeitura(chaves, MotorSupabase.VALIDADE_TREINO_SEG);

    const mapa: MidiaDeExercicios = {};
    for (const e of linhas) {
      /*
        A gravação do profissional que acompanha esta pessoa vence a do acervo:
        ela mostra o aparelho da academia dele, a variação que ele prescreve e a
        voz que o aluno reconhece. O vídeo genérico é a reserva.
      */
      const chaveDeVideo = minhas.get(e.id) ?? e.videoChave;
      /*
        O player de fora é a última reserva: só vai quando não há arquivo nosso
        nenhum. Mandar os dois deixaria a escolha para cada tela — e bastaria
        uma decidir diferente para o aluno ver a demonstração genérica por cima
        da gravação do personal dele.
      */
      const externo = chaveDeVideo ? null : playerExternoSeguro(e.videoExternoUrl);
      const imagemUrl = e.imagemChave ? (urls.get(e.imagemChave) ?? null) : null;
      const videoUrl = chaveDeVideo ? (urls.get(chaveDeVideo) ?? null) : null;
      if (!imagemUrl && !videoUrl && !externo) continue;
      mapa[e.id] = { imagemUrl, videoUrl, videoExternoUrl: externo };
    }
    return mapa;
  }

  /**
   * As demonstrações de quem acompanha esta pessoa.
   *
   * Para o ALUNO são as dos profissionais com vínculo ativo; para o
   * profissional, as dele — ele precisa ver a própria gravação para conferir se
   * ficou boa. Quem faz esse recorte é a política `demonstracao_le`, e por isso
   * aqui não há filtro por profissional: repetir a regra no cliente seria a
   * segunda cópia que um dia diverge.
   *
   * Com mais de um profissional na equipe, o desempate é pelo mais recente:
   * quem gravou por último provavelmente gravou sabendo do outro.
   */
  private async demonstracoesParaMim(exercicioIds: string[]): Promise<Map<string, string>> {
    if (exercicioIds.length === 0) return new Map();
    const linhas = this.ou(
      await this.db
        .from('DemonstracaoProfissional')
        .select('exercicioId,videoChave')
        .in('exercicioId', exercicioIds)
        .order('atualizadoEm', { ascending: true }),
    ) as unknown as { exercicioId: string; videoChave: string }[];

    // `asc` mais sobrescrita: o último a entrar no mapa é o mais recente.
    const mapa = new Map<string, string>();
    for (const d of linhas) mapa.set(d.exercicioId, d.videoChave);
    return mapa;
  }

  /**
   * Grava (ou regrava) a demonstração do profissional.
   *
   * Vale para o exercício GLOBAL também, e é esse o ponto: o personal grava o
   * supino da academia dele sem criar um "supino do Diego", que quebraria o
   * histórico de carga do aluno — indexado por exercício.
   */
  async gravarDemonstracao(exercicioId: string, chave: string): Promise<void> {
    const eu = await this.meuId();

    const anterior = this.ou(
      await this.db
        .from('DemonstracaoProfissional')
        .select('videoChave')
        .eq('profissionalId', eu)
        .eq('exercicioId', exercicioId)
        .maybeSingle(),
    ) as { videoChave: string | null } | null;

    const r = await this.db
      .from('DemonstracaoProfissional')
      .upsert(
        { profissionalId: eu, exercicioId, videoChave: chave },
        { onConflict: 'profissionalId,exercicioId' },
      )
      .select('exercicioId');
    if (r.error) throw erroDoSupabase(r.error);
    if ((r.data ?? []).length === 0) {
      throw new ErroApi('ACESSO_NEGADO', 'Você não pode gravar neste exercício.', 403);
    }

    // Regravar apaga o arquivo anterior — até 100 MB cada. Depois da gravação,
    // para uma falha aqui não deixar o registro apontando para o vazio.
    if (anterior?.videoChave && anterior.videoChave !== chave) {
      await this.removerMidia(anterior.videoChave);
    }
  }

  async removerDemonstracao(exercicioId: string): Promise<void> {
    const eu = await this.meuId();
    const linhas = this.ou(
      await this.db
        .from('DemonstracaoProfissional')
        .delete()
        .eq('profissionalId', eu)
        .eq('exercicioId', exercicioId)
        .select('videoChave'),
    ) as unknown as { videoChave: string }[];

    const removida = linhas[0];
    if (!removida) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Demonstração não encontrada.', 404);
    }
    await this.removerMidia(removida.videoChave);
  }

  /**
   * O que gravar primeiro.
   *
   * Gravar o acervo inteiro é um projeto que ninguém termina; gravar as quinze
   * que aparecem em todos os planos é uma tarde. A ordem é pelo número de
   * prescrições do próprio profissional, porque o exercício que ele mais
   * receita é o que mais aluno executa sem ninguém olhando — e é onde a falta
   * de referência visual vira risco de lesão.
   *
   * Só entra o que ainda não tem demonstração dele: a lista é de trabalho
   * pendente, e item já feito sumindo dela é o que faz a fila encurtar.
   */
  async planoDeGravacao(): Promise<ExercicioAGravar[]> {
    const eu = await this.usuarioAtual();
    if (!eu) throw new ErroApi('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.', 401);
    if (eu.papel === 'ALUNO') {
      throw new ErroApi('PAPEL_NAO_AUTORIZADO', 'Só profissionais gravam demonstração.', 403);
    }

    /*
      Conta prescrições nos planos DELE. Um exercício que ele nunca receitou não
      é urgente por mais popular que seja no acervo — quem grava é ele, e o
      tempo dele é o recurso escasso aqui.

      A contagem é uma função do banco porque pelo PostgREST seria trazer todos
      os itens de todos os planos para contar no celular.
    */
    const contagens = await this.rpc<{ exercicioId: string; vezes: number }[]>(
      'prescricoes_por_exercicio',
    );
    const vezes = new Map(contagens.map((c) => [c.exercicioId, Number(c.vezes)]));

    const jaGravados = this.ou(
      await this.db
        .from('DemonstracaoProfissional')
        .select('exercicioId')
        .eq('profissionalId', eu.id),
    ) as unknown as { exercicioId: string }[];
    const gravados = new Set(jaGravados.map((d) => d.exercicioId));

    const linhas = this.ou(
      await this.db
        .from('Exercicio')
        .select('id,nome,grupoMuscular,equipamento,escopo,videoChave,imagemChave,videoExternoUrl')
        .is('deletadoEm', null),
    ) as unknown as {
      id: string;
      nome: string;
      grupoMuscular: string;
      equipamento: string | null;
      escopo: 'GLOBAL' | 'PRIVADO';
      videoChave: string | null;
      imagemChave: string | null;
      videoExternoUrl: string | null;
    }[];

    return linhas
      .filter((e) => {
        if (gravados.has(e.id)) return false;
        /*
          No exercício PRIVADO o vídeo vai para o exercício em si, não para a
          tabela de demonstrações. Sem esta linha ele nunca sairia da fila — o
          profissional gravaria, veria o item continuar lá e gravaria de novo.
        */
        if (e.escopo === 'PRIVADO' && e.videoChave !== null) return false;
        return true;
      })
      .map((e) => ({
        id: e.id,
        nome: e.nome,
        grupoMuscular: e.grupoMuscular as ExercicioAGravar['grupoMuscular'],
        equipamento: e.equipamento,
        escopo: e.escopo,
        vezesPrescrito: vezes.get(e.id) ?? 0,
        /*
          Ter figura ou vídeo do acervo não dispensa gravar, mas muda a
          urgência: o aluno pelo menos vê o movimento. Sem nada, ele executa por
          adivinhação — e foi por isso que a gravação virou prioridade.
        */
        temAlgumaReferencia:
          e.videoChave !== null || e.imagemChave !== null || e.videoExternoUrl !== null,
      }))
      .sort(
        (a, b) =>
          b.vezesPrescrito - a.vezesPrescrito ||
          Number(a.temAlgumaReferencia) - Number(b.temAlgumaReferencia) ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      );
  }

  // --- fotos de evolução ----------------------------------------------------

  private static readonly CAMPOS_FOTO =
    'id,alunoId,data,angulo,observacao,visivelPara,chaveArquivo,deletadoEm';

  /**
   * A lista de fotos, com o link de cada uma.
   *
   * As três travas ficaram no banco: vínculo, consentimento de EVOLUCAO e a
   * lista `visivelPara`, que o aluno define foto a foto. Nenhuma delas aparece
   * nesta consulta, e é de propósito — a que estava aqui em JavaScript (o
   * filtro por `visivelPara`) era a que sumia quando a API saísse.
   *
   * A assinatura é em lote: uma tela de evolução mostra dezenas de fotos, e uma
   * ida à rede por foto seria uma tela que demora a carregar sem motivo.
   */
  async listarFotos(alunoId: string): Promise<FotoEvolucaoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('FotoEvolucao')
        .select(MotorSupabase.CAMPOS_FOTO)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .order('data', { ascending: false })
        .limit(200),
    ) as unknown as LinhaFoto[];

    const urls = await this.urlsDeLeitura(linhas.map((f) => f.chaveArquivo));
    const expiraEm = MotorSupabase.expiraEm(MotorSupabase.VALIDADE_LEITURA_SEG);

    /*
      Foto cujo link não saiu fica de fora da lista. É o arquivo que sumiu do
      armazenamento com a linha ainda no banco — mostrar o quadro quebrado não
      ajuda ninguém, e derrubar a tela inteira por causa de uma ajudaria menos.
    */
    return linhas
      .filter((f) => urls.has(f.chaveArquivo))
      .map((f) => this.paraFoto(f, urls.get(f.chaveArquivo)!, expiraEm));
  }

  private paraFoto(f: LinhaFoto, url: string, urlExpiraEm: string): FotoEvolucaoResumo {
    return {
      id: f.id,
      // A coluna é `date`, e o PostgREST já a devolve como `AAAA-MM-DD`. Passar
      // por `new Date()` aqui traria o fuso de volta, e com ele o dia errado.
      data: f.data,
      angulo: f.angulo as AnguloFoto,
      observacao: f.observacao,
      visivelPara: f.visivelPara,
      url,
      urlExpiraEm,
    };
  }

  /**
   * Registra a foto que já subiu para o armazenamento.
   *
   * Nasce visível só para o titular quando `visivelPara` vem vazio, que é o
   * padrão do contrato: foto de evolução é o dado mais íntimo do app, e
   * liberar é um ato consciente, feito depois, foto a foto.
   */
  async registrarFoto(alunoId: string, dados: RegistrarFotoInput): Promise<FotoEvolucaoResumo> {
    const eu = await this.meuId();
    if (alunoId !== eu) {
      throw new ErroApi('PAPEL_NAO_AUTORIZADO', 'Somente o aluno envia as próprias fotos.', 403);
    }

    const linha = this.ou(
      await this.db
        .from('FotoEvolucao')
        .insert({
          alunoId: eu,
          // `date` no banco: o dia, sem hora e sem fuso. Mandar o instante
          // inteiro faria a foto tirada às 22h de Brasília cair no dia seguinte.
          data: dados.data.toISOString().slice(0, 10),
          chaveArquivo: dados.chave,
          mimeType: dados.mimeType,
          tamanhoBytes: dados.tamanhoBytes,
          angulo: dados.angulo,
          observacao: dados.observacao ?? null,
          visivelPara: dados.visivelPara,
        })
        .select(MotorSupabase.CAMPOS_FOTO)
        .single(),
    ) as unknown as LinhaFoto;

    const { url, expiraEm } = await this.urlDeLeitura(linha.chaveArquivo);
    return this.paraFoto(linha, url, expiraEm);
  }

  /**
   * Quem vê esta foto.
   *
   * O caminho de volta importa tanto quanto o de ida: tirar um papel da lista
   * tem de fechar a porta de verdade. Fecha — a política lê a lista a cada
   * consulta, e o link já assinado morre no prazo dele.
   */
  async definirVisibilidadeDaFoto(
    alunoId: string,
    fotoId: string,
    visivelPara: string[],
  ): Promise<FotoEvolucaoResumo> {
    const linhas = this.ou(
      await this.db
        .from('FotoEvolucao')
        .update({ visivelPara })
        .eq('id', fotoId)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .select(MotorSupabase.CAMPOS_FOTO),
    ) as unknown as LinhaFoto[];

    const linha = linhas[0];
    if (!linha) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Foto não encontrada.', 404);

    const { url, expiraEm } = await this.urlDeLeitura(linha.chaveArquivo);
    return this.paraFoto(linha, url, expiraEm);
  }

  /**
   * Apaga a foto: o arquivo sai, o registro fica carimbado.
   *
   * O registro fica porque é ele que responde "quem viu esta foto" — direito do
   * titular pela LGPD, e a pergunta continua valendo depois de a pessoa apagar
   * a imagem. O que some é o que ela quis que sumisse: a imagem.
   */
  async removerFoto(alunoId: string, fotoId: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('FotoEvolucao')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', fotoId)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .select('chaveArquivo'),
    ) as unknown as { chaveArquivo: string }[];

    const removida = linhas[0];
    if (!removida) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Foto não encontrada.', 404);

    // Depois do carimbo, para uma falha aqui não deixar a foto de pé com a
    // linha dizendo que ela foi apagada.
    await this.removerMidia(removida.chaveArquivo);
  }

  /**
   * Anexa o laudo ao exame.
   *
   * Passa por uma função do banco, e não por um `update` direto, porque a
   * coluna `chaveArquivo` não é legível por ninguém — personal e nutricionista
   * nunca alcançam o laudo, e a chave crua não sai do banco. Sem poder lê-la,
   * o cliente não descobriria qual arquivo ficou para trás ao trocar o laudo, e
   * cada correção deixaria até 25 MB ocupados para sempre.
   *
   * A função devolve a chave anterior só quando ela é de quem está chamando.
   */
  async anexarLaudo(exameId: string, chave: string, mimeType: string): Promise<void> {
    const anterior = await this.rpc<string | null>('anexar_laudo', {
      p_exame_id: exameId,
      p_chave: chave,
      p_mime: mimeType,
    });

    // Depois de trocar, para uma falha aqui não deixar o exame apontando para
    // um arquivo que já não existe.
    if (anterior) await this.removerMidia(anterior);
  }

  /**
   * O link para abrir um material.
   *
   * Quem pode ver já está decidido por `material_le`: o autor e quem recebeu.
   * Material que a pessoa não recebeu simplesmente não vem na consulta, e a
   * resposta é "não encontrado" — quem não recebeu não precisa saber que ele
   * existe.
   */
  async abrirMaterial(id: string): Promise<UrlAssinada> {
    const material = this.ou(
      await this.db
        .from('Material')
        .select('id,tipo,chave')
        .eq('id', id)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as { id: string; tipo: string; chave: string | null } | null;

    if (!material) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Material não encontrado.', 404);
    if (material.tipo !== 'ARQUIVO' || !material.chave) {
      throw new ErroApi('CONFLITO', 'Este material é um link, não um arquivo.', 409);
    }

    /*
      A primeira abertura marca o recebimento — é o que diz ao profissional se
      o material chegou a ser aberto. O carimbo é do aluno que recebeu: a
      política só deixa cada um marcar a própria entrega, e o gatilho fixa a
      hora na PRIMEIRA vez (visto uma vez, visto para sempre).

      Sem `await` no caminho crítico? Não: com. A marcação é uma ida à rede, e
      engoli-la em segundo plano faria a tela do profissional mentir de vez em
      quando, sem nada para investigar. Erro aqui não derruba a abertura, que é
      o que a pessoa pediu.
    */
    const eu = await this.meuId();
    await this.db
      .from('MaterialCompartilhado')
      .update({ vistoEm: new Date().toISOString() })
      .eq('materialId', id)
      .eq('alunoId', eu)
      .is('vistoEm', null);

    return this.urlDeLeitura(material.chave);
  }

  // --- receitas e refeições salvas ------------------------------------------

  private static readonly CAMPOS_RECEITA =
    'id,nome,descricao,modoPreparo,rendePorcoes,nomeDaPorcao,tempoMinutos,' +
    `ingredientes:IngredienteReceita(id,alimentoId,quantidadeG,observacao,ordem,alimento:Alimento(${MotorSupabase.CAMPOS_ALIMENTO}))`;

  /**
   * A linha do banco no formato que a montagem espera.
   *
   * A conta mora em `@vivio/contracts` porque a mesma receita é montada em dois
   * lugares, e dois arredondamentos dariam dois totais para a mesma tela. Aqui
   * só se converte: o PostgREST devolve `numeric` como TEXTO, e um texto
   * escapando até a soma vira concatenação em vez de adição.
   */
  private paraLinhaDeReceita(r: Record<string, unknown>): LinhaDeReceita {
    const ingredientes = ((r.ingredientes as Record<string, unknown>[] | null) ?? [])
      .slice()
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))
      .map((i) => {
        const a = (i.alimento as Record<string, unknown> | null) ?? {};
        return {
          id: i.id as string,
          alimentoId: i.alimentoId as string,
          nome: (a.nome as string | undefined) ?? 'Item removido',
          quantidadeG: n(i.quantidadeG) ?? 0,
          observacao: (i.observacao as string | null) ?? null,
          porcao100g: {
            kcal: n(a.kcal) ?? 0,
            proteinaG: n(a.proteinaG) ?? 0,
            carboidratoG: n(a.carboidratoG) ?? 0,
            gorduraG: n(a.gorduraG) ?? 0,
            fibraG: n(a.fibraG) ?? 0,
          },
        };
      });

    return {
      id: r.id as string,
      nome: r.nome as string,
      descricao: (r.descricao as string | null) ?? null,
      modoPreparo: (r.modoPreparo as string | null) ?? null,
      rendePorcoes: n(r.rendePorcoes) ?? 1,
      nomeDaPorcao: (r.nomeDaPorcao as string | null) ?? null,
      tempoMinutos: r.tempoMinutos === null ? null : Number(r.tempoMinutos),
      ingredientes,
    };
  }

  async listarReceitas(busca?: string): Promise<ReceitaResumo[]> {
    let q = this.db
      .from('Receita')
      .select(MotorSupabase.CAMPOS_RECEITA)
      .is('deletadoEm', null)
      .order('atualizadoEm', { ascending: false })
      .limit(100);
    // O que a pessoa digita vai como VALOR, não como SQL.
    if (busca) q = q.ilike('nome', `%${busca}%`);

    const linhas = this.ou(await q) as unknown as Record<string, unknown>[];
    return linhas.map((r) => montarReceita(this.paraLinhaDeReceita(r)));
  }

  async criarReceita(dados: SalvarReceitaInput): Promise<ReceitaResumo> {
    const criada = this.ou(
      await this.db
        .from('Receita')
        .insert({
          nome: dados.nome.trim(),
          descricao: dados.descricao ?? null,
          modoPreparo: dados.modoPreparo ?? null,
          rendePorcoes: dados.rendePorcoes,
          nomeDaPorcao: dados.nomeDaPorcao ?? null,
          tempoMinutos: dados.tempoMinutos ?? null,
        })
        .select('id')
        .single(),
    ) as unknown as { id: string };

    await this.gravarIngredientes(criada.id, dados);
    return this.obterReceita(criada.id);
  }

  /**
   * Salvar reescreve a lista de ingredientes inteira.
   *
   * Apaga e recria em vez de casar item a item: a tela devolve a lista como
   * ficou, sem dizer o que saiu, o que entrou e o que mudou de lugar. Tentar
   * adivinhar isso aqui daria um algoritmo de casamento que erra em silêncio —
   * e o ingrediente é uma linha barata, sem histórico próprio para preservar.
   *
   * O `ordem` vem do índice do vetor, e é o que a leitura usa para reconstituir
   * a sequência: o PostgREST não garante ordem em relação embutida.
   */
  private async gravarIngredientes(receitaId: string, dados: SalvarReceitaInput): Promise<void> {
    this.ou(await this.db.from('IngredienteReceita').delete().eq('receitaId', receitaId));
    this.ou(
      await this.db.from('IngredienteReceita').insert(
        dados.ingredientes.map((i, ordem) => ({
          receitaId,
          alimentoId: i.alimentoId,
          quantidadeG: i.quantidadeG,
          observacao: i.observacao ?? null,
          ordem,
        })),
      ),
    );
  }

  private async obterReceita(id: string): Promise<ReceitaResumo> {
    const linha = this.ou(
      await this.db
        .from('Receita')
        .select(MotorSupabase.CAMPOS_RECEITA)
        .eq('id', id)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    if (!linha) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Receita não encontrada.', 404);
    return montarReceita(this.paraLinhaDeReceita(linha));
  }

  async atualizarReceita(id: string, dados: SalvarReceitaInput): Promise<ReceitaResumo> {
    const linhas = this.ou(
      await this.db
        .from('Receita')
        .update({
          nome: dados.nome.trim(),
          descricao: dados.descricao ?? null,
          modoPreparo: dados.modoPreparo ?? null,
          rendePorcoes: dados.rendePorcoes,
          nomeDaPorcao: dados.nomeDaPorcao ?? null,
          tempoMinutos: dados.tempoMinutos ?? null,
        })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Receita não encontrada.', 404);
    }

    await this.gravarIngredientes(id, dados);
    return this.obterReceita(id);
  }

  /** Carimbo: refeições salvas e planos alimentares apontam para ela. */
  async removerReceita(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('Receita')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Receita não encontrada.', 404);
    }
  }

  private static readonly CAMPOS_REFEICAO_SALVA =
    'id,nome,horarioSugerido,observacao,' +
    'itens:ItemRefeicaoSalva(id,ordem,alimentoId,receitaId,quantidadeG,porcoes,observacao,' +
    `alimento:Alimento(${MotorSupabase.CAMPOS_ALIMENTO}),` +
    `receita:Receita(${MotorSupabase.CAMPOS_RECEITA}))`;

  private paraLinhaDeRefeicao(r: Record<string, unknown>): LinhaDeRefeicaoSalva {
    const itens = ((r.itens as Record<string, unknown>[] | null) ?? [])
      .slice()
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))
      .map((i) => {
        const a = i.alimento as Record<string, unknown> | null;
        const rc = i.receita as Record<string, unknown> | null;
        return {
          id: i.id as string,
          alimentoId: (i.alimentoId as string | null) ?? null,
          receitaId: (i.receitaId as string | null) ?? null,
          quantidadeG: n(i.quantidadeG),
          porcoes: n(i.porcoes),
          observacao: (i.observacao as string | null) ?? null,
          alimento: a
            ? {
                nome: a.nome as string,
                porcao100g: {
                  kcal: n(a.kcal) ?? 0,
                  proteinaG: n(a.proteinaG) ?? 0,
                  carboidratoG: n(a.carboidratoG) ?? 0,
                  gorduraG: n(a.gorduraG) ?? 0,
                  fibraG: n(a.fibraG) ?? 0,
                },
              }
            : null,
          receita: rc ? this.paraLinhaDeReceita(rc) : null,
        };
      });

    return {
      id: r.id as string,
      nome: r.nome as string,
      horarioSugerido: (r.horarioSugerido as string | null) ?? null,
      observacao: (r.observacao as string | null) ?? null,
      itens,
    };
  }

  async listarRefeicoesSalvas(): Promise<RefeicaoSalvaResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('RefeicaoSalva')
        .select(MotorSupabase.CAMPOS_REFEICAO_SALVA)
        .is('deletadoEm', null)
        .order('horarioSugerido', { ascending: true })
        .order('atualizadoEm', { ascending: false })
        .limit(100),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((r) => montarRefeicaoSalva(this.paraLinhaDeRefeicao(r)));
  }

  async criarRefeicaoSalva(dados: SalvarRefeicaoInput): Promise<RefeicaoSalvaResumo> {
    const criada = this.ou(
      await this.db
        .from('RefeicaoSalva')
        .insert({
          nome: dados.nome.trim(),
          horarioSugerido: dados.horarioSugerido ?? null,
          observacao: dados.observacao ?? null,
        })
        .select('id')
        .single(),
    ) as unknown as { id: string };

    await this.gravarItensDaRefeicao(criada.id, dados);
    return this.obterRefeicaoSalva(criada.id);
  }

  /**
   * A receita citada tem de ser do próprio autor — e quem confere é a política.
   *
   * A API conferia aqui, antes de gravar. Sem a conferência no banco, um
   * cliente adulterado poria a receita de outro profissional dentro de uma
   * refeição própria e leria a composição inteira pela consulta que traz os
   * itens embutidos.
   */
  private async gravarItensDaRefeicao(
    refeicaoId: string,
    dados: SalvarRefeicaoInput,
  ): Promise<void> {
    this.ou(await this.db.from('ItemRefeicaoSalva').delete().eq('refeicaoId', refeicaoId));
    if (dados.itens.length === 0) return;
    this.ou(
      await this.db.from('ItemRefeicaoSalva').insert(
        dados.itens.map((i, ordem) => ({
          refeicaoId,
          alimentoId: i.alimentoId ?? null,
          receitaId: i.receitaId ?? null,
          quantidadeG: i.quantidadeG ?? null,
          porcoes: i.porcoes ?? null,
          observacao: i.observacao ?? null,
          ordem,
        })),
      ),
    );
  }

  private async obterRefeicaoSalva(id: string): Promise<RefeicaoSalvaResumo> {
    const linha = this.ou(
      await this.db
        .from('RefeicaoSalva')
        .select(MotorSupabase.CAMPOS_REFEICAO_SALVA)
        .eq('id', id)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    if (!linha) throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Refeição não encontrada.', 404);
    return montarRefeicaoSalva(this.paraLinhaDeRefeicao(linha));
  }

  async atualizarRefeicaoSalva(
    id: string,
    dados: SalvarRefeicaoInput,
  ): Promise<RefeicaoSalvaResumo> {
    const linhas = this.ou(
      await this.db
        .from('RefeicaoSalva')
        .update({
          nome: dados.nome.trim(),
          horarioSugerido: dados.horarioSugerido ?? null,
          observacao: dados.observacao ?? null,
        })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Refeição não encontrada.', 404);
    }

    await this.gravarItensDaRefeicao(id, dados);
    return this.obterRefeicaoSalva(id);
  }

  async removerRefeicaoSalva(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('RefeicaoSalva')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Refeição não encontrada.', 404);
    }
  }

  // --- modelos de anamnese --------------------------------------------------

  private static readonly CAMPOS_MODELO_ANAMNESE =
    'id,nome,descricao,atualizadoEm,' +
    'perguntas:PerguntaAnamnese(id,texto,tipo,opcoes,obrigatoria,ajuda,ordem)';

  private paraModeloAnamnese(m: Record<string, unknown>): ModeloAnamneseResumo {
    // O PostgREST não garante ordem em relação embutida, e um questionário fora
    // de ordem é um formulário que pergunta o fim antes do começo.
    const perguntas = ((m.perguntas as Record<string, unknown>[] | null) ?? [])
      .slice()
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))
      .map((p) => ({
        id: p.id as string,
        texto: p.texto as string,
        tipo: p.tipo as PerguntaResumo['tipo'],
        opcoes: (p.opcoes as string[] | null) ?? [],
        obrigatoria: Boolean(p.obrigatoria),
        ajuda: (p.ajuda as string | null) ?? null,
        ordem: Number(p.ordem),
      }));

    return {
      id: m.id as string,
      nome: m.nome as string,
      descricao: (m.descricao as string | null) ?? null,
      totalPerguntas: perguntas.length,
      perguntas,
      atualizadoEm: instante(m.atualizadoEm),
    };
  }

  async listarModelosDeAnamnese(): Promise<ModeloAnamneseResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('ModeloAnamnese')
        .select(MotorSupabase.CAMPOS_MODELO_ANAMNESE)
        .is('deletadoEm', null)
        .order('atualizadoEm', { ascending: false }),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((m) => this.paraModeloAnamnese(m));
  }

  /**
   * Salvar troca as perguntas inteiras.
   *
   * Seguro porque a resposta guarda `perguntaNoMomento` e `tipoNoMomento`: uma
   * anamnese já respondida continua legível mesmo depois de a pergunta sumir
   * daqui. Sem esse congelamento, editar o modelo reescreveria o passado das
   * anamneses aplicadas — e é sobre isso que o profissional decide conduta.
   */
  private async gravarPerguntas(
    modeloId: string,
    dados: SalvarModeloAnamneseInput,
  ): Promise<void> {
    this.ou(await this.db.from('PerguntaAnamnese').delete().eq('modeloId', modeloId));
    this.ou(
      await this.db.from('PerguntaAnamnese').insert(
        dados.perguntas.map((p, ordem) => ({
          modeloId,
          texto: p.texto.trim(),
          tipo: p.tipo,
          // Opção só existe em pergunta de escolha; guardá-la em outro tipo
          // confunde quem lê o dado depois.
          opcoes: p.tipo === 'ESCOLHA_UNICA' || p.tipo === 'ESCOLHA_MULTIPLA' ? p.opcoes : [],
          obrigatoria: p.obrigatoria,
          ajuda: p.ajuda ?? null,
          ordem,
        })),
      ),
    );
  }

  private async obterModeloDeAnamnese(id: string): Promise<ModeloAnamneseResumo> {
    const linha = this.ou(
      await this.db
        .from('ModeloAnamnese')
        .select(MotorSupabase.CAMPOS_MODELO_ANAMNESE)
        .eq('id', id)
        .is('deletadoEm', null)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    if (!linha) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Modelo de anamnese não encontrado.', 404);
    }
    return this.paraModeloAnamnese(linha);
  }

  async criarModeloDeAnamnese(
    dados: SalvarModeloAnamneseInput,
  ): Promise<ModeloAnamneseResumo> {
    const criado = this.ou(
      await this.db
        .from('ModeloAnamnese')
        .insert({ nome: dados.nome.trim(), descricao: dados.descricao ?? null })
        .select('id')
        .single(),
    ) as unknown as { id: string };

    await this.gravarPerguntas(criado.id, dados);
    return this.obterModeloDeAnamnese(criado.id);
  }

  async atualizarModeloDeAnamnese(
    id: string,
    dados: SalvarModeloAnamneseInput,
  ): Promise<ModeloAnamneseResumo> {
    const linhas = this.ou(
      await this.db
        .from('ModeloAnamnese')
        .update({ nome: dados.nome.trim(), descricao: dados.descricao ?? null })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Modelo de anamnese não encontrado.', 404);
    }

    await this.gravarPerguntas(id, dados);
    return this.obterModeloDeAnamnese(id);
  }

  /** Carimbo: anamneses aplicadas apontam para ele. */
  async removerModeloDeAnamnese(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('ModeloAnamnese')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Modelo de anamnese não encontrado.', 404);
    }
  }

  // --- catálogo de prescritíveis --------------------------------------------

  private static readonly CAMPOS_PRESCRITIVEL =
    'id,nome,tipo,apresentacao,principioAtivo,contraindicacoes,observacao,escopo,criadoPorId';

  private paraPrescritivel(p: Record<string, unknown>): PrescritivelResumo {
    return {
      id: p.id as string,
      nome: p.nome as string,
      tipo: p.tipo as PrescritivelResumo['tipo'],
      apresentacao: (p.apresentacao as string | null) ?? null,
      principioAtivo: (p.principioAtivo as string | null) ?? null,
      contraindicacoes: (p.contraindicacoes as string | null) ?? null,
      observacao: (p.observacao as string | null) ?? null,
      escopo: p.escopo as PrescritivelResumo['escopo'],
      criadoPorId: (p.criadoPorId as string | null) ?? null,
    };
  }

  /**
   * O catálogo GLOBAL mais o que o próprio prescritor cadastrou.
   *
   * O recorte está na política `itemprescritivel_le`, não aqui: repeti-lo na
   * consulta seria a segunda cópia que um dia diverge.
   */
  async listarPrescritiveis(
    consulta: Partial<ListarPrescritiveisQuery> = {},
  ): Promise<PrescritivelResumo[]> {
    let q = this.db
      .from('ItemPrescritivel')
      .select(MotorSupabase.CAMPOS_PRESCRITIVEL)
      .is('deletadoEm', null)
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true })
      .limit(consulta.limit ?? 50);

    if (consulta.tipo) q = q.eq('tipo', consulta.tipo);
    if (consulta.q) q = q.ilike('nome', `%${consulta.q}%`);

    const linhas = this.ou(await q) as unknown as Record<string, unknown>[];
    return linhas.map((p) => this.paraPrescritivel(p));
  }

  /**
   * Cadastra no catálogo.
   *
   * Nem `escopo` nem `criadoPorId` vão no corpo — quem os define é o gatilho.
   * E a competência é do banco também: no Brasil a prescrição de medicamento é
   * privativa do médico, e a tabela que diz isso precisava estar do lado que um
   * `insert` pelo console do navegador não alcança.
   */
  async criarPrescritivel(dados: CriarPrescritivelInput): Promise<PrescritivelResumo> {
    const eu = await this.usuarioAtual();
    if (!eu) throw new ErroApi('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.', 401);
    if (eu.papel !== 'ADMIN' && !podePrescrever(eu.papel, dados.tipo)) {
      throw new ErroApi(
        'PAPEL_NAO_AUTORIZADO',
        `Seu conselho não cobre a prescrição de ${ROTULO_TIPO_PRESCRITIVEL[dados.tipo].toLowerCase()}.`,
        403,
      );
    }

    const linha = this.ou(
      await this.db
        .from('ItemPrescritivel')
        .insert({
          nome: dados.nome.trim(),
          tipo: dados.tipo,
          apresentacao: dados.apresentacao ?? null,
          principioAtivo: dados.principioAtivo ?? null,
          contraindicacoes: dados.contraindicacoes ?? null,
          observacao: dados.observacao ?? null,
        })
        .select(MotorSupabase.CAMPOS_PRESCRITIVEL)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraPrescritivel(linha);
  }

  /** Carimbo: o item aparece em prescrições já emitidas. */
  async removerPrescritivel(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('ItemPrescritivel')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length > 0) return;

    /*
      Zero linhas tem dois motivos, e a frase muda a conduta de quem lê: item do
      catálogo global é do admin, item que não existe (ou é de outro prescritor)
      é 404 — e 404 também para o alheio, de propósito.
    */
    const linha = this.ou(
      await this.db.from('ItemPrescritivel').select('escopo').eq('id', id).maybeSingle(),
    ) as { escopo: string } | null;
    if (linha?.escopo === 'GLOBAL') {
      throw new ErroApi(
        'PAPEL_NAO_AUTORIZADO',
        'Itens do catálogo global só o admin edita.',
        403,
      );
    }
    throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Item não encontrado.', 404);
  }

  // --- modelos de prescrição ------------------------------------------------

  private static readonly CAMPOS_MODELO_PRESCRICAO =
    'id,nome,descricao,orientacoes,' +
    'itens:ItemModeloPrescricao(id,ordem,prescritivelId,dose,unidade,frequencia,horarios,' +
    `duracaoDias,via,observacao,prescritivel:ItemPrescritivel(${MotorSupabase.CAMPOS_PRESCRITIVEL}))`;

  private paraModeloDePrescricao(m: Record<string, unknown>): ModeloPrescricaoResumo {
    const itens = ((m.itens as Record<string, unknown>[] | null) ?? [])
      .slice()
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))
      .map((i) => ({
        id: i.id as string,
        prescritivelId: i.prescritivelId as string,
        /*
          `undefined` e não `null`: o contrato dos itens é o próprio
          `PosologiaInput`, onde campo ausente é opcional. Um `null` aqui
          quebraria a validação na volta, quando a tela reenvia o modelo para
          salvar.
        */
        dose: n(i.dose) ?? undefined,
        unidade: (i.unidade as string | null) ?? undefined,
        frequencia: (i.frequencia as string | null) ?? undefined,
        horarios: (i.horarios as string[] | null) ?? [],
        duracaoDias: i.duracaoDias === null ? undefined : Number(i.duracaoDias),
        via: (i.via as string | null) ?? undefined,
        observacao: (i.observacao as string | null) ?? undefined,
        prescritivel: this.paraPrescritivel(
          (i.prescritivel as Record<string, unknown> | null) ?? {},
        ),
      }));

    return {
      id: m.id as string,
      nome: m.nome as string,
      descricao: (m.descricao as string | null) ?? null,
      orientacoes: (m.orientacoes as string | null) ?? null,
      totalItens: itens.length,
      itens,
    };
  }

  async listarModelosDePrescricao(): Promise<ModeloPrescricaoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('ModeloPrescricao')
        .select(MotorSupabase.CAMPOS_MODELO_PRESCRICAO)
        .is('deletadoEm', null)
        .order('atualizadoEm', { ascending: false }),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((m) => this.paraModeloDePrescricao(m));
  }

  async criarModeloDePrescricao(
    dados: CriarModeloPrescricaoInput,
  ): Promise<ModeloPrescricaoResumo> {
    const criado = this.ou(
      await this.db
        .from('ModeloPrescricao')
        .insert({
          nome: dados.nome.trim(),
          descricao: dados.descricao ?? null,
          orientacoes: dados.orientacoes ?? null,
        })
        .select('id')
        .single(),
    ) as unknown as { id: string };

    /*
      A competência é conferida de novo na política do item: o catálogo global
      tem medicamento, e um modelo é uma prescrição pronta esperando um nome. Um
      item recusado derruba o lote inteiro — melhor que um modelo salvo pela
      metade, que o prescritor emitiria sem reparar na falta.
    */
    this.ou(
      await this.db.from('ItemModeloPrescricao').insert(
        dados.itens.map((i, ordem) => ({
          modeloId: criado.id,
          prescritivelId: i.prescritivelId,
          dose: i.dose ?? null,
          unidade: i.unidade ?? null,
          frequencia: i.frequencia ?? null,
          horarios: i.horarios,
          duracaoDias: i.duracaoDias ?? null,
          via: i.via ?? null,
          observacao: i.observacao ?? null,
          ordem,
        })),
      ),
    );

    const linha = this.ou(
      await this.db
        .from('ModeloPrescricao')
        .select(MotorSupabase.CAMPOS_MODELO_PRESCRICAO)
        .eq('id', criado.id)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraModeloDePrescricao(linha);
  }

  /** Carimbo: modelo removido não pode sumir de uma prescrição já emitida. */
  async removerModeloDePrescricao(id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('ModeloPrescricao')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Modelo de prescrição não encontrado.', 404);
    }
  }

  // --- cardio ---------------------------------------------------------------

  private static readonly CAMPOS_CARDIO =
    'id,tipo,intensidade,duracaoMin,distanciaKm,data,observacao,execucaoId,criadoEm';

  /**
   * O peso mais recente do aluno, ou `null`.
   *
   * Toda a estimativa calórica pende disto, e a ausência não vira um peso
   * médio: um peso chutado erra a conta em 30% para quem foge da média, e é
   * justamente quem foge da média que mais olha esse número.
   *
   * A consulta é a mesma para todo mundo, e o recorte é da política `medida_le`
   * — EVOLUCAO. Quem não tem consentimento não recebe linha nenhuma e a caloria
   * sai nula, que é exatamente o que a API fazia conferindo o consentimento em
   * código. É a mesma regra, num lugar onde o cliente não a contorna.
   */
  private async pesoAtual(alunoId: string): Promise<number | null> {
    const linhas = this.ou(
      await this.db
        .from('Medida')
        .select('pesoKg')
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .not('pesoKg', 'is', null)
        .order('data', { ascending: false })
        .limit(1),
    ) as unknown as { pesoKg: string | number }[];
    return linhas.length > 0 ? n(linhas[0]!.pesoKg) : null;
  }

  private paraCardio(a: Record<string, unknown>, pesoKg: number | null): CardioResumo {
    const tipo = a.tipo as TipoCardio;
    const intensidade = a.intensidade as Intensidade;
    const duracaoMin = Number(a.duracaoMin);
    return {
      id: a.id as string,
      tipo,
      intensidade,
      duracaoMin,
      distanciaKm: n(a.distanciaKm),
      data: String(a.data).slice(0, 10),
      observacao: (a.observacao as string | null) ?? null,
      /*
        A caloria só existe para quem alcança o peso. Não é preciosismo:
        `kcal = MET × 3,5 × peso / 200 × min` se inverte com uma divisão, e o
        tipo, a intensidade e a duração estão na mesma resposta. Entregá-la a
        quem só autorizou treino seria entregar o peso por caminho indireto — o
        aluno teria autorizado uma coisa e revelado outra.
      */
      caloriasEstimadas: estimarCalorias(metDe(tipo, intensidade), duracaoMin, pesoKg),
      execucaoId: (a.execucaoId as string | null) ?? null,
      criadoEm: instante(a.criadoEm),
    };
  }

  async listarCardio(alunoId: string, dias: number): Promise<CardioResumo[]> {
    const de = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    /*
      As duas consultas saem juntas, e não uma depois da outra: o `await` dentro
      do vetor resolveria a primeira antes de a segunda começar, e `Promise.all`
      só enfileiraria o que já estava pronto. São duas idas à rede que valem uma.
    */
    const [resposta, peso] = await Promise.all([
      this.db
        .from('AtividadeCardio')
        .select(MotorSupabase.CAMPOS_CARDIO)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .gte('data', de)
        .order('data', { ascending: false }),
      this.pesoAtual(alunoId),
    ]);
    const linhas = this.ou(resposta) as unknown as Record<string, unknown>[];
    return linhas.map((a) => this.paraCardio(a, peso));
  }

  async registrarCardio(alunoId: string, dados: RegistrarCardioInput): Promise<CardioResumo> {
    const linha = this.ou(
      await this.db
        .from('AtividadeCardio')
        .insert({
          alunoId,
          execucaoId: dados.execucaoId ?? null,
          tipo: dados.tipo,
          intensidade: dados.intensidade,
          duracaoMin: dados.duracaoMin,
          distanciaKm: dados.distanciaKm ?? null,
          // `date` no banco: a atividade é do DIA, e o fuso de quem registra não
          // pode fazer o mesmo treino cair em dois dias diferentes.
          data: dados.data,
          observacao: dados.observacao ?? null,
        })
        .select(MotorSupabase.CAMPOS_CARDIO)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraCardio(linha, await this.pesoAtual(alunoId));
  }

  /** Carimbo: a atividade entra no gasto do período, e o período passado não muda. */
  async removerCardio(alunoId: string, id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('AtividadeCardio')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Atividade não encontrada.', 404);
    }
  }

  /**
   * O que a taxa metabólica precisa, cada peça de onde ela já mora.
   *
   * A massa magra vem da medida mais recente QUE A TENHA — e não da mais
   * recente de todas. Quem se pesou ontem e fez bioimpedância mês passado ainda
   * tem composição medida; ignorá-la jogaria a conta de volta para a fórmula
   * que depende de sexo, a menos precisa das duas.
   */
  private async dadosParaTmb(alunoId: string): Promise<DadosParaTmb> {
    const [comPeso, respostaMagra, respostaPerfil, respostaCalorimetria] = await Promise.all([
      this.pesoAtual(alunoId),
      this.db
        .from('Medida')
        .select('massaMagraKg')
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .not('massaMagraKg', 'is', null)
        .order('data', { ascending: false })
        .limit(1),
      this.db
        .from('PerfilAluno')
        .select('alturaCm,dataNascimento,sexoBiologico')
        .eq('userId', alunoId)
        .maybeSingle(),
      /*
        A calorimetria mais recente. Quem tiver duas, a nova manda — e se ela já
        não valer, `taxaMetabolicaBasal` cai sozinha para a fórmula e diz o
        motivo. Buscar a "mais recente que ainda vale" aqui esconderia da tela a
        informação de que houve uma e ela expirou.
      */
      this.db
        .from('CalorimetriaIndireta')
        .select('tmbMedidaKcal,data,pesoNoExameKg')
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .order('data', { ascending: false })
        .limit(1),
    ]);

    const comMassaMagra = this.ou(respostaMagra) as unknown as {
      massaMagraKg: string | number;
    }[];
    const perfil = this.ou(respostaPerfil) as {
      alturaCm: number | null;
      dataNascimento: string | null;
      sexoBiologico: string | null;
    } | null;
    const calorimetria = this.ou(respostaCalorimetria) as unknown as {
      tmbMedidaKcal: number;
      data: string;
      pesoNoExameKg: string | null;
    }[];

    const c = calorimetria[0];
    return {
      pesoKg: comPeso,
      alturaCm: perfil?.alturaCm ?? null,
      // A coluna é `date` e chega como texto; `idadeEmAnos` espera a data.
      idade: idadeEmAnos(perfil?.dataNascimento ? new Date(perfil.dataNascimento) : null),
      sexo: (perfil?.sexoBiologico as SexoBiologico | null) ?? null,
      massaMagraKg: comMassaMagra.length > 0 ? n(comMassaMagra[0]!.massaMagraKg) : null,
      calorimetria: c
        ? {
            tmbMedidaKcal: Number(c.tmbMedidaKcal),
            data: String(c.data).slice(0, 10),
            pesoNoExameKg: n(c.pesoNoExameKg),
          }
        : null,
    };
  }

  /**
   * Gasto calórico do período, separado entre musculação e cardio.
   *
   * Separado porque responde a perguntas diferentes: o cardio diz se o aluno
   * cumpriu o que foi combinado fora da sala, a musculação diz se o treino tem o
   * volume prescrito. Somados, nenhuma das duas dá para responder.
   */
  async resumoDeCalorias(alunoId: string, dias: number): Promise<ResumoDeCalorias> {
    const de = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const [dadosDoCorpo, respostaExecucoes, respostaCardios] = await Promise.all([
      this.dadosParaTmb(alunoId),
      this.db
        .from('ExecucaoTreino')
        .select('duracaoSeg,feedback:FeedbackTreino(dificuldade)')
        .eq('alunoId', alunoId)
        .gte('iniciadoEm', de.toISOString()),
      this.db
        .from('AtividadeCardio')
        .select('tipo,intensidade,duracaoMin')
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .gte('data', de.toISOString().slice(0, 10)),
    ]);

    const execucoes = this.ou(respostaExecucoes) as unknown as {
      duracaoSeg: number | null;
      feedback: unknown;
    }[];
    const cardios = this.ou(respostaCardios) as unknown as {
      tipo: string;
      intensidade: string;
      duracaoMin: number;
    }[];

    const peso = dadosDoCorpo.pesoKg;

    /*
      A dificuldade relatada vira a intensidade da musculação: quem terminou
      dizendo "muito difícil" gastou mais que quem achou leve, e é a única
      leitura de esforço que temos. Sem feedback, assume moderada — o meio da
      escala erra menos que qualquer extremo.
    */
    const intensidadeDoTreino = (dificuldade?: number): number => {
      if (dificuldade === undefined) return MET_MUSCULACAO.MODERADA;
      if (dificuldade <= 2) return MET_MUSCULACAO.LEVE;
      if (dificuldade >= 4) return MET_MUSCULACAO.INTENSA;
      return MET_MUSCULACAO.MODERADA;
    };

    let minutosMusculacao = 0;
    let kcalMusculacao = 0;
    let temAlgumaKcalDeMusculacao = false;

    for (const e of execucoes) {
      const minutos = Math.round((e.duracaoSeg ?? 0) / 60);
      if (minutos <= 0) continue;
      minutosMusculacao += minutos;
      const fb = umSo(e.feedback) as { dificuldade?: number } | null;
      const kcal = estimarCalorias(intensidadeDoTreino(fb?.dificuldade), minutos, peso);
      if (kcal !== null) {
        kcalMusculacao += kcal;
        temAlgumaKcalDeMusculacao = true;
      }
    }

    let minutosCardio = 0;
    let kcalCardio = 0;
    let temAlgumaKcalDeCardio = false;

    for (const c of cardios) {
      minutosCardio += Number(c.duracaoMin);
      const kcal = estimarCalorias(
        metDe(c.tipo as TipoCardio, c.intensidade as Intensidade),
        Number(c.duracaoMin),
        peso,
      );
      if (kcal !== null) {
        kcalCardio += kcal;
        temAlgumaKcalDeCardio = true;
      }
    }

    /*
      Duas ausências diferentes, e por muito tempo elas foram a mesma aqui.

      Não houve sessão nenhuma na janela: a resposta é ZERO. "Você não queimou
      nada esta semana" é um fato, e é o que o contador precisa dizer para
      servir de cobrança. `null` faz a tela mostrar um travessão, que se lê como
      "não carregou" — e quem passou a semana parado via o app quebrado em vez
      da própria semana parada.

      Houve sessão mas não deu para estimar (falta o peso): aí sim é `null`.
      Somar como zero afirmaria que ela treinou de graça.
    */
    const kcalOuZero = (sessoes: number, temAlguma: boolean, soma: number): number | null => {
      if (sessoes === 0) return 0;
      return temAlguma ? soma : null;
    };

    const musculacao = {
      sessoes: execucoes.length,
      minutos: minutosMusculacao,
      kcal: kcalOuZero(execucoes.length, temAlgumaKcalDeMusculacao, kcalMusculacao),
    };
    const cardio = {
      sessoes: cardios.length,
      minutos: minutosCardio,
      kcal: kcalOuZero(cardios.length, temAlgumaKcalDeCardio, kcalCardio),
    };

    /*
      Basta UMA parte desconhecida para o total ser desconhecido: somar o que se
      sabe com o que não se sabe e chamar de total dá um número menor que o real,
      com cara de exato.
    */
    const totalKcal =
      musculacao.kcal === null || cardio.kcal === null ? null : musculacao.kcal + cardio.kcal;

    return {
      dias,
      pesoUsadoKg: peso,
      musculacao,
      cardio,
      totalKcal,
      gastoDiario: gastoDiario(dadosDoCorpo, totalKcal, dias),
    };
  }

  // --- calorimetria indireta ------------------------------------------------

  private static readonly CAMPOS_CALORIMETRIA =
    'id,data,tmbMedidaKcal,pesoNoExameKg,equipamento,observacao,criadoEm,' +
    'registradoPor:User!CalorimetriaIndireta_registradoPorId_fkey(id,nome)';

  private paraCalorimetria(
    e: Record<string, unknown>,
    pesoAtual: number | null,
  ): CalorimetriaResumo {
    const pesoNoExameKg = n(e.pesoNoExameKg);
    const data = String(e.data).slice(0, 10);
    return {
      id: e.id as string,
      data,
      tmbMedidaKcal: Number(e.tmbMedidaKcal),
      pesoNoExameKg,
      equipamento: (e.equipamento as string | null) ?? null,
      observacao: (e.observacao as string | null) ?? null,
      registradoPor: umSo(e.registradoPor) as unknown as CalorimetriaResumo['registradoPor'],
      /*
        A validade é calculada NA LEITURA, e não gravada: ela depende do peso de
        hoje. Quem perdeu quinze quilos em quatro meses tem uma medição mais
        velha, na prática, do que quem manteve o peso por um ano — e um campo
        gravado envelheceria sem ninguém tocar nele.
      */
      validade: validadeDaCalorimetria(
        { tmbMedidaKcal: Number(e.tmbMedidaKcal), data, pesoNoExameKg },
        pesoAtual,
      ),
      criadoEm: instante(e.criadoEm),
    };
  }

  async listarCalorimetrias(alunoId: string): Promise<CalorimetriaResumo[]> {
    const [resposta, peso] = await Promise.all([
      this.db
        .from('CalorimetriaIndireta')
        .select(MotorSupabase.CAMPOS_CALORIMETRIA)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .order('data', { ascending: false }),
      this.pesoAtual(alunoId),
    ]);
    const linhas = this.ou(resposta) as unknown as Record<string, unknown>[];
    return linhas.map((e) => this.paraCalorimetria(e, peso));
  }

  /**
   * Lançam o aluno, com o laudo na mão, e o profissional que pediu o exame.
   *
   * Diferente do check-in e do cardio, que são autorrelato e só o aluno
   * escreve: aqui o dado é de um laboratório, não da percepção de ninguém, e
   * quem digitou fica gravado — é o gatilho que carimba.
   */
  async registrarCalorimetria(
    alunoId: string,
    dados: RegistrarCalorimetriaInput,
  ): Promise<CalorimetriaResumo> {
    const linha = this.ou(
      await this.db
        .from('CalorimetriaIndireta')
        .insert({
          alunoId,
          data: dados.data,
          tmbMedidaKcal: dados.tmbMedidaKcal,
          pesoNoExameKg: dados.pesoNoExameKg ?? null,
          equipamento: dados.equipamento ?? null,
          observacao: dados.observacao ?? null,
        })
        .select(MotorSupabase.CAMPOS_CALORIMETRIA)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraCalorimetria(linha, await this.pesoAtual(alunoId));
  }

  async removerCalorimetria(alunoId: string, id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('CalorimetriaIndireta')
        .update({ deletadoEm: new Date().toISOString() })
        .eq('id', id)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Calorimetria não encontrada.', 404);
    }
  }

  // --- avaliação física -----------------------------------------------------

  private static readonly CAMPOS_AVALIACAO =
    'id,data,metodo,protocolo,pesoKg,alturaCm,dobras,bioimpedancia,percentualGordura,' +
    'massaGordaKg,massaMagraKg,densidadeCorporal,somaDobrasMm,imc,observacao,' +
    'avaliador:User!AvaliacaoFisica_avaliadorId_fkey(id,nome)';

  private paraAvaliacao(
    a: Record<string, unknown>,
    anterior?: Record<string, unknown>,
  ): AvaliacaoResumo {
    const percentual = n(a.percentualGordura) ?? 0;
    const magra = n(a.massaMagraKg) ?? 0;
    const peso = n(a.pesoKg) ?? 0;
    const arredondar = (v: number, casas: number): number =>
      Math.round(v * 10 ** casas) / 10 ** casas;

    return {
      id: a.id as string,
      data: String(a.data).slice(0, 10),
      metodo: a.metodo as AvaliacaoResumo['metodo'],
      protocolo: (a.protocolo as AvaliacaoResumo['protocolo']) ?? null,
      pesoKg: peso,
      alturaCm: a.alturaCm === null ? null : Number(a.alturaCm),
      resultado: {
        percentualGordura: percentual,
        massaGordaKg: n(a.massaGordaKg) ?? 0,
        massaMagraKg: magra,
        densidadeCorporal: n(a.densidadeCorporal) ?? undefined,
        somaDobrasMm: n(a.somaDobrasMm) ?? undefined,
        imc: n(a.imc) ?? undefined,
      },
      dobras: (a.dobras as AvaliacaoResumo['dobras']) ?? null,
      bioimpedancia: (a.bioimpedancia as Record<string, number> | null) ?? null,
      observacao: (a.observacao as string | null) ?? null,
      avaliador: umSo(a.avaliador) as unknown as AvaliacaoResumo['avaliador'],
      variacao: anterior
        ? {
            percentualGordura: arredondar(percentual - (n(anterior.percentualGordura) ?? 0), 1),
            massaMagraKg: arredondar(magra - (n(anterior.massaMagraKg) ?? 0), 2),
            pesoKg: arredondar(peso - (n(anterior.pesoKg) ?? 0), 2),
          }
        : null,
    };
  }

  async listarAvaliacoes(alunoId: string): Promise<AvaliacaoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('AvaliacaoFisica')
        .select(MotorSupabase.CAMPOS_AVALIACAO)
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .order('data', { ascending: false })
        .limit(60),
    ) as unknown as Record<string, unknown>[];

    // A variação é sempre contra a avaliação imediatamente anterior — é a
    // comparação que o profissional faz na consulta.
    return linhas.map((a, i) => this.paraAvaliacao(a, linhas[i + 1]));
  }

  /**
   * Registra a avaliação E atualiza a `Medida` do dia.
   *
   * É a segunda parte que faz a avaliação valer: os gráficos de composição
   * corporal leem de `Medida`, então uma adipometria feita hoje aparece na curva
   * do aluno sem ninguém digitar nada de novo.
   *
   * A conta em si mora em `@vivio/contracts` — as equações porque a tela as
   * executa enquanto o profissional digita, e a CONFERÊNCIA (protocolo
   * completo, resultado plausível) porque duas cópias dela aceitariam coisas
   * diferentes, e o número entraria no histórico com cara de medido.
   */
  async registrarAvaliacao(
    alunoId: string,
    dados: RegistrarAvaliacaoInput,
  ): Promise<AvaliacaoResumo> {
    let resultado: ResultadoComposicao;
    try {
      resultado =
        dados.metodo === 'ADIPOMETRIA'
          ? calcularPorDobras({
              protocolo: dados.protocolo,
              sexo: dados.sexo,
              idade: dados.idade,
              pesoKg: dados.pesoKg,
              alturaCm: dados.alturaCm,
              dobras: dados.dobras as Partial<Record<Dobra, number>>,
            })
          : calcularPorBioimpedancia({
              pesoKg: dados.pesoKg,
              alturaCm: dados.alturaCm,
              percentualGordura: dados.percentualGordura,
              massaMagraKg: dados.massaMagraKg,
            });
    } catch (erro) {
      // Erro de cálculo é problema do que foi digitado, não falha do servidor:
      // a frase diz o que conferir, e a tela a mostra tal como veio.
      if (erro instanceof ErroDeCalculo) throw new ErroApi('CONFLITO', erro.message, 409);
      throw erro;
    }

    const dia = dados.data.toISOString().slice(0, 10);
    const ehAdipometria = dados.metodo === 'ADIPOMETRIA';

    const criada = this.ou(
      await this.db
        .from('AvaliacaoFisica')
        .insert({
          alunoId,
          data: dia,
          metodo: dados.metodo,
          protocolo: ehAdipometria ? dados.protocolo : null,
          sexo: ehAdipometria ? dados.sexo : null,
          idade: ehAdipometria ? dados.idade : null,
          pesoKg: dados.pesoKg,
          alturaCm: dados.alturaCm ?? null,
          dobras: ehAdipometria ? dados.dobras : null,
          bioimpedancia: ehAdipometria
            ? null
            : {
                aguaCorporalPercentual: dados.aguaCorporalPercentual,
                massaOsseaKg: dados.massaOsseaKg,
                taxaMetabolicaBasal: dados.taxaMetabolicaBasal,
                gorduraVisceral: dados.gorduraVisceral,
              },
          percentualGordura: resultado.percentualGordura,
          massaGordaKg: resultado.massaGordaKg,
          massaMagraKg: resultado.massaMagraKg,
          densidadeCorporal: resultado.densidadeCorporal ?? null,
          somaDobrasMm: resultado.somaDobrasMm ?? null,
          imc: resultado.imc ?? null,
          observacao: dados.observacao ?? null,
        })
        .select(MotorSupabase.CAMPOS_AVALIACAO)
        .single(),
    ) as unknown as Record<string, unknown>;

    /*
      A medida do dia vem junto, por `upsert`: duas avaliações no mesmo dia
      corrigem a mesma linha em vez de criarem duas, e uma medida apagada antes
      volta a valer (`deletadoEm: null`) — foi a avaliação que a repôs.
    */
    this.ou(
      await this.db.from('Medida').upsert(
        {
          /*
            O mesmo id determinístico de `registrarMedida`: a chave única é
            (aluno, data), e um id sorteado aqui faria a correção pela avaliação
            trocar a chave primária de uma linha que já existia. Duas convenções
            de id na mesma tabela é o tipo de coisa que só machuca depois.
          */
          id: `${alunoId}-${dia}`,
          alunoId,
          data: dia,
          // Quem mediu assina a medida também: a coluna é NOT NULL, e o gatilho
          // de `Medida` a congela depois — a autoria da linha é de quem a criou.
          registradoPorId: await this.meuId(),
          pesoKg: dados.pesoKg,
          percentualGordura: resultado.percentualGordura,
          massaMagraKg: resultado.massaMagraKg,
          fonte: ehAdipometria ? 'MANUAL' : 'BIOIMPEDANCIA',
          deletadoEm: null,
        },
        { onConflict: 'alunoId,data' },
      ),
    );

    /*
      A anterior é buscada DEPOIS de gravar, e por data estritamente menor: a
      variação que a tela mostra é contra a avaliação que veio antes desta, não
      contra ela mesma.
    */
    const anteriores = this.ou(
      await this.db
        .from('AvaliacaoFisica')
        .select('percentualGordura,massaMagraKg,pesoKg')
        .eq('alunoId', alunoId)
        .is('deletadoEm', null)
        .lt('data', dia)
        .order('data', { ascending: false })
        .limit(1),
    ) as unknown as Record<string, unknown>[];

    return this.paraAvaliacao(criada, anteriores[0]);
  }

  // --- prescrição emitida ---------------------------------------------------

  private static readonly CAMPOS_PRESCRICAO =
    'id,data,validaAte,orientacoes,versao,status,motivoEncerramento,' +
    'prescritor:User!Prescricao_prescritorId_fkey(id,nome,papel),' +
    'itens:ItemPrescricao(id,ordem,prescritivelId,nomeNoMomento,dose,unidade,frequencia,' +
    'horarios,duracaoDias,via,observacao,prescritivel:ItemPrescritivel(tipo,apresentacao))';

  private paraPrescricao(p: Record<string, unknown>): PrescricaoResumo {
    const itens = ((p.itens as Record<string, unknown>[] | null) ?? [])
      .slice()
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))
      .map((i) => {
        const cat = (umSo(i.prescritivel) ?? {}) as Record<string, unknown>;
        return {
          id: i.id as string,
          prescritivelId: i.prescritivelId as string,
          // O nome congelado na emissão, e não o do catálogo de hoje: é o que a
          // pessoa leu na receita.
          nome: i.nomeNoMomento as string,
          tipo: cat.tipo as ItemPrescricaoResumo['tipo'],
          dose: n(i.dose),
          unidade: (i.unidade as string | null) ?? null,
          frequencia: (i.frequencia as string | null) ?? null,
          horarios: (i.horarios as string[] | null) ?? [],
          duracaoDias: i.duracaoDias === null ? null : Number(i.duracaoDias),
          via: (i.via as string | null) ?? null,
          observacao: (i.observacao as string | null) ?? null,
          apresentacao: (cat.apresentacao as string | null) ?? null,
        };
      });

    return {
      id: p.id as string,
      // Colunas `date`: o PostgREST as devolve como `AAAA-MM-DD`, e o corte é
      // defensivo. Passar por `new Date()` traria o fuso de volta, e com ele o
      // dia errado — uma receita emitida às 22h mudaria de data na tela.
      data: (p.data as string).slice(0, 10),
      validaAte: (p.validaAte as string | null)?.slice(0, 10) ?? null,
      orientacoes: (p.orientacoes as string | null) ?? null,
      versao: Number(p.versao),
      status: p.status as PrescricaoResumo['status'],
      motivoEncerramento: (p.motivoEncerramento as string | null) ?? null,
      itens,
      prescritor: umSo(p.prescritor) as unknown as PrescricaoResumo['prescritor'],
    };
  }

  async listarPrescricoes(alunoId: string): Promise<PrescricaoResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('Prescricao')
        .select(MotorSupabase.CAMPOS_PRESCRICAO)
        .eq('alunoId', alunoId)
        .order('data', { ascending: false })
        .order('versao', { ascending: false })
        .limit(60),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((p) => this.paraPrescricao(p));
  }

  private async obterPrescricao(id: string): Promise<PrescricaoResumo> {
    const linha = this.ou(
      await this.db
        .from('Prescricao')
        .select(MotorSupabase.CAMPOS_PRESCRICAO)
        .eq('id', id)
        .single(),
    ) as unknown as Record<string, unknown>;
    return this.paraPrescricao(linha);
  }

  /** A posologia como a função do banco a espera. */
  private static itensDaPrescricao(itens: PosologiaInput[]): Record<string, unknown>[] {
    return itens.map((i) => ({
      prescritivelId: i.prescritivelId,
      dose: i.dose ?? null,
      unidade: i.unidade ?? null,
      frequencia: i.frequencia ?? null,
      horarios: i.horarios,
      duracaoDias: i.duracaoDias ?? null,
      via: i.via ?? null,
      observacao: i.observacao ?? null,
    }));
  }

  /**
   * Emite a prescrição.
   *
   * Passa por uma função do banco porque são dois passos — a linha e os itens —
   * e uma prescrição gravada sem item nenhum é pior do que nenhuma prescrição:
   * aparece na tela do paciente como receita vazia. Dentro da função, ou tudo
   * entra ou nada entra.
   *
   * É lá que o nome de cada item é congelado, lido do catálogo: renomear o item
   * depois não altera o que foi prescrito. E é lá que a competência
   * profissional é conferida pela terceira vez — aqui é a receita que vai para a
   * mão da pessoa.
   */
  async emitirPrescricao(
    alunoId: string,
    dados: EmitirPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    const id = await this.rpc<string>('emitir_prescricao', {
      p_aluno_id: alunoId,
      p_data: dados.data.toISOString().slice(0, 10),
      p_valida_ate: dados.validaAte ? dados.validaAte.toISOString().slice(0, 10) : null,
      p_orientacoes: dados.orientacoes ?? null,
      p_itens: MotorSupabase.itensDaPrescricao(dados.itens),
    });
    return this.obterPrescricao(id);
  }

  /**
   * Mudar a conduta cria uma versão nova e marca a anterior como substituída.
   *
   * Prescrição é registro clínico: editar no lugar apagaria o que estava valendo
   * quando o paciente tomou o que tomou. As duas metades acontecem juntas dentro
   * da função — a anterior marcada sem a sucessora seria um paciente sem
   * prescrição válida, do nada.
   */
  async substituirPrescricao(
    prescricaoId: string,
    dados: EmitirPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    const id = await this.rpc<string>('substituir_prescricao', {
      p_prescricao_id: prescricaoId,
      p_data: dados.data.toISOString().slice(0, 10),
      p_valida_ate: dados.validaAte ? dados.validaAte.toISOString().slice(0, 10) : null,
      p_orientacoes: dados.orientacoes ?? null,
      p_itens: MotorSupabase.itensDaPrescricao(dados.itens),
    });
    return this.obterPrescricao(id);
  }

  async mudarStatusDaPrescricao(
    prescricaoId: string,
    dados: MudarStatusPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    await this.rpc<void>('mudar_status_da_prescricao', {
      p_prescricao_id: prescricaoId,
      p_status: dados.status,
      p_motivo: dados.motivo ?? null,
    });
    return this.obterPrescricao(prescricaoId);
  }

  // --- anamnese aplicada ----------------------------------------------------

  private static readonly CAMPOS_ANAMNESE =
    'id,nomeNoMomento,observacao,respondidaEm,' +
    'profissional:User!Anamnese_profissionalId_fkey(id,nome),' +
    'respostas:RespostaAnamnese(id,ordem,perguntaNoMomento,tipoNoMomento,valor,valores)';

  private paraAnamnese(a: Record<string, unknown>): AnamneseResumo {
    const respostas = ((a.respostas as Record<string, unknown>[] | null) ?? [])
      .slice()
      .sort((x, y) => Number(x.ordem) - Number(y.ordem))
      .map((r) => ({
        id: r.id as string,
        // Pergunta e tipo congelados: editar o modelo não reescreve o que a
        // pessoa respondeu, nem muda como a resposta deve ser lida.
        pergunta: r.perguntaNoMomento as string,
        tipo: r.tipoNoMomento as RespostaResumo['tipo'],
        valor: (r.valor as string | null) ?? null,
        valores: (r.valores as string[] | null) ?? [],
        ordem: Number(r.ordem),
      }));

    return {
      id: a.id as string,
      nome: a.nomeNoMomento as string,
      observacao: (a.observacao as string | null) ?? null,
      respondidaEm: instante(a.respondidaEm),
      profissional: umSo(a.profissional) as unknown as AnamneseResumo['profissional'],
      respostas,
    };
  }

  async listarAnamneses(alunoId: string): Promise<AnamneseResumo[]> {
    const linhas = this.ou(
      await this.db
        .from('Anamnese')
        .select(MotorSupabase.CAMPOS_ANAMNESE)
        .eq('alunoId', alunoId)
        .order('respondidaEm', { ascending: false })
        .limit(50),
    ) as unknown as Record<string, unknown>[];
    return linhas.map((a) => this.paraAnamnese(a));
  }

  /**
   * Aplica o questionário ao aluno.
   *
   * Função do banco pelo mesmo motivo da prescrição — a anamnese e suas
   * respostas são um registro só —, e por mais um: é lá que as perguntas
   * obrigatórias são conferidas, e a frase diz QUAIS faltam. Sem isso, a pessoa
   * corrigiria uma, salvaria, e descobriria a próxima.
   */
  async aplicarAnamnese(alunoId: string, dados: AplicarAnamneseInput): Promise<AnamneseResumo> {
    const id = await this.rpc<string>('aplicar_anamnese', {
      p_aluno_id: alunoId,
      p_modelo_id: dados.modeloId,
      p_respondida_em: paraIso(dados.respondidaEm),
      p_observacao: dados.observacao ?? null,
      p_respostas: dados.respostas.map((r) => ({
        perguntaId: r.perguntaId,
        valor: r.valor ?? null,
        valores: r.valores,
      })),
    });

    const linha = this.ou(
      await this.db.from('Anamnese').select(MotorSupabase.CAMPOS_ANAMNESE).eq('id', id).single(),
    ) as unknown as Record<string, unknown>;
    return this.paraAnamnese(linha);
  }

  /**
   * Apaga de verdade, e só quem aplicou.
   *
   * Diferente da prescrição: um questionário respondido por engano — modelo
   * errado, aluno errado — é ruído no prontuário, não histórico. As respostas
   * vão junto por cascata, porque fora da anamnese elas não querem dizer nada.
   */
  async removerAnamnese(alunoId: string, id: string): Promise<void> {
    const linhas = this.ou(
      await this.db
        .from('Anamnese')
        .delete()
        .eq('id', id)
        .eq('alunoId', alunoId)
        .select('id'),
    ) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ErroApi('RECURSO_NAO_ENCONTRADO', 'Anamnese não encontrada.', 404);
    }
  }
}

/** Janela usada para aferir frequência semanal, em dias. */
const JANELA_FREQUENCIA_DIAS = 28;

/** As linhas cruas que o PostgREST devolve, antes de virarem contrato. */
interface LinhaVinculo {
  id: string;
  tipo: string;
  status: string;
  iniciadoEm: string | null;
  encerradoEm: string | null;
  alunoId: string;
  convidadoPorId: string;
  aluno: ResumoPessoa;
  profissional: ResumoPessoa;
}

interface LinhaConsentimento {
  id: string;
  escopo: string;
  finalidade: string;
  versaoTermo: string;
  concedidoEm: string;
  revogadoEm: string | null;
  profissional: ResumoPessoa | null;
}

interface LinhaAlerta {
  id: string;
  papelDestino: string;
  severidade: string;
  titulo: string;
  orientacao: string;
  marcadorOrigem: string | null;
  exameId: string | null;
  condicaoId: string | null;
  criadoEm: string;
  reconhecidoEm: string | null;
  reconhecidoPor: { id: string; nome: string } | null;
}

interface LinhaCondicao {
  id: string;
  tipo: string;
  descricao: string;
  regiao: string | null;
  gravidade: string;
  inicioEm: string | null;
  observacao: string | null;
  criadoEm: string;
  resolvidaEm: string | null;
  registradoPor: { id: string; nome: string };
  resolvidaPor: { id: string; nome: string } | null;
}

/**
 * Um instante do Postgres, em ISO com fuso.
 *
 * ## O defeito que isto fecha
 *
 * 142 colunas do schema são `timestamp WITHOUT time zone`. O Prisma sempre
 * gravou UTC nelas e sabia lê-las de volta como UTC — a convenção vivia no
 * cliente dele. O PostgREST devolve o texto cru: `"2026-03-10T15:00:00"`, sem
 * o `Z`. E `new Date()` de uma string sem fuso a interpreta como hora LOCAL.
 *
 * No Brasil isso desloca tudo em três horas, e para o lado errado: um gole
 * registrado agora mesmo aparecia como `-181` minutos atrás. "Último treino há
 * 2 dias" vira 1 ou 3 conforme a hora; um alerta criado às 23h muda de dia.
 *
 * Nada disso dá erro. Só mostra a hora errada, e só para quem não vive em UTC.
 *
 * A conversão fica aqui, num lugar só, e não em cada `paraX`: espalhada, uma
 * delas ficaria de fora e ninguém notaria.
 */
function instante(v: unknown): string {
  if (typeof v !== 'string' || v === '') return v as string;
  // Data pura (`AAAA-MM-DD`) não é instante: fica como está.
  if (!v.includes('T') && !v.includes(' ')) return v;

  /*
    Uma forma só, sempre: `AAAA-MM-DDTHH:MM:SS.sssZ`.

    O PostgREST omite os milissegundos quando eles são zero, então o mesmo
    compromisso saía `...T09:50:00Z` daqui e `...T09:50:00.000Z` da API. As
    duas apontam o mesmo instante e nada quebra ao PARSEAR — mas várias listas
    deste SDK ordenam instante como TEXTO, e duas formas convivendo na mesma
    lista ordenam errado sem dar erro em lugar nenhum.
  */
  const comFuso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(v) ? v : `${v.replace(' ', 'T')}Z`;
  const quando = new Date(comFuso);
  return Number.isNaN(quando.getTime()) ? comFuso : quando.toISOString();
}

/**
 * `Date` ou string vira ISO com fuso antes de subir.
 *
 * O contrato aceita os dois (`z.coerce.date()`), e a função do banco espera
 * texto ISO. Sem o `Z`, o Postgres leria o instante no fuso do servidor e o
 * treino apareceria três horas fora do lugar.
 */
/** O embed que pode chegar como objeto ou como lista de um. */
function umSo(v: unknown): Record<string, unknown> | null {
  const alvo = Array.isArray(v) ? (v[0] ?? null) : v;
  return (alvo as Record<string, unknown> | null) ?? null;
}

function paraIso(v: Date | string): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/** Idem, para colunas que aceitam nulo. */
function instanteOuNulo(v: unknown): string | null {
  return v === null || v === undefined ? null : instante(v);
}

/**
 * O Postgres devolve `numeric` como TEXTO pelo PostgREST.
 *
 * Sem esta conversão, `pesoKg` chegaria à tela como `"82.50"`, e um
 * `peso > 80` compararia string com número — que em JavaScript funciona por
 * coerção e falha em silêncio no primeiro peso de três dígitos, onde
 * `"100" < "82.50"` é verdadeiro.
 */
function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const numero = Number(v);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Lê o miolo do JWT sem verificar assinatura, de propósito.
 *
 * Quem verifica é o Postgres, em toda consulta. Aqui o token só decide o que
 * a tela desenha; um token adulterado no navegador da própria pessoa faria o
 * menu mentir para ela e nada mais — o banco continuaria recusando. Verificar
 * assinatura no cliente exigiria a chave e daria uma falsa sensação de defesa.
 */
function lerClaims(token: string): { vivio_id?: string; vivio_papel?: string } | null {
  try {
    const meio = token.split('.')[1];
    if (!meio) return null;
    const json = decodificarBase64Url(meio);
    return JSON.parse(json) as { vivio_id?: string; vivio_papel?: string };
  } catch {
    return null;
  }
}

function decodificarBase64Url(s: string): string {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  // `atob` no navegador e no React Native; `Buffer` no Node (SSR do Next).
  const bruto =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  // O nome do usuário pode ter acento, e `atob` devolve bytes, não texto.
  return decodeURIComponent(
    Array.from(bruto, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  );
}

interface LinhaAuditoria {
  id: string;
  acao: string;
  recursoTipo: string;
  escopo: string | null;
  criadoEm: string;
  ator: AcessoRegistrado['ator'];
}

/** A foto como o banco a devolve. */
interface LinhaFoto {
  id: string;
  alunoId: string;
  data: string;
  angulo: string;
  observacao: string | null;
  visivelPara: string[];
  chaveArquivo: string;
  deletadoEm: string | null;
}
