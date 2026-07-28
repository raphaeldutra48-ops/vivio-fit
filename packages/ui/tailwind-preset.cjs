/**
 * Preset do Tailwind para apps/web.
 *
 * As cores são expostas como variável CSS para o tema escuro trocar sem
 * recompilar: o app alterna `data-tema="escuro"` no <html> e o valor muda.
 */
const { cores, espacamento, raio, tipografia } = require('./dist/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primaria: cores.primaria,
        secundaria: cores.secundaria,
        acao: cores.acao,
        nutricao: cores.nutricao,
        neutro: cores.neutro,
        // semânticas — leem do tema ativo
        fundo: 'var(--vv-fundo)',
        superficie: 'var(--vv-superficie)',
        borda: 'var(--vv-borda)',
        'texto-primario': 'var(--vv-texto-primario)',
        'texto-secundario': 'var(--vv-texto-secundario)',
        'acao-fundo': 'var(--vv-acao-fundo)',
        'acao-texto': 'var(--vv-acao-texto)',
      },
      spacing: Object.fromEntries(
        Object.entries(espacamento).map(([chave, valor]) => [chave, `${valor}px`]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(raio).map(([chave, valor]) => [chave, `${valor}px`]),
      ),
      fontFamily: { sans: tipografia.familia.texto.split(', ') },
      fontSize: Object.fromEntries(
        Object.entries(tipografia.tamanho).map(([chave, valor]) => [chave, `${valor / 16}rem`]),
      ),
      minHeight: { toque: '44px' },
      minWidth: { toque: '44px' },
    },
  },
};
