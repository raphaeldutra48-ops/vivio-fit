import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Armazenamento } from './armazenamento';

/**
 * Armazenamento em object storage compatível com S3 — Cloudflare R2 por padrão.
 *
 * Existe porque o disco do contêiner é apagado a cada deploy (pendência 19): a
 * foto de evolução que o aluno subiu na semana passada some no próximo deploy,
 * e o banco fica apontando para arquivo que não existe mais. Foto de antes e
 * depois é justamente o dado que precisa durar anos.
 *
 * R2 e não S3 por dois motivos práticos: 10 GB grátis e, principalmente,
 * **egresso sem cobrança** — o app serve imagem toda vez que alguém abre a
 * evolução, e é a saída de dados que costuma dominar a conta em storage de
 * mídia.
 *
 * A regra da interface continua valendo: **arquivo nunca é público**. O bucket
 * fica privado e a entrega é sempre por URL assinada de curta duração.
 */
@Injectable()
export class ArmazenamentoR2 implements Armazenamento {
  private readonly logger = new Logger(ArmazenamentoR2.name);
  private readonly cliente: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('R2_BUCKET');

    /*
      `endpoint` explícito e `region: 'auto'` é o que o R2 espera. E
      `forcePathStyle` porque o R2 não faz bucket como subdomínio — sem isso a
      assinatura fecha e a requisição vai para um host que não existe.
    */
    this.cliente = new S3Client({
      region: 'auto',
      endpoint:
        config.get<string>('R2_ENDPOINT') ??
        `https://${config.getOrThrow<string>('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });

    this.logger.log(`mídia em R2, bucket ${this.bucket}`);
  }

  async autorizarUpload(
    chave: string,
    mimeType: string,
    validadeSeg: number,
  ): Promise<{ url: string; cabecalhos: Record<string, string>; expiraEm: Date }> {
    const url = await getSignedUrl(
      this.cliente,
      new PutObjectCommand({ Bucket: this.bucket, Key: chave, ContentType: mimeType }),
      { expiresIn: validadeSeg },
    );

    return {
      url,
      // O Content-Type entra na assinatura: enviar outro faz o R2 recusar.
      cabecalhos: { 'Content-Type': mimeType },
      expiraEm: new Date(Date.now() + validadeSeg * 1000),
    };
  }

  async urlDeLeitura(chave: string, validadeSeg: number): Promise<{ url: string; expiraEm: Date }> {
    const url = await getSignedUrl(
      this.cliente,
      new GetObjectCommand({ Bucket: this.bucket, Key: chave }),
      { expiresIn: validadeSeg },
    );

    return { url, expiraEm: new Date(Date.now() + validadeSeg * 1000) };
  }

  async remover(chave: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }
}
