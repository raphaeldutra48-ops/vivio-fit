/**
 * Os compartimentos do Storage, lidos do SQL, para conferir contra o que o
 * cliente acredita.
 *
 * O tamanho máximo e a lista de formatos de cada tipo de mídia existem **duas
 * vezes**: em `LIMITES_MIDIA` (`packages/contracts`), que o app e o painel usam
 * para recusar o arquivo antes de enviar, e em `storage.buckets`
 * (`prisma/rls/32-armazenamento.sql`), onde o Storage recusa de verdade. Os
 * números batiam, por conferência de quem escreveu — e nada amarrava um ao
 * outro.
 *
 * As duas direções de divergência custam coisas diferentes, e as duas reprovam:
 *
 * - **O cliente aceita mais do que o balde.** Alguém escolhe um vídeo de 150 MB,
 *   espera o envio inteiro e o Storage devolve 413. O erro é de quem não tem
 *   como saber, e chega no fim.
 * - **O balde aceita mais do que o cliente.** O app recusa, mas a API não: quem
 *   fala direto com ela sobe um formato que a lista fechada deveria barrar. O
 *   comentário de `LIMITES_MIDIA.MATERIAL` diz por que a lista é fechada — o
 *   arquivo vai para a mão do aluno.
 *
 * Igualdade estrita, então, e não "cliente ⊆ balde": os dois números são cópia
 * um do outro, e a única maneira de eles não derivarem é não poderem diferir.
 */

export interface Compartimento {
  id: string;
  publico: boolean;
  limiteBytes: number;
  mimes: string[];
}

/**
 * Lê o `insert into storage.buckets … values (…)`.
 *
 * Os comentários saem antes: o bloco do SQL tem prosa com parênteses e vírgulas
 * ("creditadas na tela (CC-BY)"), e uma tupla lida no meio dela seria um balde
 * fantasma.
 */
export function lerCompartimentos(sql: string): Map<string, Compartimento> {
  const limpo = sql
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');

  const mapa = new Map<string, Compartimento>();
  const bloco = /insert\s+into\s+storage\.buckets[\s\S]*?values([\s\S]*?)on\s+conflict/i.exec(limpo);
  if (!bloco) return mapa;

  for (const m of bloco[1].matchAll(
    /\(\s*'(\w+)'\s*,\s*'\w+'\s*,\s*(true|false)\s*,\s*(\d+)\s*,\s*array\s*\[([^\]]*)\]\s*\)/gi,
  )) {
    mapa.set(m[1], {
      id: m[1],
      publico: m[2].toLowerCase() === 'true',
      limiteBytes: Number(m[3]),
      mimes: [...m[4].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    });
  }
  return mapa;
}

export interface LimiteDoCliente {
  tamanhoMaximoBytes: number;
  mimesAceitos: readonly string[];
}

/**
 * Compartimentos públicos que são decisão, e não descuido.
 *
 * O catálogo guarda demonstrações genéricas de exercício, iguais para todo
 * mundo e já creditadas na tela. Qualquer OUTRO compartimento público é mídia de
 * aluno ou de profissional exposta sem login.
 */
export const COMPARTIMENTOS_PUBLICOS_DE_PROPOSITO: ReadonlySet<string> = new Set(['catalogo']);

export function divergenciasDeCompartimento(
  noSql: Map<string, Compartimento>,
  limites: Readonly<Record<string, LimiteDoCliente>>,
  compartimentoPorTipo: Readonly<Record<string, string>>,
): string[] {
  const achados: string[] = [];
  const usados = new Set<string>();

  for (const [tipo, lim] of Object.entries(limites)) {
    const nome = compartimentoPorTipo[tipo];
    if (nome === undefined) {
      achados.push(`${tipo}: não tem compartimento em COMPARTIMENTO_POR_TIPO`);
      continue;
    }
    usados.add(nome);
    const c = noSql.get(nome);
    if (!c) {
      achados.push(`${tipo}: o compartimento "${nome}" não existe em storage.buckets`);
      continue;
    }
    if (c.limiteBytes !== lim.tamanhoMaximoBytes) {
      achados.push(
        `${tipo}: o cliente aceita ${lim.tamanhoMaximoBytes} bytes e o compartimento "${nome}" aceita ${c.limiteBytes}`,
      );
    }
    const cliente = new Set(lim.mimesAceitos);
    const balde = new Set(c.mimes);
    const soNoCliente = [...cliente].filter((m) => !balde.has(m));
    const soNoBalde = [...balde].filter((m) => !cliente.has(m));
    if (soNoCliente.length > 0) {
      achados.push(`${tipo}: o cliente oferece ${soNoCliente.join(', ')} e o compartimento "${nome}" recusa`);
    }
    if (soNoBalde.length > 0) {
      achados.push(`${tipo}: o compartimento "${nome}" aceita ${soNoBalde.join(', ')} e a lista do cliente não`);
    }
    if (c.publico && !COMPARTIMENTOS_PUBLICOS_DE_PROPOSITO.has(nome)) {
      achados.push(`${tipo}: o compartimento "${nome}" é PÚBLICO e guarda mídia que só quem recebeu deveria abrir`);
    }
  }

  for (const [id, c] of noSql) {
    if (usados.has(id)) continue;
    if (!COMPARTIMENTOS_PUBLICOS_DE_PROPOSITO.has(id)) {
      achados.push(`compartimento "${id}" existe no SQL e nenhum tipo de mídia aponta para ele`);
    } else if (!c.publico) {
      achados.push(`compartimento "${id}" devia ser público (é o catálogo) e está privado`);
    }
  }
  return achados;
}
