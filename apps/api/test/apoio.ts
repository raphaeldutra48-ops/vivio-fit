import type { INestApplication } from '@nestjs/common';
import type { RespostaAutenticacao } from '@vivio/contracts';
import request from 'supertest';

type Servidor = ReturnType<INestApplication['getHttpServer']>;

export const url = (caminho: string) => `/api/v1${caminho}`;

/**
 * Cadastra e já confirma o e-mail, devolvendo a sessão.
 *
 * O cadastro sozinho não abre sessão desde que a confirmação passou a ser
 * obrigatória. Fora de produção a API devolve o token do link no corpo, então o
 * teste percorre o fluxo real — não há atalho escrevendo direto no banco.
 */
export async function criarContaVerificada(
  servidor: Servidor,
  caminho: '/auth/registrar/aluno' | '/auth/registrar/profissional',
  dados: Record<string, unknown>,
): Promise<RespostaAutenticacao> {
  const registro = await request(servidor).post(url(caminho)).send(dados).expect(201);

  const confirmacao = await request(servidor)
    .post(url('/auth/verificar-email'))
    .send({ token: registro.body.tokenDeVerificacao })
    .expect(200);

  return confirmacao.body as RespostaAutenticacao;
}

export const criarAlunoVerificado = (servidor: Servidor, dados: Record<string, unknown>) =>
  criarContaVerificada(servidor, '/auth/registrar/aluno', dados);

export const criarProfissionalVerificado = (servidor: Servidor, dados: Record<string, unknown>) =>
  criarContaVerificada(servidor, '/auth/registrar/profissional', dados);
