import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../app/manifest';
import { RegistraAplicativo } from '../components/RegistraAplicativo';

/**
 * O que faz o site ser instalável como aplicativo.
 *
 * Nada aqui aparece na tela, e é por isso que precisa de teste: um campo
 * errado no manifesto não quebra nada visível — o Android simplesmente deixa
 * de oferecer "instalar", e ninguém descobre por quê.
 */
describe('manifesto do aplicativo', () => {
  const m = manifest();

  it('tem o mínimo que o Android exige para oferecer a instalação', () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe('/');
    // Sem `standalone` o atalho abre dentro do navegador, com barra de
    // endereço — que é justamente o que não se quer.
    expect(m.display).toBe('standalone');

    const tamanhos = (m.icons ?? []).map((i) => i.sizes);
    expect(tamanhos).toContain('192x192');
    expect(tamanhos).toContain('512x512');
  });

  it('tem ícone recortável, senão o Android corta o desenho', () => {
    const mascara = (m.icons ?? []).filter((i) => i.purpose === 'maskable');
    expect(mascara).toHaveLength(1);
    expect(mascara[0]!.sizes).toBe('512x512');
  });

  it('o id é fixo: mudar o start_url não pode virar um app novo', () => {
    expect(m.id).toBe('/');
  });
});

describe('registro do trabalhador de fundo', () => {
  it('registra depois do carregamento, e não durante', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    const original = document.readyState;
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });

    render(<RegistraAplicativo />);
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledWith('/sw.js');

    Object.defineProperty(document, 'readyState', { value: original, configurable: true });
    vi.unstubAllGlobals();
  });

  it('navegador sem suporte não quebra a página', () => {
    vi.stubGlobal('navigator', {});
    expect(() => render(<RegistraAplicativo />)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
