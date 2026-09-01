'use client';

import { Papel } from '@vivio/contracts';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSessao } from '../lib/sessao';

export default function Inicio() {
  const { usuario, carregando } = useSessao();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    if (!usuario) router.replace('/login');
    else if (usuario.papel === Papel.ALUNO) router.replace('/login?apenasProfissional=1');
    else router.replace('/resumo');
  }, [usuario, carregando, router]);

  return (
    <main className="grid min-h-dvh place-items-center">
      <p style={{ color: 'var(--vv-texto-secundario)' }}>Carregando…</p>
    </main>
  );
}
