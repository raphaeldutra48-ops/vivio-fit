import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarreiraDeErro } from '../src/componentes/BarreiraDeErro';

/**
 * A barreira de erro — a diferença entre "algo quebrou" e uma tela branca.
 *
 * Sem ela, um erro de render derruba a árvore toda e o React não deixa nada:
 * nem texto, nem botão, nem caminho de volta. Não é hipótese — aconteceu duas
 * vezes durante a escrita desta suíte, por UM campo ausente numa resposta de
 * API. Em produção a causa é a mesma (campo novo chegando `null`, resposta
 * parcial, formato mudado de um lado só), e quem vê é alguém no meio de um
 * treino.
 *
 * O que se prova aqui é o comportamento inteiro: a falha é contida, a tela diz
 * o que aconteceu e o que está salvo, e há saída.
 */
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario: null, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

/** Componente que quebra sob comando — o dublê de "resposta inesperada". */
function Quebrado({ quebra }: { quebra: boolean }) {
  if (quebra) {
    // Exatamente o formato do erro real: leitura de campo que não veio.
    const semNada = undefined as unknown as { itens: string[] };
    return <>{semNada.itens.length}</>;
  }
  return <>tela inteira</>;
}

const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  // O React imprime o erro capturado; silenciar mantém a saída da suíte legível
  // sem esconder falha de teste nenhuma.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('barreira de erro', () => {
  it('não aparece quando nada quebra', () => {
    render(
      <BarreiraDeErro>
        <Quebrado quebra={false} />
      </BarreiraDeErro>,
    );

    expect(textoDaTela()).toContain('tela inteira');
    expect(textoDaTela()).not.toMatch(/algo quebrou/i);
  });

  it('tela quebrada vira explicação, e não tela branca', () => {
    render(
      <BarreiraDeErro>
        <Quebrado quebra />
      </BarreiraDeErro>,
    );

    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument();
  });

  it('promete só o que pode cumprir: o enviado está salvo, o digitado não', () => {
    /*
      A parte mais fácil de errar por generosidade. Dizer "nada foi perdido"
      seria mentira na hora em que a pessoa tem menos motivo para acreditar no
      app — e ela descobriria sozinha, ao voltar e não encontrar o que digitou.
    */
    render(
      <BarreiraDeErro>
        <Quebrado quebra />
      </BarreiraDeErro>,
    );

    expect(textoDaTela()).toMatch(/o que já tinha sido enviado está salvo/i);
    expect(textoDaTela()).toMatch(/o que você estava digitando aqui agora, não/i);
  });

  it('tem saída: "tentar de novo" remonta a tela', () => {
    /*
      Sem o botão, a única saída é fechar o app — e no meio de um treino isso
      custa o treino. Aqui o mesmo componente volta a funcionar porque a causa
      passou; se ela não tiver passado, a barreira simplesmente segura de novo.
    */
    /*
      A causa é controlada de fora, e não por um contador interno: o React tenta
      renderizar de novo antes de entregar o erro à barreira, e um componente que
      "só quebra na primeira vez" passaria direto — provando o contrário do que
      se quer.
    */
    const rede = { caiu: true };
    function Instavel() {
      if (rede.caiu) throw new Error('campo ausente');
      return <>tela inteira</>;
    }

    render(
      <BarreiraDeErro>
        <Instavel />
      </BarreiraDeErro>,
    );
    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument();

    rede.caiu = false;
    fireEvent.click(screen.getByLabelText(/tentar carregar a tela de novo/i));

    expect(textoDaTela()).toContain('tela inteira');
    expect(textoDaTela()).not.toMatch(/algo quebrou/i);
  });

  it('registra a falha no console — e não a manda para fora do aparelho', () => {
    /*
      Daqui sai dado de saúde: nome de exercício, relato de dor, valor de exame.
      Enviar para um serviço de erro é decisão do dono do produto, não do
      componente — então fica local até que ela seja tomada.
    */
    render(
      <BarreiraDeErro>
        <Quebrado quebra />
      </BarreiraDeErro>,
    );

    expect(console.error).toHaveBeenCalledWith('[vivio] tela quebrou:', expect.any(Error));
  });
});
