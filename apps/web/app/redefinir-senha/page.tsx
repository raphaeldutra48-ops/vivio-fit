'use client';

import { Papel, senhaSchema } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Marca } from '../../components/Marca';
import { Aviso, Botao, Campo, Cartao } from '../../components/ui';
import { sdk } from '../../lib/sdk';

/**
 * Escolha da senha nova.
 *
 * O que prova a posse do e-mail deixou de ser um `?token=` na URL e passou a
 * ser a SESSÃO que o link do Supabase abre sozinho ao carregar a página. Por
 * isso o gate aqui é "existe sessão?", e não "veio token?".
 *
 * Uma propriedade se perdeu, e vale registrar: antes o link só era gasto ao
 * enviar a senha, então abrir o e-mail no celular só para ver do que se
 * tratava não queimava nada. Agora abrir já consome. Não há como manter as
 * duas coisas — o que autentica a troca é a sessão, e a sessão nasce da
 * abertura.
 */
function Formulario() {
  const parametros = useSearchParams();
  const router = useRouter();
  // O Supabase avisa link expirado por aqui.
  const erroDoLink = parametros.get('error_description') ?? parametros.get('error');
  const [temSessao, setTemSessao] = useState<boolean | null>(null);

  useEffect(() => {
    if (erroDoLink) {
      setTemSessao(false);
      return;
    }
    void sdk.auth.sessaoAberta().then(setTemSessao);
  }, [erroDoLink]);

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
    temSessao === true &&
    senha !== '' &&
    repetida !== '' &&
    !problemaDaSenha &&
    !naoConfere &&
    !enviando;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEnviar) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await sdk.auth.redefinirSenha({ token: '', senha });
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

  if (temSessao === null) {
    return (
      <Cartao>
        <Aviso tipo="info">Conferindo o link…</Aviso>
      </Cartao>
    );
  }

  if (!temSessao) {
    return (
      <Cartao>
        <p className="mb-xs font-semibold">Link expirado ou já usado</p>
        <Aviso tipo="erro">
          Este link não vale mais. Abra sempre o link direto do e-mail, sem copiar e colar
          pedaços, e peça um novo se já tiver passado do prazo.
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
