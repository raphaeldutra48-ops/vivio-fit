import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Publico } from './common/decorators/publico.decorator';

@ApiTags('sistema')
@Controller('health')
export class HealthController {
  @Publico()
  @Get()
  verificar(): { status: string; versao: string; horario: string } {
    return {
      status: 'ok',
      versao: '0.1.0',
      horario: new Date().toISOString(),
    };
  }
}
