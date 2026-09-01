'use client';

import { Papel } from '@vivio/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marca } from '../../components/Marca';
import { MenuLateral } from '../../components/MenuLateral';
import { Botao } from '../../components/ui';
import { ProvedorDeModoDiscreto, useModoDiscreto } from '../../lib/modo-discreto';
import { useSessao } from '../../lib/sessao';

const NOME_DO_PAPEL: Partial<Record<Papel, string>> = {
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico(a)',
  ADMIN: 'Administrador',
};

/**
 * O interruptor do modo discreto, no cabeçalho.
 *
 * No cabeçalho e não numa tela de ajustes porque o momento de usar é quando
 * alguém se aproxima: dois cliques a mais é tarde demais.
 */
function BotaoDiscreto() {
  const { discreto, alternar } = useModoDiscreto();
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={discreto}
      title={
        discreto
          ? 'Mostrar os dados dos alunos novamente'
          : 'Ocultar peso, medidas e dados clínicos da tela'
      }
      className="flex min-h-toque items-center gap-xs rounded-md border px-md text-sm"
      style={{
        borderColor: 'var(--vv-borda)',
        background: discreto ? 'var(--vv-superficie-elevada)' : 'transparent',
        color: discreto ? 'var(--vv-texto-primario)' : 'var(--vv-texto-secundario)',
      }}
    >
      <span aria-hidden>{discreto ? '🙈' : '👁️'}</span>
      <span className="hidden sm:inline">{discreto ? 'Dados ocultos' : 'Ocultar dados'}</span>
    </button>
  );
}

function PainelProfissional({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, sair } = useSessao();
  const router = useRouter();
  const [gavetaAberta, setGavetaAberta] = useState(false);

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
      {/* Cabeçalho e menu são a ferramenta, não o documento: saem no papel. */}
      <header
        data-nao-imprime
        className="sticky top-0 z-20 flex items-center justify-between border-b px-lg py-md"
        style={{ borderColor: 'var(--vv-borda)', background: 'var(--vv-superficie)' }}
      >
        <div className="flex items-center gap-md">
          {/* Em telas estreitas o menu vira gaveta */}
          <button
            type="button"
            aria-label={gavetaAberta ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={gavetaAberta}
            onClick={() => setGavetaAberta((v) => !v)}
            className="min-h-toque min-w-toque rounded-md border lg:hidden"
            style={{ borderColor: 'var(--vv-borda)' }}
          >
            ☰
          </button>
          <Link href="/resumo" aria-label="Vívio Fit — início">
            <Marca tamanho={26} id="cabecalho" />
          </Link>
        </div>

        <div className="flex items-center gap-md">
          <BotaoDiscreto />
          <div className="hidden text-right sm:block">
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

      <div className="flex">
        {/* Menu fixo no desktop */}
        <aside
          data-nao-imprime
          className="hidden w-[260px] shrink-0 border-r lg:block"
          style={{
            borderColor: 'var(--vv-borda)',
            background: 'var(--vv-superficie)',
            minHeight: 'calc(100dvh - 65px)',
          }}
        >
          <div className="sticky top-[65px] max-h-[calc(100dvh-65px)] overflow-y-auto">
            <MenuLateral papel={usuario.papel} />
          </div>
        </aside>

        {/* Gaveta no mobile */}
        {gavetaAberta && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button
              aria-label="Fechar menu"
              onClick={() => setGavetaAberta(false)}
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.5)' }}
            />
            <aside
              className="absolute left-0 top-0 h-full w-[280px] overflow-y-auto border-r"
              style={{ borderColor: 'var(--vv-borda)', background: 'var(--vv-superficie)' }}
            >
              <MenuLateral papel={usuario.papel} aoNavegar={() => setGavetaAberta(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-xl">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/*
  O provedor envolve o painel inteiro, e não cada tela: o modo discreto tem de
  sobreviver à navegação. Ligar na ficha da aluna e ver os números voltarem ao
  abrir o comparativo seria pior que não ter — a pessoa confiaria numa proteção
  que já tinha caído.
*/
export default function LayoutProfissional({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorDeModoDiscreto>
      <PainelProfissional>{children}</PainelProfissional>
    </ProvedorDeModoDiscreto>
  );
}
