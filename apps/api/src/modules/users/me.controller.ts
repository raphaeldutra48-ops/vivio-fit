import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UsuarioAutenticado } from '@vivio/contracts';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  obter(@UsuarioAtual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }
}
