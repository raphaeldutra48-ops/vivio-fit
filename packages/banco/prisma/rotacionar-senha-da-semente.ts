import { config as carregarEnv } from 'dotenv';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONTAS_DA_SEMENTE, ehSobraDeTeste, gerarSenha, senhaDaSemente } from './senha-da-semente';

/**
 * Troca a senha das contas da semente no Supabase Auth.
 *
 *   pnpm --filter @vivio/banco rotacionar-senha-da-semente            # troca
 *   SO_LISTAR=1 pnpm --filter @vivio/banco rotacionar-senha-da-semente  # só mostra
 *
 * A senha antiga está no histórico de um repositório público, e não sai de lá —
 * o que dá para fazer é ela deixar de abrir alguma coisa.
 *
 * ## A ordem é o ponto
 *
 * A senha nova é gravada em `.env.supabase` ANTES de qualquer conta ser trocada.
 * Na ordem contrária, uma falha entre os dois passos deixaria contas com uma
 * senha que não está escrita em lugar nenhum — e uma delas é o administrador.
 * Rodar de novo é seguro: com `SENHA_DA_SEMENTE` já no arquivo, ele reaplica a
 * mesma, e não gera outra.
 *
 * ## O que ele NÃO faz
 *
 * - Não imprime a senha. Quem precisar dela lê o arquivo, nesta máquina.
 * - Não toca conta que não seja da semente ou sobra de teste: a lista é exata
 *   (`CONTAS_DA_SEMENTE`), e não "todo e-mail @viviofit.com.br" — uma conta de
 *   equipe criada depois com esse domínio seria trocada junto.
 * - Não apaga conta. Trocar a senha fecha a porta e mantém as suítes e o
 *   roteiro do teste funcionando; apagar é decisão de quem abre o banco para
 *   gente de verdade (pendência 12).
 */
const ARQUIVO = resolve(__dirname, '../.env.supabase');
carregarEnv({ path: ARQUIVO });

interface ContaDoAuth {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  created_at: string;
}

async function listar(url: string, chave: string): Promise<ContaDoAuth[]> {
  const contas: ContaDoAuth[] = [];
  for (let pagina = 1; pagina < 50; pagina++) {
    const r = await fetch(`${url}/auth/v1/admin/users?page=${pagina}&per_page=200`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    });
    if (!r.ok) throw new Error(`Não foi possível listar o Auth: ${r.status} ${await r.text()}`);
    const corpo = (await r.json()) as { users: ContaDoAuth[] };
    contas.push(...corpo.users);
    if (corpo.users.length < 200) break;
  }
  return contas;
}

async function trocar(url: string, chave: string, id: string, senha: string): Promise<void> {
  const r = await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: senha }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

async function principal(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !chave) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE em packages/banco/.env.supabase.');
    process.exitCode = 1;
    return;
  }
  const soListar = process.env.SO_LISTAR === '1';

  const todas = await listar(url, chave);
  const daSemente = new Set(CONTAS_DA_SEMENTE.map((e) => e.toLowerCase()));
  const alvos = todas.filter((c) => daSemente.has(c.email.toLowerCase()) || ehSobraDeTeste(c.email));
  const fora = todas.length - alvos.length;

  console.log(`contas no Auth: ${todas.length} · da semente ou sobra de teste: ${alvos.length} · outras (intocadas): ${fora}`);
  for (const c of alvos) {
    const ultimo = c.last_sign_in_at ? c.last_sign_in_at.slice(0, 16).replace('T', ' ') : 'nunca';
    console.log(`  ${c.email.padEnd(32)} último login: ${ultimo}`);
  }
  const faltando = CONTAS_DA_SEMENTE.filter((e) => !todas.some((c) => c.email.toLowerCase() === e.toLowerCase()));
  if (faltando.length > 0) console.log(`não existem no Auth (nada a trocar): ${faltando.join(', ')}`);

  if (soListar) {
    console.log('\nSO_LISTAR=1: nada foi trocado.');
    return;
  }

  // 1º a senha vai para o arquivo; só depois para as contas.
  let senha: string;
  if (process.env.SENHA_DA_SEMENTE) {
    senha = senhaDaSemente();
    console.log('\nSENHA_DA_SEMENTE já está no arquivo: reaplicando a mesma.');
  } else {
    senha = gerarSenha();
    const atual = readFileSync(ARQUIVO, 'utf8');
    appendFileSync(ARQUIVO, `${atual.endsWith('\n') ? '' : '\n'}SENHA_DA_SEMENTE=${senha}\n`);
    process.env.SENHA_DA_SEMENTE = senha;
    // Relida do arquivo, e não da memória: prova que ela está escrita.
    carregarEnv({ path: ARQUIVO, override: true });
    if (process.env.SENHA_DA_SEMENTE !== senha) throw new Error('A senha não ficou gravada; nenhuma conta foi trocada.');
    console.log('\nSenha nova gerada e gravada em packages/banco/.env.supabase (SENHA_DA_SEMENTE).');
  }

  let trocadas = 0;
  const falhas: string[] = [];
  for (const c of alvos) {
    try {
      await trocar(url, chave, c.id, senha);
      trocadas++;
    } catch (e) {
      falhas.push(`${c.email}: ${(e as Error).message}`);
    }
  }
  console.log(`trocadas: ${trocadas} de ${alvos.length}`);
  if (falhas.length > 0) {
    console.error(`FALHAS:\n  ${falhas.join('\n  ')}`);
    process.exitCode = 1;
  }
}

void principal();
