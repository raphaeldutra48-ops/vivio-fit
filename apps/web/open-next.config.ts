import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Adaptação do Next.js para o runtime da Cloudflare.
 *
 * O Worker não é Node.js: é um isolate V8. O `next build` sozinho produz um
 * servidor Node que não roda lá — este adaptador reescreve a saída para o
 * formato do Worker.
 *
 * Sem cache incremental por ora. Ele exige um bucket R2 ou um KV declarados, e
 * o painel é quase todo renderizado no cliente a partir da API: as páginas não
 * têm o que revalidar. Ligar antes de precisar seria pagar complexidade
 * adiantado.
 */
export default defineCloudflareConfig();
