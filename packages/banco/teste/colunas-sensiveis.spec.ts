import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * O que cada papel alcança COLUNA a coluna, pela porta que o app usa.
 *
 * ## Por que este arquivo existe
 *
 * RLS protege a LINHA. A API protegia a coluna, montando a resposta campo por
 * campo e apagando o resto antes de serializar. Expondo a tabela direto ao
 * PostgREST, esse passo some — e cinco coisas passaram a vazar de uma vez,
 * entre elas justamente o que o produto promete não vazar: o personal recebia
 * `marcadorOrigem` junto com a conduta, e portanto sabia que o alerta era da
 * taxa de filtração renal.
 *
 * Nenhum teste pegava, porque todos entravam pela API. Este entra pelo
 * PostgREST com um login de verdade, que é o único lugar onde o problema
 * aparece.
 *
 * A sonda cria um exame com um marcador NUTRICIONAL (ferritina) e um de escopo
 * MEDICO (TSH) de propósito: é a diferença entre eles que revela o vazamento.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

describe.skipIf(!url || !anon)('colunas sensíveis pelo PostgREST', () => {
  const p = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const marca = `sonda-col-${Date.now()}`;
  const exameId = `${marca}-e`;
  const alunoId = `${marca}-aluno`;
  const clientes: Record<string, SupabaseClient> = {};

  async function entrar(email: string): Promise<SupabaseClient> {
    const c = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: 'Senha@123' });
    if (error) throw new Error(`${email}: ${error.message}`);
    return c;
  }

  beforeAll(async () => {
    const idDe = async (e: string) => (await p.user.findUniqueOrThrow({ where: { email: e } })).id;
    const [personal, nutri, medico] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br', 'medico@viviofit.com.br'].map(idDe),
    );

    /*
      Aluno próprio, e não a Ana da semente: os alertas dela vêm de vários
      exames, e a consulta por aluno misturaria tudo. Aqui todo alerta que
      aparece nasceu desta sonda.
    */
    await p.user.create({
      data: { id: alunoId, email: `${marca}@teste.com`, nome: 'Aluno de Sonda', papel: 'ALUNO' },
    });
    await p.vinculo.createMany({
      data: [
        { id: `${marca}-v1`, alunoId, profissionalId: personal, tipo: 'PERSONAL', status: 'ATIVO', convidadoPorId: personal },
        { id: `${marca}-v2`, alunoId, profissionalId: nutri, tipo: 'NUTRICIONISTA', status: 'ATIVO', convidadoPorId: nutri },
        { id: `${marca}-v3`, alunoId, profissionalId: medico, tipo: 'MEDICO', status: 'ATIVO', convidadoPorId: medico },
      ],
    });
    await p.consentimento.create({
      data: { id: `${marca}-c`, alunoId, escopo: 'CLINICO', finalidade: 'Sonda', versaoTermo: '1' },
    });

    await p.exame.create({
      data: {
        id: exameId,
        alunoId,
        dataColeta: new Date(),
        registradoPorId: medico,
        laboratorio: 'Sonda',
        sexo: 'F',
        chaveArquivo: 'privado/laudo-secreto.pdf',
        mimeType: 'application/pdf',
      },
    });
    await p.resultadoMarcador.createMany({
      data: [
        // NUTRICIONAL: a nutricionista lê, e o alerta dela pode citar.
        { id: `${exameId}-f`, exameId, marcador: 'FERRITINA', valor: 22, classificacao: 'ATENCAO' },
        // Escopo MEDICO: nem ela lê, nem o alerta dela pode citar.
        { id: `${exameId}-t`, exameId, marcador: 'TSH', valor: 6.2, classificacao: 'ATENCAO' },
        // Gera aviso para os TRÊS papéis — é ele que prova o caso do médico.
        { id: `${exameId}-r`, exameId, marcador: 'TFG_ESTIMADA', valor: 52, classificacao: 'ATENCAO' },
      ],
    });

    clientes.personal = await entrar('personal@viviofit.com.br');
    clientes.nutri = await entrar('nutri@viviofit.com.br');
    clientes.medico = await entrar('medico@viviofit.com.br');
  });

  afterAll(async () => {
    await p.alertaClinico.deleteMany({ where: { alunoId } });
    await p.resultadoMarcador.deleteMany({ where: { exameId } });
    await p.exame.deleteMany({ where: { id: exameId } });
    await p.consentimento.deleteMany({ where: { alunoId } });
    await p.vinculo.deleteMany({ where: { alunoId } });
    await p.user.deleteMany({ where: { id: alunoId } });
    await p.$disconnect();
  });

  const marcadoresDe = async (quem: string): Promise<string[]> => {
    const r = await clientes[quem]!.from('ResultadoMarcador')
      .select('marcador')
      .eq('exameId', exameId);
    return ((r.data ?? []) as Array<{ marcador: string }>).map((m) => m.marcador).sort();
  };

  const alertasDe = async (quem: string) => {
    const r = await clientes[quem]!.from('AlertaClinico')
      .select('titulo,marcadorOrigem,exameId')
      .eq('alunoId', alunoId)
      .not('marcadorOrigem', 'is', null);
    return (r.data ?? []) as Array<{ marcadorOrigem: string | null; exameId: string | null }>;
  };

  it('o hash de senha não sai para ninguém', async () => {
    for (const quem of Object.keys(clientes)) {
      const r = await clientes[quem]!.from('User').select('id,senhaHash').eq('id', alunoId);
      expect(r.error, `${quem} conseguiu pedir senhaHash`).not.toBeNull();
    }
  });

  it('a chave do laudo não sai para ninguém pelo PostgREST', async () => {
    // Quem precisa do arquivo — médico e aluno — recebe URL assinada de quem
    // confere o papel. A chave crua não precisa sair do banco.
    for (const quem of Object.keys(clientes)) {
      const r = await clientes[quem]!.from('Exame').select('id,chaveArquivo').eq('id', exameId);
      expect(r.error, `${quem} conseguiu pedir chaveArquivo`).not.toBeNull();
    }
  });

  it('o resto do exame continua legível — não foi fechado demais', async () => {
    /*
      O par da asserção acima. Revogar a coluna errada fecharia a tela inteira
      do médico, e um arquivo só de "não vaza" ficaria verde com o app quebrado.
    */
    const r = await clientes.medico!.from('Exame')
      .select('id,laboratorio,dataColeta,sexo')
      .eq('id', exameId);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });

  it('cada papel lê só os marcadores do seu escopo', async () => {
    expect(await marcadoresDe('personal')).toEqual([]);
    // Ferritina é NUTRICIONAL; TSH é de escopo MEDICO.
    expect(await marcadoresDe('nutri')).toEqual(['FERRITINA', 'TFG_ESTIMADA']);
    expect(await marcadoresDe('medico')).toEqual(['FERRITINA', 'TFG_ESTIMADA', 'TSH']);
  });

  it('o alerta do personal não carrega marcador nem exame', async () => {
    // O coração do produto: ele recebe a conduta sem o número. Se um dia
    // aparecer marcador aqui, o diferencial virou o contrário de si mesmo.
    expect(await alertasDe('personal')).toEqual([]);
  });

  it('o alerta da nutricionista carrega o marcador só quando é do escopo dela', async () => {
    const dela = await alertasDe('nutri');
    for (const a of dela) {
      expect(a.marcadorOrigem).not.toBe('TSH');
    }
    // E o par positivo: o que é dela, ela vê — inclusive a origem.
    expect(dela.some((a) => a.marcadorOrigem === 'FERRITINA')).toBe(true);
  });

  it('o médico rastreia a origem de tudo', async () => {
    const dele = await alertasDe('medico');
    expect(dele.length).toBeGreaterThan(0);
    for (const a of dele) expect(a.exameId).toBe(exameId);
  });
});
