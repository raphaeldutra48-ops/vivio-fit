import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTAS_DA_SEMENTE, ehSobraDeTeste, gerarSenha, senhaDaSemente, senhasEscritas } from './senha-da-semente';

/**
 * A senha das contas da semente saiu do repositório — e esta prova impede que
 * volte.
 *
 * O repositório é público e o banco das contas da semente é o mesmo que recebe
 * as primeiras pessoas de verdade. `Senha@123` dava login de ADMINISTRADOR a
 * quem lesse o GitHub.
 */

describe('senhaDaSemente', () => {
  it('sem a variável, recusa e diz o que rodar', () => {
    expect(() => senhaDaSemente({})).toThrow(/rotacionar-senha-da-semente/);
  });

  it('recusa a senha que já foi publicada, em qualquer caixa', () => {
    expect(() => senhaDaSemente({ SENHA_DA_SEMENTE: 'Senha@123' })).toThrow(/fraca ou já publicada/);
    expect(() => senhaDaSemente({ SENHA_DA_SEMENTE: 'senha@123' })).toThrow(/fraca ou já publicada/);
  });

  it('recusa senha curta', () => {
    expect(() => senhaDaSemente({ SENHA_DA_SEMENTE: 'Curta#12' })).toThrow(/fraca/);
  });

  it('aceita a que veio do gerador', () => {
    const s = gerarSenha();
    expect(senhaDaSemente({ SENHA_DA_SEMENTE: s })).toBe(s);
  });
});

describe('gerarSenha', () => {
  const amostra = Array.from({ length: 200 }, () => gerarSenha());

  it('24 caracteres, com as quatro classes em TODAS as amostras', () => {
    // As quatro em todas, e não "em média": uma senha recusada pela política do
    // Supabase no meio da troca deixaria metade das contas com a senha velha.
    for (const s of amostra) {
      expect(s).toHaveLength(24);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[0-9]/);
      expect(s).toMatch(/[!#%+\-=?@^_]/);
    }
  });

  it('sem caracteres que se confundem na leitura', () => {
    // Alguém vai ler esta senha do arquivo e digitar no login do painel.
    for (const s of amostra) expect(s).not.toMatch(/[0O1lI]/);
  });

  it('não se repete', () => {
    expect(new Set(amostra).size).toBe(amostra.length);
  });
});

describe('quais contas a rotação toca', () => {
  it('a lista exata confere com os e-mails escritos em seed.ts', () => {
    // Se a semente ganhar uma conta e esta lista não, a conta nova nasceria com
    // a senha da semente e nunca seria trocada.
    const seed = readFileSync(join(__dirname, 'seed.ts'), 'utf8');
    const noSeed = [...new Set([...seed.matchAll(/'([a-z0-9.]+@[a-z0-9.]+)'/g)].map((m) => m[1]!))].sort();
    expect([...CONTAS_DA_SEMENTE].sort()).toEqual(noSeed);
  });

  it('sobra de teste: pelo padrão do nome', () => {
    expect(ehSobraDeTeste('alguem@teste.com')).toBe(true);
    expect(ehSobraDeTeste('prova-123@exemplo.com')).toBe(true);
    // Uma pessoa de verdade com e-mail parecido não é sobra.
    expect(ehSobraDeTeste('fulana@testes.com.br')).toBe(false);
    expect(ehSobraDeTeste('contato@viviofit.com.br')).toBe(false);
  });
});

describe('senhasEscritas: a varredura sabe acusar', () => {
  const RUINS: Array<[string, string]> = [
    ['constante', `const SENHA_PADRAO = 'Senha@123';`],
    ['objeto do supabase', `await c.auth.signInWithPassword({ email, password: 'qualquerCoisa9' });`],
    ['objeto do SDK', `await c.auth.login({ email, senha: 'outra#Senha1' });`],
    ['a antiga em qualquer lugar', `console.log('use Senha@123 para entrar');`],
    ['aspas duplas', `const x = { password: "Teste@2026" };`],
  ];
  for (const [nome, texto] of RUINS) {
    it(`RUIM: ${nome}`, () => expect(senhasEscritas(texto)).not.toEqual([]));
  }

  const BOAS: Array<[string, string]> = [
    ['lida do ambiente', `const s = senhaDaSemente();`],
    ['passada por variável', `await c.auth.login({ email, senha: SENHA_DA_SEMENTE });`],
    ['campo vazio de formulário', `const [senha, setSenha] = useState('');`],
    ['nome de campo no esquema', `password: z.string().min(8),`],
    ['texto de interface', `<label>Senha</label>`],
  ];
  for (const [nome, texto] of BOAS) {
    it(`BOA: ${nome}`, () => expect(senhasEscritas(texto)).toEqual([]));
  }
});

describe('o repositório: nenhuma senha de conta escrita no código', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const PASTAS = [
    join(RAIZ, 'packages', 'banco', 'prisma'),
    join(RAIZ, 'packages', 'banco', 'teste'),
    join(RAIZ, 'packages', 'banco', 'ferramentas'),
    join(RAIZ, 'packages', 'banco', 'scripts'),
    join(RAIZ, 'packages', 'banco', 'diagnostico'),
    join(RAIZ, 'packages', 'sdk', 'src'),
    join(RAIZ, 'packages', 'sdk', 'teste'),
  ];

  const arquivos: string[] = [];
  const andar = (dir: string): void => {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome === 'dist' || nome === 'migrations') continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      // O módulo da regra e a prova dela nomeiam a senha proibida: é o trabalho deles.
      else if (/\.ts$/.test(nome) && !/senha-da-semente(\.spec)?\.ts$/.test(nome)) arquivos.push(caminho);
    }
  };
  for (const p of PASTAS) andar(p);

  it('a varredura olhou para os arquivos (e não para uma lista vazia)', () => {
    expect(arquivos.length).toBeGreaterThan(60);
    expect(arquivos.some((a) => a.endsWith('semear-auth.ts'))).toBe(true);
  });

  it('nenhum arquivo escreve senha de conta', () => {
    const achados = arquivos.flatMap((a) =>
      senhasEscritas(readFileSync(a, 'utf8')).map((s) => `${a.slice(RAIZ.length + 1)}: ${s}`),
    );
    expect(achados).toEqual([]);
  });
});
