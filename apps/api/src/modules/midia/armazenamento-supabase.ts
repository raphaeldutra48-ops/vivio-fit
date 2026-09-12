import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { partesDaChave } from '@vivio/contracts';
import type { Armazenamento } from './armazenamento';

/**
 * Armazenamento no Supabase Storage.
 *
 * Existe porque a API deixou de ser dona dos arquivos. Quem envia agora é o
 * cliente, direto para o compartimento, com a política do banco decidindo se
 * aceita — e quem lê, para mostrar, também vai direto. Este driver é o que
 * sobrou do outro lado: o punhado de coisas que ainda nascem ou morrem no
 * servidor, e que precisam enxergar os MESMOS arquivos.
 *
 * São duas hoje. A leitura de dieta, que manda o PDF ao modelo — o arquivo
 * chega pelo cliente e o servidor precisa dos bytes. E os importadores de
 * acervo, que gravam figura baixada de fonte aberta. Com o driver antigo
 * apontando para o disco (ou para o R2) e o cliente escrevendo no Supabase, as
 * duas pontas olhariam para lugares diferentes: a importação diria "gravei" e
 * a figura nunca apareceria na tela.
 *
 * ## A chave carrega o compartimento
 *
 * `evolucao/<aluno>/<arquivo>`: o primeiro pedaço é o compartimento, o resto é
 * o caminho dentro dele. É o mesmo endereço que o banco sempre guardou, e foi
 * por isso que a migração não precisou reescrever nenhuma linha.
 *
 * ## Chave de serviço
 *
 * Este driver usa a chave de serviço, que passa por cima de toda política —
 * é o que permite ao servidor ler o laudo que vai para o modelo. Ela nunca
 * chega ao cliente, e o que a limita é o alcance deste código: a API só a usa
 * nos caminhos acima, todos com o dono já conferido antes.
 */
@Injectable()
export class ArmazenamentoSupabase implements Armazenamento {
  private readonly logger = new Logger(ArmazenamentoSupabase.name);
  private readonly cliente: SupabaseClient;

  constructor(config: ConfigService) {
    this.cliente = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    this.logger.log('mídia no Supabase Storage');
  }

  /** `evolucao/u1/foto.png` → compartimento `evolucao`, caminho `u1/foto.png`. */
  private partes(chave: string): { compartimento: string; caminho: string } {
    const partes = partesDaChave(chave);
    if (!partes) throw new Error(`Chave de mídia sem compartimento: ${chave}`);
    return partes;
  }

  /**
   * Autorização de envio pelo servidor.
   *
   * Continua existindo para quem ainda chama o endereço antigo, mas não é mais
   * o caminho normal: o cliente monta a chave e envia com a própria sessão, e
   * é a política do compartimento que confere o dono. Aqui a conferência já
   * aconteceu antes, em quem montou a chave.
   */
  async autorizarUpload(
    chave: string,
    mimeType: string,
    validadeSeg: number,
  ): Promise<{ url: string; cabecalhos: Record<string, string>; expiraEm: Date }> {
    const { compartimento, caminho } = this.partes(chave);
    const r = await this.cliente.storage.from(compartimento).createSignedUploadUrl(caminho);
    if (r.error || !r.data) throw new Error(`Falha ao autorizar upload: ${r.error?.message}`);

    return {
      url: r.data.signedUrl,
      cabecalhos: { 'Content-Type': mimeType },
      /*
        A validade é do Supabase (duas horas), não a nossa. Devolver o número
        que pedimos seria informar uma expiração que não é a de verdade — e
        quem lê essa data decide quando pedir outra autorização.
      */
      expiraEm: new Date(Date.now() + Math.max(validadeSeg, 2 * 3600) * 1000),
    };
  }

  async urlDeLeitura(chave: string, validadeSeg: number): Promise<{ url: string; expiraEm: Date }> {
    const { compartimento, caminho } = this.partes(chave);
    const r = await this.cliente.storage.from(compartimento).createSignedUrl(caminho, validadeSeg);
    if (r.error || !r.data?.signedUrl) {
      throw new Error(`Arquivo não encontrado: ${chave}`);
    }
    return { url: r.data.signedUrl, expiraEm: new Date(Date.now() + validadeSeg * 1000) };
  }

  async ler(chave: string): Promise<Buffer> {
    const { compartimento, caminho } = this.partes(chave);
    const r = await this.cliente.storage.from(compartimento).download(caminho);
    if (r.error || !r.data) throw new Error(`Arquivo não encontrado: ${chave}`);
    return Buffer.from(await r.data.arrayBuffer());
  }

  async remover(chave: string): Promise<void> {
    const { compartimento, caminho } = this.partes(chave);
    await this.cliente.storage.from(compartimento).remove([caminho]);
  }

  async gravar(chave: string, conteudo: Buffer, mimeType: string): Promise<void> {
    const { compartimento, caminho } = this.partes(chave);
    const r = await this.cliente.storage.from(compartimento).upload(caminho, conteudo, {
      // Sem o tipo, o Storage serve `application/octet-stream` e o navegador
      // baixa o vídeo em vez de tocá-lo.
      contentType: mimeType,
      // `upsert` porque quem chama é importador: rodar de novo repõe o que
      // faltou e sobrescreve o que mudou, sem precisar limpar antes.
      upsert: true,
    });
    if (r.error) throw new Error(`Falha ao gravar ${chave}: ${r.error.message}`);
  }

  async existe(chave: string): Promise<boolean> {
    const { compartimento, caminho } = this.partes(chave);
    const corte = caminho.lastIndexOf('/');
    const pasta = corte > 0 ? caminho.slice(0, corte) : '';
    const nome = corte > 0 ? caminho.slice(corte + 1) : caminho;

    /*
      `list` com busca pelo nome, e não `download`: conferir a existência de
      trinta figuras do acervo baixando as trinta seria puxar megabytes para
      responder sim ou não.
    */
    const r = await this.cliente.storage.from(compartimento).list(pasta, { search: nome, limit: 1 });
    if (r.error) throw new Error(`Falha ao conferir ${chave}: ${r.error.message}`);
    // `search` é prefixo, não igualdade: "foto.png" casaria com "foto.png.bak".
    return (r.data ?? []).some((o) => o.name === nome);
  }
}
