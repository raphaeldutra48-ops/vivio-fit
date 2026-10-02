import { describe, expect, it } from 'vitest';
import { formatarSerieAnterior } from './execucoes';
import { numeroDoCampo } from './numeros';

/**
 * A coluna ANTERIOR da tela de execução de treino.
 *
 * É meia dúzia de caracteres, e fica no lugar mais lido do aplicativo: ao lado
 * do campo em que a pessoa digita a carga de hoje, para decidir quanto colocar
 * na barra. O que ela mostra tem de se parecer com o que o campo aceita.
 *
 * E não se parecia. O campo pede VÍRGULA — é o que o teclado decimal brasileiro
 * oferece, e `numeroDoCampo` existe para lê-la —, e a coluna respondia "22.5kg",
 * com ponto, na mesma linha. Além de inconsistente, é ambíguo: "22.5" é lido por
 * muita gente como vinte e dois mil e quinhentos.
 */
const serie = (cargaKg: number, repsFeitas = 10) => ({
  serieNum: 1,
  repsFeitas,
  cargaKg,
  tipo: 'NORMAL' as const,
});

describe('formatarSerieAnterior', () => {
  it('carga decimal sai com vírgula, como o campo ao lado aceita', () => {
    expect(formatarSerieAnterior(serie(22.5, 8))).toBe('22,5kg x 8');
  });

  it('carga inteira não ganha casa decimal inventada', () => {
    // "80,0kg" sugere precisão que a anilha não tem, e ocupa espaço numa
    // coluna estreita que se lê de relance, entre duas séries.
    expect(formatarSerieAnterior(serie(80))).toBe('80kg x 10');
  });

  it('o que a coluna mostra, o campo consegue reler', () => {
    /*
      A ida e volta é o que garante a consistência: a pessoa olha a coluna,
      digita o mesmo no campo, e `numeroDoCampo` devolve o número de volta. Com
      ponto no meio, ela digitava o que leu e o schema recusava.
    */
    const texto = formatarSerieAnterior(serie(42.5)).split('kg')[0]!;
    expect(numeroDoCampo(texto)).toBe(42.5);
  });

  it('peso corporal e meio quilo continuam legíveis', () => {
    expect(formatarSerieAnterior(serie(0.5, 20))).toBe('0,5kg x 20');
    expect(formatarSerieAnterior(serie(100, 5))).toBe('100kg x 5');
  });
});
