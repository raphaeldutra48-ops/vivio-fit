import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  EsqueciSenhaInput,
  LoginInput,
  Papel,
  RegistrarAlunoInput,
  RegistrarProfissionalInput,
  RespostaAutenticacao,
  RespostaRegistro,
  UsuarioAutenticado,
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
