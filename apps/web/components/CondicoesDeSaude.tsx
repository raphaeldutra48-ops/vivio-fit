'use client';

import {
  GravidadeCondicao,
  Papel,
  RegiaoCorpo,
  ROTULO_GRAVIDADE,
  ROTULO_REGIAO,
  ROTULO_TIPO_CONDICAO,
  TIPOS_COM_REGIAO,
  TipoCondicao,
  descreverCondicao,
  type CondicaoResumo,
} from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { useSessao } from '../lib/sessao';
import { Aviso, Botao, Campo, Cartao } from './ui';

const COR_DA_GRAVIDADE: Record<GravidadeCondicao, string> = {
  LEVE: 'var(--vv-texto-secundario)',
  MODERADA: 'var(--vv-alerta)',
  GRAVE: 'var(--vv-erro)',
};

const seletor = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

/**
 * Condições de saúde na ficha do aluno.
 *
 * Os três profissionais leem — é a diferença em relação ao exame, e a razão de
 * ser da seção: um personal que não sabe da lesão no ombro prescreve
 * desenvolvimento militar. Só o médico vê o formulário de registro.
 */
export function CondicoesDeSaude({
  alunoId,
  aoMudar,
}: {
  alunoId: string;
  /** Avisa a ficha para os alertas serem buscados de novo — eles nascem daqui. */
  aoMudar?: () => void;
}) {
  const { usuario } = useSessao();
  const ehMedico = usuario?.papel === Papel.MEDICO;

  const [condicoes, setCondicoes] = useState<CondicaoResumo[]>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [mostrarResolvidas, setMostrarResolvidas] = useState(false);

  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoCondicao>(TipoCondicao.LESAO);
  const [descricao, setDescricao] = useState('');
  const [regiao, setRegiao] = useState<RegiaoCorpo>(RegiaoCorpo.JOELHO);
  const [gravidade, setGravidade] = useState<GravidadeCondicao>(GravidadeCondicao.MODERADA);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    sdk.condicoes
      .listar(alunoId)
      .then(setCondicoes)
      // 403 aqui é falta de consentimento clínico, não falha: a seção some.
      .catch(() => setIndisponivel(true));
  }, [alunoId]);

  const exigeRegiao = TIPOS_COM_REGIAO.includes(tipo);
  const podeSalvar = descricao.trim().length >= 3;

  async function registrar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      const nova = await sdk.condicoes.registrar(alunoId, {
        tipo,
        descricao: descricao.trim(),
        regiao: exigeRegiao ? regiao : undefined,
        gravidade,
      });
      setCondicoes((atual) => [nova, ...atual]);
      setDescricao('');
      setAberto(false);
      aoMudar?.();
    } catch {
      setErro('Não foi possível registrar a condição.');
    } finally {
      setSalvando(false);
    }
  }

  async function resolver(id: string) {
    const atualizada = await sdk.condicoes.resolver(alunoId, id).catch(() => null);
    if (!atualizada) return;

    setCondicoes((atual) => atual.map((c) => (c.id === id ? atualizada : c)));
    // A alta apaga os alertas que a condição gerava; sem avisar, eles ficariam
    // na tela até alguém recarregar.
    aoMudar?.();
  }

  if (indisponivel) return null;

  const ativas = condicoes.filter((c) => c.resolvidaEm === null);
  const visiveis = mostrarResolvidas ? condicoes : ativas;

  if (condicoes.length === 0 && !ehMedico) return null;

  return (
    <section>
      <div className="mb-md flex flex-wrap items-center justify-between gap-md">
        <h2 className="text-lg font-semibold">
          Condições de saúde
          {ativas.length > 0 && (
            <span
              className="ml-sm text-sm font-normal"
              style={{ color: 'var(--vv-texto-secundario)' }}
            >
              {ativas.length} {ativas.length === 1 ? 'ativa' : 'ativas'}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-md">
          {condicoes.length > ativas.length && (
            <button
              onClick={() => setMostrarResolvidas((v) => !v)}
              className="text-sm underline"
              style={{ color: 'var(--vv-texto-secundario)' }}
            >
              {mostrarResolvidas ? 'Ocultar resolvidas' : 'Mostrar resolvidas'}
            </button>
          )}
          {/* Só o médico registra: diagnosticar não é papel de quem prescreve
              treino ou dieta. */}
          {ehMedico && (
            <Botao variante="neutra" onClick={() => setAberto((v) => !v)}>
              {aberto ? 'Cancelar' : '+ Registrar condição'}
            </Botao>
          )}
        </div>
      </div>

      {aberto && ehMedico && (
        <Cartao className="mb-md">
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Tipo
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={seletor}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoCondicao)}
              >
                {Object.values(TipoCondicao).map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_CONDICAO[t]}
                  </option>
                ))}
              </select>
            </label>

            {exigeRegiao && (
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Região do corpo
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={seletor}
                  value={regiao}
                  onChange={(e) => setRegiao(e.target.value as RegiaoCorpo)}
                >
                  {Object.values(RegiaoCorpo).map((r) => (
                    <option key={r} value={r}>
                      {ROTULO_REGIAO[r]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Gravidade
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={seletor}
                value={gravidade}
                onChange={(e) => setGravidade(e.target.value as GravidadeCondicao)}
              >
                {Object.values(GravidadeCondicao).map((g) => (
                  <option key={g} value={g}>
                    {ROTULO_GRAVIDADE[g]}
                  </option>
                ))}
              </select>
            </label>

            <div className={exigeRegiao ? 'lg:col-span-4' : 'lg:col-span-2'}>
              <Campo
                rotulo="O que é, em uma linha"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Tendinopatia do supraespinhal à direita"
              />
            </div>
          </div>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Ao salvar, a equipe recebe a orientação correspondente — o personal, o que evitar no
            treino; o nutricionista, o que ajustar no plano.
          </p>

          <div className="mt-md flex justify-end">
            <Botao disabled={!podeSalvar || salvando} onClick={() => void registrar()}>
              {salvando ? 'Salvando…' : 'Registrar'}
            </Botao>
          </div>
        </Cartao>
      )}

      {visiveis.length === 0 ? (
        <Aviso tipo="info">Nenhuma condição registrada.</Aviso>
      ) : (
        <div className="flex flex-col gap-md">
          {visiveis.map((c) => {
            const resolvida = c.resolvidaEm !== null;
            const cor = resolvida ? 'var(--vv-borda)' : COR_DA_GRAVIDADE[c.gravidade];

            return (
              <Cartao key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-sm font-semibold">
                      <span
                        aria-hidden
                        className="inline-block rounded-pill"
                        style={{ width: 10, height: 10, background: cor }}
                      />
                      <span style={resolvida ? { color: 'var(--vv-texto-secundario)' } : undefined}>
                        {c.descricao}
                      </span>
                    </p>
                    <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {descreverCondicao(c)} · registrada por {c.registradoPor.nome}
                    </p>
                    {c.observacao && (
                      <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {c.observacao}
                      </p>
                    )}
                    {resolvida && (
                      <p className="mt-xs text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                        Resolvida em {new Date(c.resolvidaEm!).toLocaleDateString('pt-BR')}
                        {c.resolvidaPor ? ` por ${c.resolvidaPor.nome}` : ''}
                      </p>
                    )}
                  </div>

                  {ehMedico && !resolvida && (
                    <Botao variante="neutra" onClick={() => void resolver(c.id)}>
                      Dar alta
                    </Botao>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </section>
  );
}
