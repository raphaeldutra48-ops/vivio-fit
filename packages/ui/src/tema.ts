import { cores, marca } from './tokens';

/**
 * Tokens semânticos. Componente usa ISTO, nunca a paleta crua.
 *
 * Regra que saiu da medição de contraste (ver test/contraste.spec.ts):
 * **cor viva recebe texto escuro**. Branco sobre o laranja de ação dá 2,59:1 —
 * reprovado. Texto escuro sobre o mesmo laranja dá 5,27:1.
 */
export interface Tema {
  fundo: string;
  superficie: string;
  superficieElevada: string;
  borda: string;
  textoPrimario: string;
  textoSecundario: string;

  /** Botão de ação (agendar, treinar, comprar) — laranja. */
  acaoFundo: string;
  acaoTexto: string;
  /** Botão primário — verde. */
  primariaFundo: string;
  primariaTexto: string;
  /** Contexto clínico — azul profundo. */
  clinicoFundo: string;
  clinicoTexto: string;

  /**
   * Lettering da marca. O verde e o laranja puros da logo dão 3,3:1 e 2,2:1
   * sobre fundo claro — o WCAG isenta logotipo, mas o nome no cabeçalho é
   * texto que se lê. O símbolo mantém a cor original; o lettering usa estes.
   */
  marcaTexto: string;
  marcaAcento: string;

  sucesso: string;
  alerta: string;
  erro: string;
}

export const temaClaro: Tema = {
  fundo: cores.neutro[50],
  superficie: cores.neutro[0],
  superficieElevada: cores.neutro[0],
  borda: cores.neutro[200],
  textoPrimario: cores.neutro[900],
  textoSecundario: cores.neutro[600],

  acaoFundo: cores.acao[500],
  acaoTexto: cores.neutro[900],
  primariaFundo: cores.primaria[900],
  primariaTexto: cores.neutro[0],
  clinicoFundo: cores.secundaria[700],
  clinicoTexto: cores.neutro[0],

  marcaTexto: cores.primaria[900],
  marcaAcento: cores.acao[900],

  sucesso: cores.feedback.sucesso,
  alerta: cores.feedback.alerta,
  erro: cores.feedback.erro,
};

export const temaEscuro: Tema = {
  fundo: cores.escuro.fundo,
  superficie: cores.escuro.superficie,
  superficieElevada: cores.escuro.elevada,
  borda: cores.escuro.borda,
  textoPrimario: cores.escuro.texto,
  textoSecundario: cores.escuro.textoFraco,

  acaoFundo: cores.acao[400],
  acaoTexto: cores.neutro[900],
  primariaFundo: cores.primaria[500],
  primariaTexto: cores.neutro[900],
  clinicoFundo: cores.secundaria[300],
  clinicoTexto: cores.secundaria[900],

  marcaTexto: cores.primaria[300],
  marcaAcento: cores.acao[300],

  sucesso: cores.primaria[500],
  alerta: '#F5A524',
  erro: '#FF6B70',
};

/**
 * Cor por área do app — ajuda o usuário a se localizar.
 * `cor` é para preenchimento (barra, ícone, badge);
 * `texto` é a variante que passa em AA sobre o fundo do tema.
 */
export interface CorDeArea {
  cor: string;
  texto: string;
}

export const areaTemaClaro = {
  treino: { cor: cores.primaria[700], texto: cores.primaria[900] },
  nutricao: { cor: cores.nutricao[500], texto: cores.nutricao[900] },
  clinico: { cor: cores.secundaria[700], texto: cores.secundaria[700] },
  consultoria: { cor: cores.acao[500], texto: cores.acao[900] },
} as const satisfies Record<string, CorDeArea>;

export const areaTemaEscuro = {
  treino: { cor: cores.primaria[500], texto: cores.primaria[300] },
  nutricao: { cor: cores.nutricao[500], texto: cores.nutricao[300] },
  clinico: { cor: cores.secundaria[300], texto: cores.secundaria[300] },
  consultoria: { cor: cores.acao[400], texto: cores.acao[300] },
} as const satisfies Record<string, CorDeArea>;

/**
 * Pares que o teste de contraste verifica. Adicionou par de cores na UI?
 * Registre aqui — é o que impede a paleta de degradar sem ninguém notar.
 */
export const paresDeContraste: Array<{
  nome: string;
  frente: string;
  fundo: string;
  minimo: number;
}> = [
  { nome: 'claro: texto primário', frente: temaClaro.textoPrimario, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: texto secundário', frente: temaClaro.textoSecundario, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: botão de ação', frente: temaClaro.acaoTexto, fundo: temaClaro.acaoFundo, minimo: 4.5 },
  { nome: 'claro: botão primário', frente: temaClaro.primariaTexto, fundo: temaClaro.primariaFundo, minimo: 4.5 },
  { nome: 'claro: botão clínico', frente: temaClaro.clinicoTexto, fundo: temaClaro.clinicoFundo, minimo: 4.5 },
  { nome: 'claro: erro', frente: temaClaro.erro, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: alerta', frente: temaClaro.alerta, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: área treino', frente: areaTemaClaro.treino.texto, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: área nutrição', frente: areaTemaClaro.nutricao.texto, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: área clínico', frente: areaTemaClaro.clinico.texto, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: área consultoria', frente: areaTemaClaro.consultoria.texto, fundo: temaClaro.fundo, minimo: 4.5 },

  { nome: 'escuro: texto primário', frente: temaEscuro.textoPrimario, fundo: temaEscuro.fundo, minimo: 4.5 },
  { nome: 'escuro: texto secundário', frente: temaEscuro.textoSecundario, fundo: temaEscuro.fundo, minimo: 4.5 },
  { nome: 'escuro: botão de ação', frente: temaEscuro.acaoTexto, fundo: temaEscuro.acaoFundo, minimo: 4.5 },
  { nome: 'escuro: botão primário', frente: temaEscuro.primariaTexto, fundo: temaEscuro.primariaFundo, minimo: 4.5 },
  { nome: 'escuro: botão clínico', frente: temaEscuro.clinicoTexto, fundo: temaEscuro.clinicoFundo, minimo: 4.5 },
  { nome: 'escuro: texto sobre superfície', frente: temaEscuro.textoPrimario, fundo: temaEscuro.superficie, minimo: 4.5 },
  { nome: 'escuro: área treino', frente: areaTemaEscuro.treino.texto, fundo: temaEscuro.fundo, minimo: 4.5 },
  { nome: 'escuro: área nutrição', frente: areaTemaEscuro.nutricao.texto, fundo: temaEscuro.fundo, minimo: 4.5 },
  { nome: 'escuro: área clínico', frente: areaTemaEscuro.clinico.texto, fundo: temaEscuro.fundo, minimo: 4.5 },
  { nome: 'escuro: área consultoria', frente: areaTemaEscuro.consultoria.texto, fundo: temaEscuro.fundo, minimo: 4.5 },

  // O lettering aparece como texto de verdade no cabeçalho e nas telas de
  // entrada, então segue a régua de texto. As cores puras da logo reprovam aqui
  // (3,3:1 e 2,2:1 no claro) — daí existirem `marcaTexto` e `marcaAcento`.
  { nome: 'claro: "Fit" da marca', frente: temaClaro.marcaTexto, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'claro: "i" de acento', frente: temaClaro.marcaAcento, fundo: temaClaro.fundo, minimo: 4.5 },
  { nome: 'escuro: "Fit" da marca', frente: temaEscuro.marcaTexto, fundo: temaEscuro.fundo, minimo: 4.5 },
  { nome: 'escuro: "i" de acento', frente: temaEscuro.marcaAcento, fundo: temaEscuro.fundo, minimo: 4.5 },
  // O símbolo é forma gráfica, não texto: a régua é 3:1 (WCAG 1.4.11).
  { nome: 'símbolo claro sobre o gradiente', frente: marca.claro, fundo: marca.gradienteInicio, minimo: 3 },
  { nome: 'símbolo sobre fundo claro', frente: marca.gradienteInicio, fundo: temaClaro.fundo, minimo: 3 },
  { nome: 'símbolo sobre fundo escuro', frente: marca.gradienteInicio, fundo: temaEscuro.fundo, minimo: 3 },
];
