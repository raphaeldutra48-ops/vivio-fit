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
} from '@vivio/contracts';
import type {
  AcessoRegistrado,
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
    42501 é "insufficient_privilege": a política de RLS barrou. Do lado de fora
    isso é sempre uma das três condições faltando — sessão, vínculo ou
    consentimento — e a tela não deve dizer QUAL, porque dizer "você não tem
    consentimento para o clínico deste aluno" já confirma que o aluno existe e
    que ele tem dado clínico.
  */
  if (e.code === '42501' || status === 403) {
    return new ErroApi('ACESSO_NEGADO', 'Você não tem acesso a este conteúdo.', 403);
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

  private paraExame(e: Record<string, unknown>): ExameResumo {
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
        Sempre nulo por enquanto: assinar a URL depende do armazenamento, que
        ainda vive fora daqui. `anexarLaudo` e o link continuam na API até a
        mídia migrar — e a tela já trata `null` como "sem arquivo para abrir".
      */
      arquivoUrl: null,
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
    return this.paraExame(linha);
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
    'criadoPorId,imagemCredito,videoCredito';

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
      prazo: m.prazo === null || m.prazo === undefined ? null : String(m.prazo).slice(0, 10),
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
