'use client';

import { Papel, senhaSchema } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../components/ui';
import { sdk } from '../../lib/sdk';

/** Cada conselho tem sigla própria — mostrar a certa evita registro digitado errado. */
const PROFISSOES = [
  { valor: Papel.PERSONAL, rotulo: 'Personal trainer', conselho: 'CREF' },
  { valor: Papel.NUTRICIONISTA, rotulo: 'Nutricionista', conselho: 'CRN' },
  { valor: Papel.MEDICO, rotulo: 'Médico', conselho: 'CRM' },
] as const;

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export default function Cadastrar() {
  const [tipo, setTipo] = useState<(typeof PROFISSOES)[number]['valor']>(Papel.PERSONAL);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [registroConselho, setRegistro] = useState('');
  const [ufRegistro, setUf] = useState('CE');
  const [telefone, setTelefone] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const profissao = PROFISSOES.find((p) => p.valor === tipo)!;
  const erroDaSenha = senha ? senhaSchema.safeParse(senha).error?.issues[0]?.message : undefined;
  const podeEnviar =
    nome.trim().length >= 2 &&
    email.includes('@') &&
    !erroDaSenha &&
    senha.length > 0 &&
    registroConselho.trim().length >= 3;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await sdk.auth.registrarProfissional({
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
        tipo,
        registroConselho: `${profissao.conselho} ${registroConselho.trim()}`,
        ufRegistro,
        telefone: telefone.trim() || undefined,
        especialidades: [],
      });
      setPronto(true);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'EMAIL_JA_CADASTRADO') {
        setErro('Este e-mail já tem conta. Tente entrar.');
      } else if (e instanceof ErroApi && e.codigo === 'CONFLITO') {
        // Um registro por conselho e UF: o banco tem unique em
        // (tipo, registroConselho, ufRegistro). Dizer "tente de novo" seria
        // mandar a pessoa repetir algo que nunca vai funcionar.
        setErro(
          `Já existe conta com o registro ${profissao.conselho} ${registroConselho.trim()}/${ufRegistro}. ` +
            'Confira o número, ou entre com a conta que já existe.',
        );
      } else if (e instanceof ErroApi && e.codigo === 'DADOS_INVALIDOS') {
        setErro('Confira os dados: algum campo não foi aceito.');
      } else if (e instanceof ErroApi && e.ehTemporario) {
        setErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
      } else {
        setErro('Não foi possível criar a conta agora. Se continuar, fale com o suporte.');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <main className="grid min-h-dvh place-items-center p-lg">
        <div className="w-full max-w-md">
          <h1 className="mb-xl text-2xl font-bold">
            Vívio<span style={{ color: 'var(--vv-acao-fundo)' }}>Fit</span>
          </h1>
          <Cartao>
            <p className="mb-xs text-lg font-semibold">Confirme seu e-mail</p>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Enviamos um link para <strong>{email}</strong>. Abra o link para ativar a conta — sem
              isso não é possível entrar.
            </p>
            <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Depois de confirmar, um administrador ainda precisa validar seu registro no{' '}
              {profissao.conselho} antes de você receber alunos.
            </p>
            <div className="mt-lg">
              <Link href="/login">
                <Botao variante="neutra">Ir para a entrada</Botao>
              </Link>
            </div>
          </Cartao>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center p-lg">
      <div className="w-full max-w-md">
        <h1 className="mb-xs text-2xl font-bold">
          Vívio<span style={{ color: 'var(--vv-acao-fundo)' }}>Fit</span>
        </h1>
        <p className="mb-xl text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Criar conta de profissional
        </p>

        <Cartao>
          <form onSubmit={enviar} className="flex flex-col gap-lg">
            <fieldset className="flex flex-col gap-sm">
              <legend className="mb-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Sou
              </legend>
              <div className="flex flex-wrap gap-sm">
                {PROFISSOES.map((p) => (
                  <button
                    key={p.valor}
                    type="button"
                    onClick={() => setTipo(p.valor)}
                    aria-pressed={tipo === p.valor}
                    className="min-h-toque rounded-md border px-lg font-semibold"
                    style={{
                      background:
                        tipo === p.valor ? 'var(--vv-acao-fundo)' : 'var(--vv-superficie)',
                      color: tipo === p.valor ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
                      borderColor: tipo === p.valor ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
                    }}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>
            </fieldset>

            <Campo
              rotulo="Nome completo"
              autoComplete="name"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />

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
              autoComplete="new-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              erro={erroDaSenha}
            />

            <div className="grid gap-md sm:grid-cols-[1fr_100px]">
              <Campo
                rotulo={`Registro no ${profissao.conselho}`}
                required
                inputMode="numeric"
                placeholder="000000"
                value={registroConselho}
                onChange={(e) => setRegistro(e.target.value)}
              />
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  UF
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={entrada}
                  value={ufRegistro}
                  onChange={(e) => setUf(e.target.value)}
                >
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Campo
              rotulo="Telefone (opcional)"
              type="tel"
              autoComplete="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />

            {erro && <Aviso tipo="erro">{erro}</Aviso>}

            <Botao type="submit" disabled={!podeEnviar || enviando}>
              {enviando ? 'Criando…' : 'Criar conta'}
            </Botao>

            <p className="text-center text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Já tem conta?{' '}
              <Link href="/login" className="underline">
                Entrar
              </Link>
            </p>
          </form>
        </Cartao>

        <p className="mt-lg text-center text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
          Aluno? O cadastro é pelo aplicativo no celular.
        </p>
      </div>
    </main>
  );
}
