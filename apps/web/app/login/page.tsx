'use client';

import { Papel } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Marca } from '../../components/Marca';
import { Aviso, Botao, Campo, Cartao } from '../../components/ui';
import { sdk } from '../../lib/sdk';
import { useSessao } from '../../lib/sessao';

export default function Login() {
  const { entrar } = useSessao();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [faltaConfirmar, setFaltaConfirmar] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setFaltaConfirmar(false);
    setReenviado(false);
    setEnviando(true);
    try {
      const usuario = await entrar(email, senha);
      if (usuario.papel === Papel.ALUNO) {
        setErro('Esta área é do profissional. Alunos usam o aplicativo no celular.');
        return;
      }
      router.push('/alunos');
    } catch (e) {
      // O código é estável; o texto da API pode mudar sem quebrar a tela.
      if (e instanceof ErroApi && e.codigo === 'EMAIL_NAO_VERIFICADO') {
        setFaltaConfirmar(true);
        return;
      }
      setErro(
        e instanceof ErroApi && e.codigo === 'CREDENCIAIS_INVALIDAS'
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Tente novamente.',
      );
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    await sdk.auth.reenviarVerificacao({ email }).catch(() => undefined);
    // Sempre "enviado": a API não diz se o e-mail existe, e a tela não inventa.
    setReenviado(true);
  }

  return (
    <main className="grid min-h-dvh place-items-center p-lg">
      <div className="w-full max-w-sm">
        <h1 className="mb-lg">
          <Marca tamanho={40} id="login" descritivo />
        </h1>
        <p className="mb-xl text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Painel do profissional
        </p>

        <Cartao>
          <form onSubmit={enviar} className="flex flex-col gap-lg">
            <Campo
              rotulo="E-mail"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Campo
              rotulo="Senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <Botao type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Botao>

            <p className="text-center text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Ainda não tem conta?{' '}
              <Link href="/cadastrar" className="underline">
                Criar conta de profissional
              </Link>
            </p>
          </form>
        </Cartao>

        {faltaConfirmar && (
          <div className="mt-lg">
            <Cartao>
              <p className="mb-xs font-semibold">Confirme seu e-mail</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Enviamos um link para <strong>{email}</strong> quando a conta foi criada. Ele
                precisa ser aberto antes do primeiro acesso.
              </p>
              <div className="mt-lg">
                {reenviado ? (
                  <Aviso tipo="info">
                    Se existir uma conta pendente para este e-mail, o link já está a caminho.
                    Confira também a caixa de spam.
                  </Aviso>
                ) : (
                  <Botao type="button" variante="neutra" onClick={reenviar}>
                    Reenviar o link
                  </Botao>
                )}
              </div>
            </Cartao>
          </div>
        )}
      </div>
    </main>
  );
}
