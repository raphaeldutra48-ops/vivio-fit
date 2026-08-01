import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Pendência 8, virada em teste.
 *
 * Com `nodeLinker: hoisted` (pendência 7), faixas diferentes de React entre a
 * web e o mobile geram duas cópias instaladas, e o build da web morre com
 * `Cannot read properties of null (reading 'useContext')` — erro que não diz
 * nada sobre a causa e custa uma tarde para rastrear.
 *
 * A regra era um parágrafo na documentação, que ninguém lê ao rodar
 * `pnpm add react@latest` num app só. Aqui ela falha na hora, com o motivo.
 */

const APPS = ['../package.json', '../../mobile/package.json'] as const;

const versoesDe = (caminho: string): Record<string, string> => {
  const url = new URL(caminho, import.meta.url);
  const pacote = JSON.parse(readFileSync(url, 'utf8')) as {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const todas = { ...pacote.dependencies, ...pacote.devDependencies };
  return {
    nome: pacote.name,
    react: todas.react ?? '(ausente)',
    'react-dom': todas['react-dom'] ?? '(ausente)',
  };
};

describe('versões do React entre web e mobile', () => {
  const [web, mobile] = APPS.map(versoesDe) as [
    Record<string, string>,
    Record<string, string>,
  ];

  it('web e mobile declaram a MESMA versão de react', () => {
    expect(
      `${mobile.nome} usa react ${mobile.react}`,
      'Atualize os dois apps juntos — ver pendência 8.',
    ).toBe(`${mobile.nome} usa react ${web.react}`);
  });

  it('web e mobile declaram a MESMA versão de react-dom', () => {
    expect(mobile['react-dom']).toBe(web['react-dom']);
  });

  /**
   * Faixa (`^19.2.3`) é o que permite as duas cópias aparecerem: cada app
   * resolve para um patch diferente sem que ninguém edite nada.
   */
  it('a versão é exata, sem ^ nem ~', () => {
    for (const app of [web, mobile]) {
      for (const pacote of ['react', 'react-dom'] as const) {
        expect(app[pacote], `${app.nome} → ${pacote}`).toMatch(/^\d+\.\d+\.\d+$/);
      }
    }
  });
});
