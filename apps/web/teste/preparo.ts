import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect } from 'vitest';
import { avisosDeDomInvalido, mensagemDoConsole } from './dom-valido';

// Sem isto, o DOM de um teste sobra para o seguinte e `getByLabelText` acha
// dois campos "Dose" que vieram de renderizações diferentes.
afterEach(cleanup);

/**
 * Aninhamento de HTML inválido REPROVA o teste, em vez de virar linha de log.
 *
 * O React avisa no `console.error` quando a árvore não é HTML válido — `<p>`
 * dentro de `<p>`, `<ul>` dentro de `<p>`, `<div>` dentro de `<button>`. O
 * aviso termina com "This will cause a hydration error", e é literal: o
 * navegador fecha o elemento proibido ao encontrar o filho, monta uma árvore
 * diferente da que o React renderizou, e com SSR o Next acusa mismatch. Na
 * prática o conteúdo hasteado para fora perde o estilo do pai.
 *
 * Isto existe porque a suíte JÁ gritava isso em duas linhas, e durante semanas
 * ninguém leu — eu inclusive, que filtrava a saída por "Tests" e "FAIL". Aviso
 * que não reprova é aviso que não existe: ou vira portão, ou vira ruído.
 *
 * O critério mora em `dom-valido.ts`, com prova própria de amostra boa e
 * amostra ruim. Aqui só a coleta.
 */
let erroOriginal: typeof console.error;
let mensagens: string[] = [];

beforeEach(() => {
  mensagens = [];
  erroOriginal = console.error;
  console.error = (...args: unknown[]) => {
    mensagens.push(mensagemDoConsole(args));
    erroOriginal(...args);
  };
});

afterEach(() => {
  console.error = erroOriginal;
  const invalidos = avisosDeDomInvalido(mensagens);
  if (invalidos.length > 0) {
    const lista = invalidos.map((m) => `  ${m}`).join('\n');
    expect.fail(`HTML inválido renderizado (quebra a hidratação em produção):\n${lista}`);
  }
});
