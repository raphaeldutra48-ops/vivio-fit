'use client';

import { Papel } from '@vivio/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Marca } from '../../components/Marca';
import { Aviso, Botao, Cartao } from '../../components/ui';
import { sdk } from '../../lib/sdk';

type Estado = 'confirmando' | 'pronto' | 'falhou';

function Confirmacao() {
  const parametros = useSearchParams();
  const router = useRouter();
  const token = parametros.get('token');
  const [estado, setEstado] = useState<Estado>('confirmando');
  const [nome, setNome] = useState('');
  const [ehAluno, setEhAluno] = useState(false);
  // O token é de uso único: em dev o React monta duas vezes e a segunda
  // chamada gastaria o link, mostrando "inválido" para quem acabou de clicar.
  const jaTentou = useRef(false);

  useEffect(() => {
    if (!token) {
      setEstado('falhou');
      return;
    }
    if (jaTentou.current) return;
    jaTentou.current = true;

    sdk.auth
      .verificarEmail({ token })
      .then((r) => {
        setNome(r.usuario.nome.split(' ')[0]);
        setEhAluno(r.usuario.papel === Papel.ALUNO);
        setEstado('pronto');
      })
      .catch(() => setEstado('falhou'));
  }, [token]);

  return (
    <main className="grid min-h-dvh place-items-center p-lg">
      <div className="w-full max-w-sm">
        <h1 className="mb-xl">
          <Marca tamanho={36} id="verificar" />
        </h1>

        <Cartao>
          {estado === 'confirmando' && <Aviso tipo="info">Confirmando seu e-mail…</Aviso>}

          {estado === 'pronto' && (
            <>
              <p className="mb-xs text-lg font-semibold">Tudo certo, {nome}!</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {ehAluno
                  ? 'Seu e-mail está confirmado. Volte para o aplicativo e faça login.'
                  : 'Seu e-mail está confirmado e você já está conectado.'}
              </p>
              {!ehAluno && (
                <div className="mt-lg">
                  <Botao onClick={() => router.push('/alunos')}>Ir para o painel</Botao>
                </div>
              )}
            </>
          )}

          {estado === 'falhou' && (
            <>
              <p className="mb-xs text-lg font-semibold">Link inválido ou expirado</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Links de confirmação valem por 24 horas e só podem ser usados uma vez. Peça um novo
                na tela de entrada.
              </p>
              <div className="mt-lg">
                <Botao variante="neutra" onClick={() => router.push('/login')}>
                  Ir para a entrada
                </Botao>
              </div>
            </>
          )}
        </Cartao>
      </div>
    </main>
  );
}

export default function VerificarEmail() {
  // useSearchParams exige Suspense para a rota não virar totalmente dinâmica.
  return (
    <Suspense fallback={null}>
      <Confirmacao />
    </Suspense>
  );
}
