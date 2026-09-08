import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  FINALIDADE_POR_ESCOPO,
  VERSAO_TERMO_ATUAL,
  hojeUtc,
  montarEvolucaoCorporal,
  resumoDeCheckins,
} from '@vivio/contracts';
import type {
  AcessoRegistrado,
  CheckinResumo,
  AlertaResumo,
  ConsultaAuditoria,
  ConsultaEvolucao,
  EvolucaoCorporal,
  CondicaoResumo,
  ConcederConsentimentoInput,
  ConsentimentoResumo,
  EsqueciSenhaInput,
  LoginInput,
  Papel,
  RegistrarAlunoInput,
  RegistrarProfissionalInput,
  RespostaAutenticacao,
  AtualizarPerfilInput,
  MedidaParaSerie,
  MedidaResumo,
  MeuPerfil,
  RegistrarCheckinInput,
  RegistrarCondicaoInput,
  RegistrarMedidaInput,
  ResolverCondicaoInput,
  ResumoDeCheckins,
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
  if (e.code === '23505') {
    return new ErroApi('CONFLITO', 'Esse registro já existe.', 409);
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
      iniciadoEm: v.iniciadoEm,
      encerradoEm: v.encerradoEm,
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
      concedidoEm: c.concedidoEm,
      revogadoEm: c.revogadoEm,
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
      concedidoEm: linha.concedidoEm,
      revogadoEm: linha.revogadoEm,
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
      criadoEm: a.criadoEm,
      reconhecidoEm: a.reconhecidoEm,
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
      criadoEm: c.criadoEm,
      resolvidaEm: c.resolvidaEm,
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
            verificadoEm: (pro.verificadoEm as string | null) ?? null,
            recusadoEm: (pro.recusadoEm as string | null) ?? null,
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
        criadoEm: r.criadoEm,
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
      criadoEm: c.criadoEm as string,
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
}

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
