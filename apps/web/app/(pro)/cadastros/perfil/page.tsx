'use client';

import { CONSELHO_POR_PAPEL, type MeuPerfil } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export default function MeuPerfilPagina() {
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [bio, setBio] = useState('');
  const [especialidades, setEspecialidades] = useState('');
  const [registro, setRegistro] = useState('');
  const [uf, setUf] = useState('CE');

  const carregar = async () => {
    const p = await sdk.me.perfil().catch(() => null);
    if (!p) {
      setErro('Não foi possível carregar seu perfil.');
      return;
    }
    setPerfil(p);
    setNome(p.nome);
    setTelefone(p.telefone ?? '');
    setBio(p.profissional?.bio ?? '');
    setEspecialidades((p.profissional?.especialidades ?? []).join(', '));
    setRegistro(p.profissional?.registroConselho ?? '');
    setUf(p.profissional?.ufRegistro ?? 'CE');
  };

  useEffect(() => {
    void carregar();
  }, []);

  const registroMudou =
    Boolean(perfil?.profissional) &&
    (registro.trim() !== perfil!.profissional!.registroConselho ||
      uf !== perfil!.profissional!.ufRegistro);
  const eraVerificado = Boolean(perfil?.profissional?.verificadoEm);

  async function salvar() {
    if (registroMudou && eraVerificado) {
      const ok = confirm(
        'Alterar o registro no conselho vai remover sua verificação, e você precisará ' +
          'passar por análise de novo.\n\nEnquanto isso você não recebe alunos novos nem ' +
          'mantém sua página pública no ar.\n\nContinuar?',
      );
      if (!ok) return;
    }

    setErro(null);
    setAviso(null);
    setSalvando(true);
    try {
      const salvo = await sdk.me.atualizarPerfil({
        nome: nome.trim(),
        telefone: telefone.trim() || undefined,
        bio: bio.trim() || undefined,
        especialidades: especialidades
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
        registroConselho: registro.trim() || undefined,
        ufRegistro: uf || undefined,
      });
      setPerfil(salvo);
      setAviso(
        registroMudou && eraVerificado
          ? 'Perfil salvo. Sua verificação foi removida e o registro entrará em nova análise.'
          : 'Perfil salvo.',
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!perfil) {
    return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Aviso tipo="info">Carregando…</Aviso>;
  }

  const conselho = perfil.profissional
    ? (CONSELHO_POR_PAPEL[perfil.profissional.tipo] ?? 'conselho')
    : null;

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Meu perfil</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Seus dados e o registro no conselho.
        </p>
      </div>

      {perfil.profissional && (
        <Cartao>
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <p className="font-semibold">Situação do registro</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {perfil.profissional.verificadoEm
                  ? `Verificado em ${new Date(perfil.profissional.verificadoEm).toLocaleDateString('pt-BR')}`
                  : perfil.profissional.recusadoEm
                    ? `Recusado: ${perfil.profissional.motivoRecusa}`
                    : 'Aguardando análise da plataforma'}
              </p>
            </div>
            <Etiqueta
              texto={
                perfil.profissional.verificadoEm
                  ? 'Verificado'
                  : perfil.profissional.recusadoEm
                    ? 'Recusado'
                    : 'Em análise'
              }
              cor={
                perfil.profissional.verificadoEm
                  ? 'var(--vv-sucesso)'
                  : perfil.profissional.recusadoEm
                    ? 'var(--vv-erro)'
                    : 'var(--vv-alerta)'
              }
            />
          </div>
        </Cartao>
      )}

      <Cartao>
        <div className="grid gap-md">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />

          <Campo
            rotulo="E-mail"
            value={perfil.email}
            readOnly
            disabled
            erro={perfil.emailVerificado ? undefined : 'E-mail ainda não confirmado'}
          />
          <p className="-mt-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            Trocar de e-mail exige confirmar o novo endereço — fale com o suporte.
          </p>

          <Campo
            rotulo="Telefone"
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />

          {perfil.profissional && (
            <>
              <div className="grid gap-md sm:grid-cols-[1fr_100px]">
                <Campo
                  rotulo={`Registro no ${conselho}`}
                  value={registro}
                  onChange={(e) => setRegistro(e.target.value)}
                />
                <label className="flex flex-col gap-xs">
                  <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    UF
                  </span>
                  <select
                    className="min-h-toque rounded-md border px-md"
                    style={entrada}
                    value={uf}
                    onChange={(e) => setUf(e.target.value)}
                  >
                    {UFS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {registroMudou && eraVerificado && (
                <Aviso tipo="erro">
                  Alterar o registro remove sua verificação e exige nova análise.
                </Aviso>
              )}

              <Campo
                rotulo="Especialidades, separadas por vírgula"
                value={especialidades}
                onChange={(e) => setEspecialidades(e.target.value)}
                placeholder="hipertrofia, reabilitação"
              />

              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Sobre você
                </span>
                <textarea
                  className="min-h-[110px] rounded-md border p-md"
                  style={entrada}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Formação, experiência e como você trabalha."
                />
              </label>
            </>
          )}
        </div>

        {erro && (
          <div className="mt-md">
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}
        {aviso && (
          <div className="mt-md">
            <Aviso tipo="info">{aviso}</Aviso>
          </div>
        )}

        <div className="mt-lg flex justify-end">
          <Botao onClick={salvar} disabled={nome.trim().length < 2 || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}
