import type { UsuarioAutenticado } from '@vivio/contracts';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { obterTema, type NomeDeTema, type Tema } from '@vivio/ui-native';
import { limparTokens, sdk } from './sdk';

interface Sessao {
  usuario: UsuarioAutenticado | null;
  carregando: boolean;
  tema: Tema;
  nomeDoTema: NomeDeTema;
  entrar: (email: string, senha: string) => Promise<UsuarioAutenticado>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const esquema = useColorScheme();
  const nomeDoTema: NomeDeTema = esquema === 'dark' ? 'escuro' : 'claro';

  useEffect(() => {
    sdk.me
      .obter()
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await sdk.auth.login({ email, senha });
    const autenticado: UsuarioAutenticado = {
      id: r.usuario.id,
      nome: r.usuario.nome,
      email: r.usuario.email,
      papel: r.usuario.papel,
    };
    setUsuario(autenticado);
    return autenticado;
  }, []);

  const sair = useCallback(async () => {
    await sdk.auth.logout().catch(() => undefined);
    await limparTokens();
    setUsuario(null);
  }, []);

  return (
    <Contexto.Provider
      value={{ usuario, carregando, tema: obterTema(nomeDoTema), nomeDoTema, entrar, sair }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useSessao(): Sessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de <SessaoProvider>');
  return contexto;
}
