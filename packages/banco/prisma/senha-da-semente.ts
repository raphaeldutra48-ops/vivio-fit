import { randomInt } from 'node:crypto';

/**
 * A senha das contas da semente — lida do ambiente, nunca do repositório.
 *
 * Era `Senha@123`, escrita em `semear-auth.ts`, em `seed.ts` e em ~150 provas.
 * O comentário original dizia por que isso era aceitável: "está versionada no
 * repositório porque é conta de desenvolvimento". As duas premissas caíram
 * juntas: **o repositório é público**, e o projeto do Supabase onde essas contas
 * vivem é o MESMO que vai receber as primeiras pessoas de verdade — com
 * `admin@viviofit.com.br` entre elas, que é quem verifica o registro de cada
 * profissional no roteiro do teste. Senha pública de administrador num banco
 * com gente de verdade é porta aberta: quem lê o GitHub decide quem aparece como
 * profissional verificado para os alunos.
 *
 * A senha agora mora em `packages/banco/.env.supabase` (ignorado pelo git), ao
 * lado da chave de serviço — que dá mais poder que ela, e já mora lá. Quem
 * gera e troca é `rotacionar-senha-da-semente`.
 */
export function senhaDaSemente(ambiente: NodeJS.ProcessEnv = process.env): string {
  const senha = ambiente.SENHA_DA_SEMENTE;
  if (!senha) {
    throw new Error(
      'Falta SENHA_DA_SEMENTE em packages/banco/.env.supabase. ' +
        'Rode `pnpm --filter @vivio/banco rotacionar-senha-da-semente`: ele gera uma, ' +
        'grava no arquivo e troca nas contas da semente.',
    );
  }
  if (senha.length < 16 || /^senha@123$/i.test(senha)) {
    // A antiga é recusada pelo nome: trocar por ela de novo seria reabrir a porta.
    throw new Error('SENHA_DA_SEMENTE fraca ou já publicada. Gere outra com `rotacionar-senha-da-semente`.');
  }
  return senha;
}

/**
 * As contas que `seed.ts` cria — a lista exata, e não um padrão de domínio.
 *
 * "Todo `@viviofit.com.br`" seria largo demais para uma operação que troca
 * senha: uma conta de equipe criada depois com esse domínio seria trocada junto.
 * Há prova que confere esta lista contra os e-mails escritos no `seed.ts`, para
 * as duas não divergirem quando a semente ganhar alguém.
 */
export const CONTAS_DA_SEMENTE: readonly string[] = [
  'admin@viviofit.com.br',
  'personal@viviofit.com.br',
  'nutri@viviofit.com.br',
  'medico@viviofit.com.br',
  'ana@exemplo.com',
  'bruno@exemplo.com',
  'carla@exemplo.com',
];

/**
 * Conta que uma suíte criou e não apagou — interrompida no meio, por exemplo.
 *
 * Também nasceu com a senha pública, e por isso também é trocada. O padrão é o
 * mesmo que o diagnóstico usa para acusar "sobras de execução de teste".
 */
export function ehSobraDeTeste(email: string): boolean {
  return /@teste\.com$/i.test(email) || /^prova-/i.test(email);
}

/**
 * Senhas de conta escritas no código — o que a prova do repositório recusa.
 *
 * Três formas: a chave de objeto que o Supabase e o SDK recebem
 * (`password: '…'`, `senha: '…'`), uma constante `SENHA…= '…'`, e a senha
 * antiga em qualquer lugar. Valor passado por variável não é acusado: o ponto é
 * o texto da senha não estar no arquivo.
 */
export function senhasEscritas(texto: string): string[] {
  const achados: string[] = [];
  const padroes = [
    /\b(?:password|senha)\s*:\s*(['"`])([^'"`\s]{4,})\1/gi,
    /\bSENHA[A-Z_]*\s*=\s*(['"`])([^'"`]{4,})\1/g,
    /Senha@123/gi,
  ];
  for (const p of padroes) {
    for (const m of texto.matchAll(p)) achados.push(m[0].slice(0, 60));
  }
  return achados;
}

const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITOS = '23456789';
const SIMBOLOS = '!#%+-=?@^_';

/**
 * 24 caracteres do gerador criptográfico, com as quatro classes garantidas.
 *
 * As quatro classes porque a política de senha do Supabase pode exigir todas,
 * e uma senha recusada no meio da troca deixaria metade das contas com a nova e
 * metade com a velha. Sem `0/O/1/l/I`: alguém vai ter de ler esta senha do
 * arquivo e digitar no login do painel.
 */
export function gerarSenha(tamanho = 24): string {
  const sortear = (alfabeto: string): string => alfabeto[randomInt(alfabeto.length)]!;
  const todos = MINUSCULAS + MAIUSCULAS + DIGITOS + SIMBOLOS;
  const base = [sortear(MINUSCULAS), sortear(MAIUSCULAS), sortear(DIGITOS), sortear(SIMBOLOS)];
  while (base.length < tamanho) base.push(sortear(todos));
  // Embaralha (Fisher–Yates) para as quatro garantidas não ficarem sempre no começo.
  for (let i = base.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [base[i], base[j]] = [base[j]!, base[i]!];
  }
  return base.join('');
}
