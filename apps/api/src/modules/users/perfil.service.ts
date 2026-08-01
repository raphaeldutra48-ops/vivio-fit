import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AtualizarPerfilInput, MeuPerfil } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const INCLUDE = { perfilProfissional: true } as const;
type LinhaUsuario = Prisma.UserGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class PerfilService {
  constructor(private readonly prisma: PrismaService) {}

  private paraResumo(u: LinhaUsuario): MeuPerfil {
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      telefone: u.telefone,
      papel: u.papel,
      emailVerificado: u.emailVerifEm !== null,
      profissional: u.perfilProfissional
        ? {
            tipo: u.perfilProfissional.tipo,
            registroConselho: u.perfilProfissional.registroConselho,
            ufRegistro: u.perfilProfissional.ufRegistro,
            especialidades: u.perfilProfissional.especialidades,
            bio: u.perfilProfissional.bio,
            verificadoEm: u.perfilProfissional.verificadoEm?.toISOString() ?? null,
            recusadoEm: u.perfilProfissional.recusadoEm?.toISOString() ?? null,
            motivoRecusa: u.perfilProfissional.motivoRecusa,
          }
        : null,
    };
  }

  async obter(usuarioId: string): Promise<MeuPerfil> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      include: INCLUDE,
    });
    if (!usuario) throw ErroDominio.naoEncontrado('Usuário');
    return this.paraResumo(usuario);
  }

  /**
   * Atualiza os dados do próprio perfil.
   *
   * E-mail não entra: trocar e-mail exige confirmar o novo endereço, que é
   * outro fluxo. Papel também não — quem é nutricionista não vira médico
   * editando o cadastro.
   */
  async atualizar(usuarioId: string, dados: AtualizarPerfilInput): Promise<MeuPerfil> {
    const atual = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      include: INCLUDE,
    });
    if (!atual) throw ErroDominio.naoEncontrado('Usuário');

    const perfil = atual.perfilProfissional;
    const novoRegistro = dados.registroConselho?.trim();
    const novaUf = dados.ufRegistro?.toUpperCase();

    // Trocar o registro depois de verificado burlaria a checagem do conselho:
    // bastaria informar um número válido, ser aprovado e substituir depois.
    const registroMudou =
      Boolean(perfil) &&
      ((novoRegistro !== undefined && novoRegistro !== perfil!.registroConselho) ||
        (novaUf !== undefined && novaUf !== perfil!.ufRegistro));

    const atualizado = await this.prisma.user.update({
      where: { id: usuarioId },
      data: {
        nome: dados.nome.trim(),
        telefone: dados.telefone ?? null,
        ...(perfil
          ? {
              perfilProfissional: {
                update: {
                  bio: dados.bio ?? null,
                  especialidades: dados.especialidades.map((e) => e.trim()),
                  ...(novoRegistro ? { registroConselho: novoRegistro } : {}),
                  ...(novaUf ? { ufRegistro: novaUf } : {}),
                  ...(registroMudou
                    ? { verificadoEm: null, verificadoPorId: null, recusadoEm: null, motivoRecusa: null }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: INCLUDE,
    });

    return this.paraResumo(atualizado);
  }
}
