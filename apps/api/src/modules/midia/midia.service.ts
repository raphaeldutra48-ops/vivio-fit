import { Inject, Injectable } from '@nestjs/common';
import {
  LIMITES_MIDIA,
  type AutorizacaoDeUpload,
  type PedirUploadInput,
  type TipoMidia,
  type UrlAssinada,
} from '@vivio/contracts';
import { randomBytes } from 'node:crypto';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { ARMAZENAMENTO, type Armazenamento } from './armazenamento';

/** Upload tem janela curta: o cliente pede e envia na sequência. */
const VALIDADE_UPLOAD_SEG = 15 * 60;
/** Leitura ainda mais curta — o link não deve sobreviver a um compartilhamento. */
const VALIDADE_LEITURA_SEG = 5 * 60;

const PASTA_POR_TIPO: Record<TipoMidia, string> = {
  VIDEO_EXERCICIO: 'exercicios',
  FOTO_EVOLUCAO: 'evolucao',
  AVATAR: 'avatares',
  MATERIAL: 'materiais',
};

const EXTENSAO_POR_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/csv': 'csv',
};

@Injectable()
export class MidiaService {
  constructor(@Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento) {}

  /**
   * A chave é gerada no servidor e inclui bytes aleatórios: o cliente não
   * escolhe onde escreve, e adivinhar a chave de outro aluno é inviável.
   */
  private gerarChave(tipo: TipoMidia, donoId: string, mimeType: string): string {
    const extensao = EXTENSAO_POR_MIME[mimeType] ?? 'bin';
    const aleatorio = randomBytes(16).toString('hex');
    return `${PASTA_POR_TIPO[tipo]}/${donoId}/${Date.now()}-${aleatorio}.${extensao}`;
  }

  async autorizarUpload(donoId: string, dados: PedirUploadInput): Promise<AutorizacaoDeUpload> {
    const limite = LIMITES_MIDIA[dados.tipo];

    if (!limite.mimesAceitos.includes(dados.mimeType)) {
      throw ErroDominio.conflito(
        `Formato não aceito para este tipo de mídia. Use: ${limite.mimesAceitos.join(', ')}.`,
        { mimeType: dados.mimeType },
      );
    }
    if (dados.tamanhoBytes > limite.tamanhoMaximoBytes) {
      throw ErroDominio.conflito(
        `Arquivo maior que o limite de ${Math.round(limite.tamanhoMaximoBytes / 1024 / 1024)} MB.`,
        { tamanhoBytes: dados.tamanhoBytes },
      );
    }

    const chave = this.gerarChave(dados.tipo, donoId, dados.mimeType);
    const autorizacao = await this.armazenamento.autorizarUpload(
      chave,
      dados.mimeType,
      VALIDADE_UPLOAD_SEG,
    );

    return {
      chave,
      urlUpload: autorizacao.url,
      metodo: 'PUT',
      cabecalhos: autorizacao.cabecalhos,
      expiraEm: autorizacao.expiraEm.toISOString(),
    };
  }

  async urlDeLeitura(chave: string): Promise<UrlAssinada> {
    const { url, expiraEm } = await this.armazenamento.urlDeLeitura(chave, VALIDADE_LEITURA_SEG);
    return { url, expiraEm: expiraEm.toISOString() };
  }

  async remover(chave: string): Promise<void> {
    await this.armazenamento.remover(chave);
  }
}
