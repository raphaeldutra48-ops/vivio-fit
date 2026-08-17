import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Armazenamento } from './armazenamento';

/**
 * Armazenamento em disco, para desenvolvimento.
 *
 * Reproduz a semântica de URL pré-assinada do S3 com HMAC: o link carrega
 * chave + expiração + assinatura, e sem a assinatura correta o servidor recusa.
 * Assim o código do cliente é idêntico nos dois ambientes.
 */
@Injectable()
export class ArmazenamentoLocal implements Armazenamento {
  private readonly logger = new Logger(ArmazenamentoLocal.name);
  private readonly raiz: string;
  private readonly baseUrl: string;
  private readonly segredo: string;

  constructor(private readonly config: ConfigService) {
    this.raiz = resolve(this.config.get<string>('MEDIA_DIR') ?? './media');
    this.baseUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3333';
    this.segredo = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  /**
   * Impede que uma chave com `../` escreva fora da pasta de mídia.
   * A chave vem do banco, mas defesa em profundidade é barata aqui.
   */
  caminhoDe(chave: string): string {
    const destino = resolve(join(this.raiz, normalize(chave)));
    if (destino !== this.raiz && !destino.startsWith(this.raiz + sep)) {
      throw new Error(`Chave de mídia inválida: ${chave}`);
    }
    return destino;
  }

  assinar(chave: string, expiraEmMs: number, acao: 'PUT' | 'GET'): string {
    return createHmac('sha256', this.segredo)
      .update(`${acao}:${chave}:${expiraEmMs}`)
      .digest('base64url');
  }

  verificar(chave: string, expiraEmMs: number, acao: 'PUT' | 'GET', assinatura: string): boolean {
    if (!Number.isFinite(expiraEmMs) || expiraEmMs < Date.now()) return false;
    const esperada = Buffer.from(this.assinar(chave, expiraEmMs, acao));
    const recebida = Buffer.from(assinatura);
    // Comparação de tempo constante: evita descobrir a assinatura por timing.
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
  }

  private montarUrl(chave: string, expiraEmMs: number, acao: 'PUT' | 'GET'): string {
    const parametros = new URLSearchParams({
      chave,
      expira: String(expiraEmMs),
      assinatura: this.assinar(chave, expiraEmMs, acao),
    });
    return `${this.baseUrl}/api/v1/midia/arquivo?${parametros.toString()}`;
  }

  async autorizarUpload(
    chave: string,
    mimeType: string,
    validadeSeg: number,
  ): Promise<{ url: string; cabecalhos: Record<string, string>; expiraEm: Date }> {
    const expiraEm = new Date(Date.now() + validadeSeg * 1000);
    return {
      url: this.montarUrl(chave, expiraEm.getTime(), 'PUT'),
      cabecalhos: { 'Content-Type': mimeType },
      expiraEm,
    };
  }

  async urlDeLeitura(chave: string, validadeSeg: number): Promise<{ url: string; expiraEm: Date }> {
    const expiraEm = new Date(Date.now() + validadeSeg * 1000);
    return { url: this.montarUrl(chave, expiraEm.getTime(), 'GET'), expiraEm };
  }

  async gravar(chave: string, conteudo: Buffer): Promise<void> {
    const destino = this.caminhoDe(chave);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, conteudo);
    this.logger.debug(`mídia gravada: ${chave} (${conteudo.byteLength} bytes)`);
  }

  /** `caminhoDe` já barra travessia de diretório — a chave vem de fora. */
  async ler(chave: string): Promise<Buffer> {
    return readFile(this.caminhoDe(chave));
  }

  async remover(chave: string): Promise<void> {
    await rm(this.caminhoDe(chave), { force: true });
  }
}
