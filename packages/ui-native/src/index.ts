import {
  alvoToqueMin,
  areaTemaClaro,
  areaTemaEscuro,
  espacamento,
  marca,
  raio,
  temaClaro,
  temaEscuro,
  tipografia,
  type Tema,
} from '@vivio/ui';

export { alvoToqueMin, espacamento, marca, raio, tipografia };
export type { Tema };

export type NomeDeTema = 'claro' | 'escuro';

export function obterTema(nome: NomeDeTema): Tema {
  return nome === 'escuro' ? temaEscuro : temaClaro;
}

export function obterAreaTema(nome: NomeDeTema) {
  return nome === 'escuro' ? areaTemaEscuro : areaTemaClaro;
}

/**
 * Estilos base do mobile.
 *
 * O botão de ação usa `alvoToqueMin` como altura mínima porque a tela de treino
 * é operada em pé, entre séries, muitas vezes com a mão suada.
 */
export function estilosBase(nome: NomeDeTema) {
  const tema = obterTema(nome);
  return {
    tela: {
      flex: 1,
      backgroundColor: tema.fundo,
      paddingHorizontal: espacamento.lg,
    },
    cartao: {
      backgroundColor: tema.superficie,
      borderRadius: raio.lg,
      borderWidth: 1,
      borderColor: tema.borda,
      padding: espacamento.lg,
    },
    titulo: {
      color: tema.textoPrimario,
      fontSize: tipografia.tamanho.xl,
      fontWeight: tipografia.peso.forte,
    },
    texto: {
      color: tema.textoPrimario,
      fontSize: tipografia.tamanho.base,
    },
    textoFraco: {
      color: tema.textoSecundario,
      fontSize: tipografia.tamanho.sm,
    },
    botaoAcao: {
      backgroundColor: tema.acaoFundo,
      minHeight: alvoToqueMin,
      borderRadius: raio.md,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: espacamento.xl,
    },
    botaoAcaoTexto: {
      color: tema.acaoTexto,
      fontSize: tipografia.tamanho.lg,
      fontWeight: tipografia.peso.forte,
    },
    /** Número grande da tela de execução — carga, repetição, cronômetro. */
    numeroDisplay: {
      color: tema.textoPrimario,
      fontSize: tipografia.tamanho.display,
      fontWeight: tipografia.peso.extra,
      fontVariant: ['tabular-nums'] as const,
    },
  };
}
