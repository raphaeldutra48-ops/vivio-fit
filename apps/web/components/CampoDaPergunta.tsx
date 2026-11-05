'use client';

import type { PerguntaResumo } from '@vivio/contracts';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export interface RespostaEmEdicao {
  valor?: string;
  valores: string[];
}

/**
 * O campo de resposta de uma pergunta da anamnese, por tipo.
 *
 * Vive fora da página por dois motivos. O primeiro já estava escrito lá: definido
 * dentro do componente da página, cada tecla criava uma função nova, o React
 * remontava os campos e o cursor saltava para fora do que estava sendo digitado.
 * O segundo é a prova: regra de interface se prova sem o roteador.
 *
 * ## O que mudou em 05/11/2026
 *
 * **Nome acessível.** A pergunta aparece num `<p>` acima, sem ligação nenhuma com
 * o campo. Com leitor de tela, o profissional ouvia "caixa de texto" sem saber de
 * qual pergunta. Agora todo campo leva o texto da pergunta como rótulo, e os
 * grupos de escolha são `role="group"` com o mesmo nome — "Sim" e "Não" sozinhos
 * não dizem a que respondem.
 *
 * **Número como texto.** Era `<input type="number">`. Nesse tipo, quando o
 * navegador não aceita a vírgula, `value` volta VAZIO — e "72,5" de peso ou
 * cintura virava resposta em branco, sem aviso. A resposta é guardada como o
 * texto que a pessoa escreveu, então o campo é texto com teclado decimal, que é o
 * padrão do resto do projeto (`lib/campos.ts`).
 */
export function CampoDaPergunta({
  pergunta,
  resposta,
  aoResponder,
}: {
  pergunta: PerguntaResumo;
  resposta: RespostaEmEdicao;
  aoResponder: (mudanca: Partial<RespostaEmEdicao>) => void;
}) {
  const estiloEscolha = (ativo: boolean) => ({
    background: ativo ? 'var(--vv-acao-fundo)' : 'var(--vv-superficie)',
    color: ativo ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
    borderColor: ativo ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
  });

  if (pergunta.tipo === 'TEXTO_LONGO') {
    return (
      <textarea
        aria-label={pergunta.texto}
        className="min-h-[70px] w-full rounded-md border p-md"
        style={entrada}
        value={resposta.valor ?? ''}
        onChange={(e) => aoResponder({ valor: e.target.value })}
      />
    );
  }

  if (pergunta.tipo === 'SIM_NAO') {
    return (
      <div role="group" aria-label={pergunta.texto} className="flex gap-sm">
        {[
          { valor: 'sim', rotulo: 'Sim' },
          { valor: 'nao', rotulo: 'Não' },
        ].map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => aoResponder({ valor: resposta.valor === o.valor ? '' : o.valor })}
            aria-pressed={resposta.valor === o.valor}
            className="min-h-toque rounded-md border px-xl font-semibold"
            style={estiloEscolha(resposta.valor === o.valor)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    );
  }

  if (pergunta.tipo === 'ESCOLHA_UNICA') {
    return (
      <div role="group" aria-label={pergunta.texto} className="flex flex-wrap gap-sm">
        {pergunta.opcoes.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => aoResponder({ valor: resposta.valor === o ? '' : o })}
            aria-pressed={resposta.valor === o}
            className="min-h-toque rounded-md border px-lg"
            style={estiloEscolha(resposta.valor === o)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  if (pergunta.tipo === 'ESCOLHA_MULTIPLA') {
    return (
      <div role="group" aria-label={pergunta.texto} className="flex flex-wrap gap-sm">
        {pergunta.opcoes.map((o) => {
          const marcada = resposta.valores.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() =>
                aoResponder({
                  valores: marcada
                    ? resposta.valores.filter((v) => v !== o)
                    : [...resposta.valores, o],
                })
              }
              aria-pressed={marcada}
              className="min-h-toque rounded-md border px-lg"
              style={estiloEscolha(marcada)}
            >
              {marcada ? '✓ ' : ''}
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      aria-label={pergunta.texto}
      type={pergunta.tipo === 'DATA' ? 'date' : 'text'}
      inputMode={pergunta.tipo === 'NUMERO' ? 'decimal' : undefined}
      className="min-h-toque w-full rounded-md border px-md"
      style={entrada}
      value={resposta.valor ?? ''}
      onChange={(e) => aoResponder({ valor: e.target.value })}
    />
  );
}
