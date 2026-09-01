import { PrismaClient } from '@prisma/client';

/**
 * Espelha os usuários da semente no Supabase Auth.
 *
 *   pnpm --filter @vivio/api semear-auth
 *
 * ## Por que existe
 *
 * As contas nasceram em `public."User"` com hash Argon2 nosso. O Supabase Auth
 * guarda as próprias credenciais em `auth.users`, e as duas tabelas não se
 * conhecem — o hook `token_com_id_vivio` casa uma na outra **pelo e-mail**.
 * Sem a conta existir dos dois lados, o login funciona e o token sai sem o
 * `vivio_id`, e aí nenhuma política enxerga nada.
 *
 * ## Por que não importa o hash
 *
 * Importar hash Argon2 exigiria escrever à mão em `auth.users`, que é onde
 * mora a credencial de todo mundo. Não vale o risco para resolver um problema
 * que não existe: o banco tem só semente e teste dentro, zero usuário real.
 * Quando houver gente de verdade, a conversa muda — e aí é decisão explícita,
 * não efeito colateral de um seed.
 *
 * A senha é a mesma `SENHA_PADRAO` do `seed.ts`, que está versionada no
 * repositório porque é conta de desenvolvimento.
 *
 * ## Idempotente
 *
 * Conta que já existe no Auth é pulada, não recriada — rodar de novo depois de
 * acrescentar um usuário à semente traz só o novo.
 */

const SENHA_PADRAO = 'Senha@123';

interface UsuarioDoAuth {
  id: string;
  email: string;
}

async function listarDoAuth(url: string, chave: string): Promise<Map<string, string>> {
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) throw new Error(`Não foi possível listar o Auth: ${r.status} ${await r.text()}`);
  const corpo = (await r.json()) as { users: UsuarioDoAuth[] };
  return new Map(corpo.users.map((u) => [u.email.toLowerCase(), u.id]));
}

async function criarNoAuth(url: string, chave: string, email: string): Promise<void> {
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: SENHA_PADRAO,
      // Sem isto a conta nasce pendente e o login é recusado. A semente não
      // tem caixa de entrada para confirmar.
      email_confirm: true,
    }),
  });
  if (!r.ok) throw new Error(`Falha ao criar ${email}: ${r.status} ${await r.text()}`);
}

async function principal(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !chave) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE no ambiente.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    /*
      Só as contas da semente. As `@teste.com` são resíduo dos e2e e não devem
      ganhar login — criar conta de verdade para elas seria transformar lixo de
      teste em usuário do sistema.
    */
    const nossos = await prisma.user.findMany({
      where: { deletadoEm: null, NOT: { email: { endsWith: '@teste.com' } } },
      select: { email: true, nome: true, papel: true },
      orderBy: { criadoEm: 'asc' },
    });

    const noAuth = await listarDoAuth(url, chave);
    let criados = 0;
    let pulados = 0;

    for (const u of nossos) {
      if (noAuth.has(u.email.toLowerCase())) {
        pulados += 1;
        continue;
      }
      await criarNoAuth(url, chave, u.email);
      criados += 1;
      console.log(`  + ${u.papel.padEnd(14)} ${u.email}`);
    }

    console.log(`\ncriados: ${criados} · já existiam: ${pulados}`);
    const depois = await listarDoAuth(url, chave);
    console.log(`contas no Auth: ${depois.size} · na nossa tabela: ${nossos.length}`);

    const semPar = nossos.filter((u) => !depois.has(u.email.toLowerCase()));
    if (semPar.length > 0) {
      console.error(`\nATENÇÃO: ${semPar.length} sem par no Auth — o token sairá sem vivio_id.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void principal();
