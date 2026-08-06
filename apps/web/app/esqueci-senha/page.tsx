'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Marca } from '../../components/Marca';
import { Aviso, Botao, Campo, Cartao } from '../../components/ui';
import { sdk } from '../../lib/sdk';

/**
 * Pedido de redefinição de senha.
 *
 * A tela **não diz se o e-mail existe** — nem no sucesso, nem no erro. A API já
 * responde 204 em qualquer caso, e a tela não pode desfazer esse cuidado
 * mostrando "não encontramos essa conta". A lista de quem tem conta aqui é uma
 * lista de pessoas em tratamento de saúde.
 *
 * Por isso o `catch` também cai no mesmo estado de enviado: falha de rede é
 * indistinguível, para quem sonda, de "este e-mail não existe".
 */
export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    await sdk.auth.esqueciSenha({ email }).catch(() => undefined);
    setEnviando(false);
    setEnviado(true);
  }

  return (
    <main className="grid min-h-dvh place-items-center p-lg">
      <div className="w-full max-w-sm">
        <h1 className="mb-lg">
          <Marca tamanho={40} id="esqueci" descritivo />
        </h1>

        <Cartao>
          {enviado ? (
            <div className="flex flex-col gap-lg">
              <p className="font-semibold">Confira seu e-mail</p>
              <Aviso tipo="info">
                Se existir uma conta para <strong>{email}</strong>, o link de redefinição já está
                a caminho. Ele vale por 1 hora. Confira também a caixa de spam.
              </Aviso>
              <Link href="/login" className="text-center text-sm underline">
                Voltar para a entrada
              </Link>
            </div>
          ) : (
            <form onSubmit={enviar} className="flex flex-col gap-lg">
              <div>
                <p className="mb-xs font-semibold">Esqueci minha senha</p>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Informe o e-mail da conta. Enviaremos um link para você escolher uma senha nova.
                </p>
              </div>
              <Campo
                rotulo="E-mail"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Botao type="submit" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar link'}
              </Botao>
              <Link href="/login" className="text-center text-sm underline">
                Voltar para a entrada
              </Link>
            </form>
          )}
        </Cartao>
      </div>
    </main>
  );
}
