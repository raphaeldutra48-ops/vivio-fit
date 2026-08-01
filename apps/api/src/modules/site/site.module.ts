import { Module } from '@nestjs/common';
import { PaginaPublicaController, SiteController } from './site.controller';
import { SiteService } from './site.service';

@Module({
  controllers: [SiteController, PaginaPublicaController],
  providers: [SiteService],
})
export class SiteModule {}
