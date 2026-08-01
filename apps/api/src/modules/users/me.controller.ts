import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atualizarPerfilSchema,
  type AtualizarPerfilInput,
  type MeuPerfil,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PerfilService } from './perfil.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly perfil: PerfilService) {}

  @Get()
  obter(@UsuarioAtual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }

  @Get('perfil')
  meuPerfil(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<MeuPerfil> {
    return this.perfil.obter(usuario.id);
  }

  @Patch('perfil')
  @ApiOperation({ summary: 'Trocar o registro no conselho revoga a verificação' })
  atualizar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(atualizarPerfilSchema)) dados: AtualizarPerfilInput,
  ): Promise<MeuPerfil> {
    return this.perfil.atualizar(usuario.id, dados);
  }
}
