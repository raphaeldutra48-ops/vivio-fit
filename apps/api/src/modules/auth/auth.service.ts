import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { Papel, Prisma, StatusConta } from '@prisma/client';
import type {
  LoginInput,
  RegistrarAlunoInput,
  RegistrarProfissionalInput,
  RespostaAutenticacao,
  RespostaRegistro,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { ContextoRequisicao, TokenService } from './token.service';
import { OPCOES_ARGON } from './argon';
import { RedefinicaoSenhaService } from './redefinicao-senha.service';
import { VerificacaoEmailService } from './verificacao-email.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly verificacao: VerificacaoEmailService,
    private readonly redefinicao: RedefinicaoSenhaService,
  ) {}

  /** Cadastro não abre sessão: dispara a confirmação e devolve só o essencial. */
  private async concluirRegistro(usuario: {
    id: string;
    email: string;
    nome: string;
    papel: Papel;
  }): Promise<RespostaRegistro> {
    const tokenDeVerificacao = await this.verificacao.gerarEEnviar(usuario);
    return {
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        papel: usuario.papel,
      },
      precisaConfirmarEmail: true,
      ...(tokenDeVerificacao ? { tokenDeVerificacao } : {}),
    };
  }

  private async montarResposta(
    usuario: { id: string; email: string; nome: string; papel: Papel; emailVerifEm: Date | null },
    ctx: ContextoRequisicao,
  ): Promise<RespostaAutenticacao> {
    const par = await this.tokens.emitirPar(usuario, ctx);
    return {
      ...par,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        papel: usuario.papel,
        emailVerificado: usuario.emailVerifEm !== null,
      },
    };
  }

  /**
   * Cria a conta traduzindo **só** o erro de banco.
   *
   * O `try` cobria também o `concluirRegistro`, que gera o token e dispara o
   * e-mail. Uma falha ali saía disfarçada de erro de Prisma — mensagem sobre
   * banco de dados para um problema que não é de banco. É o tipo de disfarce
   * que faz procurar horas no lugar errado.
   */
  private async criarConta<T>(criar: () => Promise<T>): Promise<T> {
    try {
      return await criar();
    } catch (erro) {
      throw this.traduzirErroDePrisma(erro);
    }
  }

  async registrarAluno(dados: RegistrarAlunoInput): Promise<RespostaRegistro> {
    const senhaHash = await hash(dados.senha, OPCOES_ARGON);

    const usuario = await this.criarConta(() =>
      this.prisma.user.create({
        data: {
          email: dados.email.toLowerCase().trim(),
          nome: dados.nome.trim(),
          telefone: dados.telefone,
          senhaHash,
          papel: Papel.ALUNO,
          status: StatusConta.ATIVA,
          perfilAluno: {
            create: {
              dataNascimento: dados.dataNascimento,
              alturaCm: dados.alturaCm,
              objetivo: dados.objetivo,
            },
          },
        },
      }),
    );

    return this.concluirRegistro(usuario);
  }

  /**
   * Profissional nasce PENDENTE_VERIFICACAO: pode entrar no app e ver o próprio
   * cadastro, mas só recebe vínculo depois que o admin conferir o registro no
   * conselho. Ninguém vira "médico" aqui só preenchendo um formulário.
   */
  async registrarProfissional(dados: RegistrarProfissionalInput): Promise<RespostaRegistro> {
    const senhaHash = await hash(dados.senha, OPCOES_ARGON);

    const usuario = await this.criarConta(() =>
      this.prisma.user.create({
        data: {
          email: dados.email.toLowerCase().trim(),
          nome: dados.nome.trim(),
          telefone: dados.telefone,
          senhaHash,
          papel: dados.tipo,
          status: StatusConta.PENDENTE_VERIFICACAO,
          perfilProfissional: {
            create: {
              tipo: dados.tipo,
              registroConselho: dados.registroConselho.trim(),
              ufRegistro: dados.ufRegistro.toUpperCase(),
              especialidades: dados.especialidades,
              bio: dados.bio,
            },
          },
        },
      }),
    );

    return this.concluirRegistro(usuario);
  }

  /** Confirmação bem-sucedida já abre a sessão: o link prova posse do e-mail. */
  async confirmarEmail(token: string, ctx: ContextoRequisicao): Promise<RespostaAutenticacao> {
    const usuario = await this.verificacao.verificar(token);
    return this.montarResposta(usuario, ctx);
  }

  /**
   * Redefinição concluída também abre a sessão, pelo mesmo motivo da
   * confirmação — e a sessão nova é emitida **depois** de o serviço apagar as
   * antigas, então a pessoa sai daqui com a única sessão viva da conta.
   */
  async concluirRedefinicao(
    token: string,
    senhaNova: string,
    ctx: ContextoRequisicao,
  ): Promise<RespostaAutenticacao> {
    const usuario = await this.redefinicao.redefinir(token, senhaNova);
    return this.montarResposta(usuario, ctx);
  }

  async login(dados: LoginInput, ctx: ContextoRequisicao): Promise<RespostaAutenticacao> {
    const usuario = await this.prisma.user.findUnique({
      where: { email: dados.email.toLowerCase().trim() },
    });

    // Mesma resposta para e-mail inexistente e senha errada — não confirmamos
    // a existência de uma conta para quem não sabe a senha.
    if (!usuario?.senhaHash || usuario.deletadoEm) throw ErroDominio.credenciaisInvalidas();

    const senhaConfere = await verify(usuario.senhaHash, dados.senha);
    if (!senhaConfere) throw ErroDominio.credenciaisInvalidas();

    if (
      usuario.status === StatusConta.SUSPENSA ||
      usuario.status === StatusConta.DESATIVADA
    ) {
      throw ErroDominio.papelNaoAutorizado('Sua conta está suspensa.');
    }

    // Só depois de conferir a senha: responder isto antes diria a qualquer um
    // quais e-mails existem na base.
    if (!usuario.emailVerifEm) throw ErroDominio.emailNaoVerificado(usuario.email);

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: { ultimoLoginEm: new Date() },
    });

    return this.montarResposta(usuario, ctx);
  }

  private traduzirErroDePrisma(erro: unknown): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === 'P2002') {
        const alvo = (erro.meta?.target as string[] | undefined)?.join(', ') ?? '';
        if (alvo.includes('email')) return ErroDominio.emailJaCadastrado();
        return ErroDominio.conflito('Já existe um registro com estes dados.', { campo: alvo });
      }
    }
    return erro;
  }
}
