'use client';

import { Papel } from '@vivio/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Botao } from '../../components/ui';
import { useSessao } from '../../lib/sessao';

const NOME_DO_PAPEL: Partial<Record<Papel, string>> = {
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico(a)',
  ADMIN: 'Administrador',
};

export default function LayoutProfissional({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, sair } = useSessao();
  const router = useRouter();

  useEffect(() => {
    if (!carregando && !usuario) router.replace('/login');
  }, [usuario, carregando, router]);

  if (carregando || !usuario) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p style={{ color: 'var(--vv-texto-secundario)' }}>Carregando…</p>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header
        className="flex items-center justify-between border-b px-xl py-lg"
        style={{ borderColor: 'var(--vv-borda)', background: 'var(--vv-superficie)' }}
      >
        <Link href="/alunos" className="text-lg font-bold">
          Vívio<span style={{ color: 'var(--vv-acao-fundo)' }}>Fit</span>
        </Link>
        <div className="flex items-center gap-lg">
          <div className="text-right">
            <p className="text-sm font-semibold">{usuario.nome}</p>
            <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              {NOME_DO_PAPEL[usuario.papel] ?? usuario.papel}
            </p>
          </div>
          <Botao variante="neutra" onClick={() => void sair()}>
            Sair
          </Botao>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-xl">{children}</main>
    </div>
  );
}
