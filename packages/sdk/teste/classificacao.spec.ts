import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  MARCADORES,
  REFERENCIAS,
  SexoBiologico,
  classificarMarcador,
  faixaPara,
  type Marcador,
} from '@vivio/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * A classificação do SQL concorda com a do TypeScript, marcador a marcador.
 *
 * ## Por que existem duas, e por que elas precisam ser iguais
 *
 * A classificação é o que dispara o alerta clínico. Se viesse pronta do app,
 * um cliente adulterado gravaria "OTIMO" numa glicemia de 300 e o aviso nunca
 * nasceria — o médico veria o número, e o personal não receberia conduta.
 *
 * Então o banco recalcula na entrada. Mas a tela também precisa classificar,
 * para mostrar a cor antes de salvar. Duas implementações da mesma regra é
 * exatamente o arranjo que divergiu uma vez neste projeto, quando as regras de
 * alerta foram TRANSCRITAS para a tabela em vez de geradas — e ninguém notou
 * até a API parar de derivar em paralelo.
 *
 * Este arquivo é o que impede a repetição: percorre os 20 marcadores nos dois
 * sexos, em sete pontos ao redor de cada borda, e compara.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

describe.skipIf(!url || !anon)('classificação: SQL e TypeScript concordam', () => {
  let db: SupabaseClient;

  beforeAll(async () => {
    db = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({
      email: 'medico@viviofit.com.br',
      password: 'Senha@123',
    });
    if (error) throw new Error(`login: ${error.message}`);
  });

  /**
   * Sete valores por marcador e sexo, escolhidos onde a regra muda de resposta.
   *
   * Testar no meio da faixa não prova nada — as duas implementações acertam o
   * meio. O que separa uma da outra é a BORDA: `<` contra `<=` num limite é a
   * diferença entre "no laudo" e "crítico".
   */
  const pontosDe = (marcador: Marcador, sexo: SexoBiologico): number[] => {
    const lab = faixaPara(REFERENCIAS[marcador].laboratorial, sexo);
    const func = faixaPara(REFERENCIAS[marcador].funcional, sexo);
    const bordas = [lab.min, lab.max, func.min, func.max].filter(
      (v): v is number => v !== undefined,
    );
    const pontos = new Set<number>();
    for (const b of bordas) {
      // Exatamente na borda, e um passo de cada lado.
      pontos.add(b);
      pontos.add(Number((b - 0.01).toFixed(3)));
      pontos.add(Number((b + 0.01).toFixed(3)));
    }
    // E um valor absurdo de cada lado, que tem de ser CRITICO nos dois.
    pontos.add(0);
    pontos.add(99_999);
    return [...pontos].filter((v) => v >= 0);
  };

  it('os 20 marcadores, nos dois sexos, em toda borda', async () => {
    const divergencias: string[] = [];

    for (const marcador of MARCADORES) {
      for (const sexo of [SexoBiologico.M, SexoBiologico.F]) {
        for (const valor of pontosDe(marcador, sexo)) {
          const emTs = classificarMarcador(marcador, valor, sexo).classificacao;
          const { data, error } = await db.rpc('classificar_marcador', {
            p_marcador: marcador,
            p_valor: valor,
            p_sexo: sexo,
          });
          if (error) throw new Error(`${marcador}/${sexo}/${valor}: ${error.message}`);
          if (data !== emTs) {
            divergencias.push(`${marcador} ${sexo} valor=${valor}: SQL=${data} TS=${emTs}`);
          }
        }
      }
    }

    expect(divergencias).toEqual([]);
  });

  it('nada vira CRITICO pela faixa funcional', async () => {
    /*
      A regra que o produto inteiro apoia: só sair da faixa do LABORATÓRIO
      carimba vermelho. A funcional distingue ATENCAO de OTIMO dentro do que o
      laudo já considera normal.

      Trocar isso não quebraria nada visivelmente — só encheria a tela do
      médico de vermelho em exames normais, e o vermelho deixaria de significar
      alguma coisa.
    */
    for (const marcador of MARCADORES) {
      for (const sexo of [SexoBiologico.M, SexoBiologico.F]) {
        const lab = faixaPara(REFERENCIAS[marcador].laboratorial, sexo);
        const func = faixaPara(REFERENCIAS[marcador].funcional, sexo);
        // Um valor dentro do laudo e fora do ideal, quando existe essa folga.
        if (func.min !== undefined && lab.min !== undefined && func.min > lab.min) {
          const meio = (lab.min + func.min) / 2;
          const { data } = await db.rpc('classificar_marcador', {
            p_marcador: marcador,
            p_valor: meio,
            p_sexo: sexo,
          });
          expect(data, `${marcador}/${sexo} em ${meio}`).toBe('ATENCAO');
        }
      }
    }
  });

  it('marcador sem faixa cadastrada cai em ATENCAO, não em OTIMO', async () => {
    // O lado seguro de errar: um resultado que ninguém sabe ler merece um
    // olhar, não um carimbo de normal. Só acontece se o exportador ficar para
    // trás do TypeScript.
    const { data } = await db.rpc('classificar_marcador', {
      p_marcador: 'MARCADOR_QUE_NAO_EXISTE',
      p_valor: 42,
      p_sexo: 'F',
    });
    expect(data).toBe('ATENCAO');
  });
});
