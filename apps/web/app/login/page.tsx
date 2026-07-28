'use client';

import { Papel } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../components/ui';
import { useSessao } from '../../lib/sessao';

export default function Login() {
  const { entrar } = useSessao();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
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
      setErro(
        e instanceof ErroApi && e.codigo === 'CREDENCIAIS_INVALIDAS'
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Tente novamente.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-lg">
      <div className="w-full max-w-sm">
        <h1 className="mb-xs text-2xl font-bold">
          Vívio<span style={{ color: 'var(--vv-acao-fundo)' }}>Fit</span>
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
          </form>
        </Cartao>
      </div>
    </main>
  );
}
