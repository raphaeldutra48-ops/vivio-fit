'use client';

import { Papel, senhaSchema } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Marca } from '../../components/Marca';
import { Aviso, Botao, Campo, Cartao } from '../../components/ui';
import { sdk } from '../../lib/sdk';

/**
 * Escolha da senha nova, a partir do token do link.
 *
 * Diferente da confirmação de e-mail, aqui **não se dispara nada ao abrir a
 * página**: o token só é gasto quando a pessoa envia a senha. Consumir no
 * carregamento queimaria o link de quem abriu o e-mail no celular só para ver
 * do que se tratava.
 */
function Formulario() {
  const parametros = useSearchParams();
  const router = useRouter();
  const token = parametros.get('token');

  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A mesma regra que o servidor aplica, dita antes de tentar — `senhaSchema`
  // vem de `packages/contracts`, então não há como as duas divergirem.
  const problemaDaSenha = (() => {
    if (senha === '') return null;
    const r = senhaSchema.safeParse(senha);
    return r.success ? null : (r.error.issues[0]?.message ?? 'Senha inválida');
  })();

  const naoConfere = repetida !== '' && senha !== repetida;
  const podeEnviar =
    !!token && senha !== '' && repetida !== '' && !problemaDaSenha && !naoConfere && !enviando;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEnviar || !token) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await sdk.auth.redefinirSenha({ token, senha });
      router.push(r.usuario.papel === Papel.ALUNO ? '/login' : '/alunos');
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.message
          : 'Não foi possível redefinir a senha. Tente novamente.',
      );
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <Cartao>
        <p className="mb-xs font-semibold">Link incompleto</p>
        <Aviso tipo="erro">
          Este endereço não traz o código de redefinição. Abra o link direto do e-mail, sem
          copiar e colar pedaços.
        </Aviso>
        <div className="mt-lg">
          <Link href="/esqueci-senha" className="text-sm underline">
            Pedir um link novo
          </Link>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <form onSubmit={enviar} className="flex flex-col gap-lg">
        <div>
          <p className="mb-xs font-semibold">Escolha uma senha nova</p>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Ao salvar, todas as sessões abertas nesta conta serão encerradas.
          </p>
        </div>

        <Campo
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          erro={problemaDaSenha ?? undefined}
          onChange={(e) => setSenha(e.target.value)}
        />
        <Campo
          rotulo="Repita a senha"
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          erro={naoConfere ? 'as duas senhas precisam ser iguais' : undefined}
          onChange={(e) => setRepetida(e.target.value)}
        />

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <Botao type="submit" disabled={!podeEnviar}>
          {enviando ? 'Salvando…' : 'Salvar senha nova'}
        </Botao>

        <Link href="/login" className="text-center text-sm underline">
          Voltar para a entrada
        </Link>
      </form>
    </Cartao>
  );
}

export default function RedefinirSenha() {
  return (
    <main className="grid min-h-dvh place-items-center p-lg">
      <div className="w-full max-w-sm">
        <h1 className="mb-lg">
          <Marca tamanho={40} id="redefinir" descritivo />
        </h1>
        {/* `useSearchParams` exige limite de Suspense no App Router. */}
        <Suspense fallback={<Cartao>Carregando…</Cartao>}>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}
