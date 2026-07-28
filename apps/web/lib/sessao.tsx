'use client';

import type { UsuarioAutenticado } from '@vivio/contracts';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { limparTokens, sdk } from './sdk';

interface Sessao {
  usuario: UsuarioAutenticado | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<UsuarioAutenticado>;
  sair: () => Promise<void>;
}

const ContextoSessao = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Revalida a sessão no servidor: o token pode ter sido revogado.
    sdk.me
      .obter()
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const resposta = await sdk.auth.login({ email, senha });
    const autenticado: UsuarioAutenticado = {
      id: resposta.usuario.id,
      nome: resposta.usuario.nome,
      email: resposta.usuario.email,
      papel: resposta.usuario.papel,
    };
    setUsuario(autenticado);
    return autenticado;
  }, []);

  const sair = useCallback(async () => {
    await sdk.auth.logout().catch(() => undefined);
    limparTokens();
    setUsuario(null);
    router.push('/login');
  }, [router]);

  return (
    <ContextoSessao.Provider value={{ usuario, carregando, entrar, sair }}>
      {children}
    </ContextoSessao.Provider>
  );
}

export function useSessao(): Sessao {
  const contexto = useContext(ContextoSessao);
  if (!contexto) throw new Error('useSessao precisa estar dentro de <SessaoProvider>');
  return contexto;
}
