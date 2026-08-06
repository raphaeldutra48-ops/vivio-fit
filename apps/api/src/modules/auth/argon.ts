/**
 * Custo do argon2id, em um lugar só.
 *
 * Passou a ser compartilhado quando a redefinição de senha entrou: dois
 * serviços gravando senha com custos diferentes é o tipo de divergência que
 * ninguém percebe — o hash carrega os próprios parâmetros, então tudo continua
 * funcionando, só que metade das senhas fica mais barata de quebrar.
 *
 * Os valores são a recomendação da OWASP para argon2id: 19 MiB de memória,
 * duas passagens, sem paralelismo.
 */
export const OPCOES_ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
