/**
 * Paleta bruta do Vívio Fit.
 *
 * Não usar estes valores direto em componente — use os tokens semânticos de
 * `tema.ts`. Cor crua na tela é o que impede o tema escuro de funcionar.
 */
export const cores = {
  /** Verde-esmeralda: saúde, vitalidade. Área de TREINO. */
  primaria: {
    900: '#0B7A56',
    800: '#0D8A61',
    700: '#0F9D6D',
    500: '#22B981',
    300: '#6ED4AA',
    100: '#D7F2E7',
    50: '#EFFAF5',
  },
  /** Azul profundo: confiança, área CLÍNICA. */
  secundaria: {
    900: '#12293A',
    800: '#163348',
    700: '#173B5E',
    600: '#1B3A4B',
    300: '#7C9AB0',
    100: '#DCE6EE',
    50: '#F1F6FA',
  },
  /** Laranja: energia. Botões de AÇÃO e área de consultoria. */
  acao: {
    900: '#8F3A18',
    800: '#B34A22',
    700: '#E56A33',
    500: '#FF7A45',
    400: '#FF8C42',
    300: '#FFB08B',
    100: '#FFE5D9',
  },
  /** Azul-claro: área de NUTRIÇÃO. */
  nutricao: {
    900: '#134E5E',
    800: '#1C6E82',
    700: '#2A8CA3',
    500: '#3AA8C1',
    300: '#8AD0E0',
    100: '#DCF0F5',
  },
  neutro: {
    900: '#2B2E33',
    800: '#3A3E45',
    700: '#4A4E57',
    600: '#6B7280',
    400: '#9CA3AF',
    300: '#D1D5DB',
    200: '#E5E7EB',
    100: '#F3F4F6',
    50: '#FAFAFA',
    0: '#FFFFFF',
  },
  /** Superfícies do tema escuro. */
  escuro: {
    fundo: '#0E1216',
    superficie: '#171C22',
    elevada: '#1F252D',
    borda: '#2A313A',
    texto: '#E8EBEF',
    textoFraco: '#A3ACB9',
  },
  feedback: {
    sucesso: '#0B7A56',
    alerta: '#8A5A00',
    erro: '#C0343A',
    info: '#173B5E',
  },
} as const;

export const espacamento = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const raio = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const tipografia = {
  familia: {
    texto: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    numero: 'Inter, system-ui, sans-serif',
  },
  tamanho: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    /** Usado na tela de execução de treino: número grande, lido de longe. */
    display: 40,
  },
  peso: { normal: '400', medio: '500', forte: '600', extra: '700' },
} as const;

/**
 * Alvo mínimo de toque. A tela de treino é usada em pé, com a mão suada,
 * entre séries — 44pt é o piso, não o ideal.
 */
export const alvoToqueMin = 44;
