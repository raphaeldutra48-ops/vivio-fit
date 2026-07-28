import type { UsuarioAutenticado } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { obterTema, type NomeDeTema, type Tema } from '@vivio/ui-native';
import { apagar, gravar, ler } from './armazenamento';
import { limparTokens, sdk } from './sdk';

const CHAVE_USUARIO = 'vivio.usuario';

interface Sessao {
  usuario: UsuarioAutenticado | null;
  carregando: boolean;
  /** true quando a sessão foi restaurada do aparelho por falta de rede. */
  offline: boolean;
  tema: Tema;
  nomeDoTema: NomeDeTema;
  entrar: (email: string, senha: string) => Promise<UsuarioAutenticado>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);
  const esquema = useColorScheme();
  const nomeDoTema: NomeDeTema = esquema === 'dark' ? 'escuro' : 'claro';

  useEffect(() => {
    void (async () => {
      try {
        const atual = await sdk.me.obter();
        setUsuario(atual);
        setOffline(false);
        await gravar(CHAVE_USUARIO, atual);
      } catch (erro) {
        // Sem rede NÃO é sessão inválida. Deslogar o aluno porque a academia
        // não tem sinal seria o pior momento possível para pedir login.
        const semRede = erro instanceof ErroApi && erro.ehTemporario;
        const guardado = await ler<UsuarioAutenticado>(CHAVE_USUARIO);

        if (semRede && guardado) {
          setUsuario(guardado);
          setOffline(true);
        } else {
          setUsuario(null);
          await apagar(CHAVE_USUARIO);
        }
      } finally {
        setCarregando(false);
      }
    })();
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
    setOffline(false);
    await gravar(CHAVE_USUARIO, autenticado);
    return autenticado;
  }, []);

  const sair = useCallback(async () => {
    await sdk.auth.logout().catch(() => undefined);
    await limparTokens();
    await apagar(CHAVE_USUARIO);
    setUsuario(null);
  }, []);

  return (
    <Contexto.Provider
      value={{
        usuario,
        carregando,
        offline,
        tema: obterTema(nomeDoTema),
        nomeDoTema,
        entrar,
        sair,
      }}
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
