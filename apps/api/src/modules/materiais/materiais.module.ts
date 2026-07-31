import { Module } from '@nestjs/common';
import { MateriaisController } from './materiais.controller';
import { MateriaisService } from './materiais.service';

/** MidiaService vem do MidiaModule, que é @Global. */
@Module({
  controllers: [MateriaisController],
  providers: [MateriaisService],
})
export class MateriaisModule {}
