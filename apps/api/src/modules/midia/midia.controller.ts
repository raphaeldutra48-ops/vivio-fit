import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  pedirUploadSchema,
  type AutorizacaoDeUpload,
  type PedirUploadInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Publico } from '../../common/decorators/publico.decorator';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ArmazenamentoLocal } from './armazenamento-local';
import { MidiaService } from './midia.service';

@ApiTags('midia')
@Controller('midia')
export class MidiaController {
  constructor(
    private readonly midia: MidiaService,
    private readonly local: ArmazenamentoLocal,
  ) {}

  @Post('upload-url')
  @ApiBearerAuth()
  @UseGuards(PapeisGuard)
  @Papeis(Papel.ALUNO, Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN)
  @ApiOperation({ summary: 'Autoriza envio direto ao storage; devolve a chave e o link assinado' })
  autorizarUpload(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(pedirUploadSchema)) dados: PedirUploadInput,
  ): Promise<AutorizacaoDeUpload> {
    return this.midia.autorizarUpload(usuario.id, dados);
  }

  /**
   * Endpoint do armazenamento LOCAL (desenvolvimento). Em produção com S3, o
   * cliente envia direto para o bucket e esta rota nem é usada.
   *
   * É `@Publico()` porque a autorização vem da assinatura na própria URL —
   * exatamente como numa URL pré-assinada do S3.
   */
  @Publico()
  @Put('arquivo')
  async receber(
    @Query('chave') chave: string,
    @Query('expira') expira: string,
    @Query('assinatura') assinatura: string,
    @Req() req: Request,
  ): Promise<{ chave: string; tamanhoBytes: number }> {
    if (!this.local.verificar(chave, Number(expira), 'PUT', assinatura)) {
      throw ErroDominio.naoAutenticado('Link de upload inválido ou expirado.');
    }

    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte as Buffer);
    const conteudo = Buffer.concat(partes);

    await this.local.gravar(chave, conteudo);
    return { chave, tamanhoBytes: conteudo.byteLength };
  }

  @Publico()
  @Get('arquivo')
  @Header('Cache-Control', 'private, max-age=300')
  async servir(
    @Query('chave') chave: string,
    @Query('expira') expira: string,
    @Query('assinatura') assinatura: string,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<StreamableFile> {
    if (!this.local.verificar(chave, Number(expira), 'GET', assinatura)) {
      throw ErroDominio.naoAutenticado('Link expirado. Recarregue a página.');
    }

    const caminho = this.local.caminhoDe(chave);
    try {
      const info = await stat(caminho);
      resposta.setHeader('Content-Length', info.size);
    } catch {
      throw ErroDominio.naoEncontrado('Arquivo');
    }

    return new StreamableFile(createReadStream(caminho));
  }
}
