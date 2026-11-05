import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, expect } from 'vitest';
import { avisosProibidos, mensagemDoConsole } from './avisos-do-react';

// Sem isto, o DOM de um teste sobra para o seguinte e `getByLabelText` acha
// dois campos "Dose" que vieram de renderizações diferentes.
afterEach(cleanup);

/*
  Quanto `findBy…` e `waitFor` esperam a tela aparecer: 5 s, e não o 1 s padrão.

  A prova de "montar plano alimentar" passava sozinha três vezes em três e
  reprovava com a suíte inteira rodando: o primeiro render da tela, a busca do
  catálogo e o debounce somavam mais de 1 s numa máquina ocupada — e o runner do
  CI é mais lento que esta. Esperar mais não atrasa nada quando a tela aparece
  antes (a espera termina no instante em que acha), e não enfraquece prova
  nenhuma: afirmação de ausência não usa `waitFor` para esperar algo que não vem.
*/
configure({ asyncUtilTimeout: 5000 });

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
 * O critério mora em `avisos-do-react.ts`, com prova própria de amostra boa e
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
  const proibidos = avisosProibidos(mensagens);
  if (proibidos.length > 0) {
    const lista = proibidos.map((m) => `  ${m}`).join('\n');
    expect.fail(`Aviso do React que não pode aparecer:\n${lista}`);
  }
});
