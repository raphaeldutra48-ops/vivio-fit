import { config as carregarEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * De onde saem as chaves do Supabase para a suíte do SDK.
 *
 * Elas moram em `apps/api/.env.supabase` porque é de lá que os scripts de
 * migração as leem, e duplicar o arquivo criaria dois lugares para atualizar
 * — que é como um deles fica velho sem ninguém notar.
 *
 * `override: false` (o padrão): variável já definida no ambiente ganha, o que
 * deixa apontar a suíte para outro projeto sem editar arquivo nenhum.
 */
carregarEnv({ path: resolve(__dirname, '../../../apps/api/.env.supabase') });

export {};
