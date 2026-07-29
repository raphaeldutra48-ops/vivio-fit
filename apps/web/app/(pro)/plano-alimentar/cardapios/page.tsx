'use client';

import type { ModeloCardapioCompleto, ModeloCardapioResumo, VinculoResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

export default function Cardapios() {
  const [modelos, setModelos] = useState<ModeloCardapioResumo[]>([]);
  const [aberto, setAberto] = useState<ModeloCardapioCompleto | null>(null);
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [alunoParaAplicar, setAlunoParaAplicar] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);

  // Salvar um plano existente como molde
  const [planos, setPlanos] = useState<{ id: string; nome: string; aluno: string }[]>([]);
  const [planoEscolhido, setPlanoEscolhido] = useState('');
  const [nomeDoModelo, setNomeDoModelo] = useState('');

  async function recarregar() {
    try {
      setModelos(await sdk.cardapios.listar());
      setErro(null);
    } catch {
      setErro('Não foi possível carregar seus cardápios.');
    }
  }

  useEffect(() => {
    void recarregar();
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then(async (lista) => {
        setAlunos(lista);
        setAlunoParaAplicar((a) => a || (lista[0]?.contraparte.id ?? ''));

        // Junta os planos de todos os alunos — é de onde nasce um molde novo.
        const todos = await Promise.all(
          lista.map(async (v) => {
            const doAluno = await sdk.dietas.listar(v.contraparte.id).catch(() => []);
            return doAluno.map((p) => ({ id: p.id, nome: p.nome, aluno: v.contraparte.nome }));
          }),
        );
        setPlanos(todos.flat());
      })
      .catch(() => undefined);
  }, []);

  async function salvarDoPlano() {
    if (!planoEscolhido || nomeDoModelo.trim().length < 2) return;
    setErro(null);
    try {
      await sdk.cardapios.salvarDoPlano({ planoDietaId: planoEscolhido, nome: nomeDoModelo });
      setMensagem('Cardápio salvo no seu acervo.');
      setNomeDoModelo('');
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar o cardápio.');
    }
  }

  async function aplicar(modeloId: string) {
    if (!alunoParaAplicar) return;
    setAplicando(true);
    setErro(null);
    setMensagem(null);
    try {
      const plano = await sdk.cardapios.aplicar(alunoParaAplicar, modeloId, { ativar: true });
      const nome = alunos.find((v) => v.contraparte.id === alunoParaAplicar)?.contraparte.nome;
      setMensagem(`"${plano.nome}" aplicado em ${nome}. Ajustar a dieta dele não altera o molde.`);
    } catch (e) {
      setErro(
        e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE'
          ? 'Este aluno não autorizou o compartilhamento dos dados de nutrição.'
          : 'Não foi possível aplicar o cardápio.',
      );
    } finally {
      setAplicando(false);
    }
  }

  async function remover(id: string) {
    await sdk.cardapios.remover(id).catch(() => undefined);
    setAberto(null);
    await recarregar();
  }

  const seletor = {
    background: 'var(--vv-superficie)',
    borderColor: 'var(--vv-borda)',
    color: 'var(--vv-texto-primario)',
  };

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Cardápios</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Moldes reutilizáveis. Aplicar num paciente cria um plano independente — ajustar a dieta
          dele não altera o molde.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mensagem && <Aviso tipo="info">{mensagem}</Aviso>}

      <Cartao>
        <p className="mb-md font-semibold">Salvar um plano existente como cardápio</p>
        <div className="grid gap-md sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Plano de origem
            </span>
            <select
              className="min-h-toque rounded-md border px-md"
              style={seletor}
              value={planoEscolhido}
              onChange={(e) => setPlanoEscolhido(e.target.value)}
            >
              <option value="">Escolha um plano</option>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {p.aluno}
                </option>
              ))}
            </select>
          </label>
          <Campo
            rotulo="Nome do cardápio"
            value={nomeDoModelo}
            onChange={(e) => setNomeDoModelo(e.target.value)}
            placeholder="Cutting 1.800 kcal"
          />
          <Botao
            disabled={!planoEscolhido || nomeDoModelo.trim().length < 2}
            onClick={() => void salvarDoPlano()}
          >
            Salvar
          </Botao>
        </div>
      </Cartao>

      <div className="flex flex-wrap items-end gap-md">
        <label className="flex flex-col gap-xs">
          <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Aplicar em
          </span>
          <select
            className="min-h-toque rounded-md border px-md"
            style={seletor}
            value={alunoParaAplicar}
            onChange={(e) => setAlunoParaAplicar(e.target.value)}
          >
            {alunos.length === 0 && <option value="">Nenhum aluno ativo</option>}
            {alunos.map((v) => (
              <option key={v.contraparte.id} value={v.contraparte.id}>
                {v.contraparte.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {modelos.length === 0 && (
        <Aviso tipo="info">
          Nenhum cardápio no seu acervo ainda. Monte uma dieta para um paciente e salve como
          cardápio — daí em diante ela vira ponto de partida para os próximos.
        </Aviso>
      )}

      <div className="flex flex-col gap-md">
        {modelos.map((m) => (
          <Cartao key={m.id}>
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div>
                <p className="font-semibold">{m.nome}</p>
                {m.descricao && (
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {m.descricao}
                  </p>
                )}
                <p className="text-sm tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {Math.round(m.macrosTotais.kcal)} kcal
                  {m.kcalAlvo ? ` (meta ${m.kcalAlvo})` : ''} · {m.totalRefeicoes}{' '}
                  {m.totalRefeicoes === 1 ? 'refeição' : 'refeições'} · P
                  {Math.round(m.macrosTotais.proteinaG)} C{Math.round(m.macrosTotais.carboidratoG)} G
                  {Math.round(m.macrosTotais.gorduraG)}
                </p>
              </div>

              <div className="flex flex-wrap gap-sm">
                <Botao
                  variante="neutra"
                  onClick={async () =>
                    setAberto(aberto?.id === m.id ? null : await sdk.cardapios.obter(m.id))
                  }
                >
                  {aberto?.id === m.id ? 'Fechar' : 'Ver'}
                </Botao>
                <Botao disabled={!alunoParaAplicar || aplicando} onClick={() => void aplicar(m.id)}>
                  Aplicar
                </Botao>
                <Botao variante="perigo" onClick={() => void remover(m.id)}>
                  Excluir
                </Botao>
              </div>
            </div>

            {aberto?.id === m.id && (
              <div className="mt-lg flex flex-col gap-md">
                {aberto.refeicoes.map((r) => (
                  <div key={r.id}>
                    <p className="font-semibold">
                      {r.horarioSugerido ? `${r.horarioSugerido} · ` : ''}
                      {r.nome}
                      <span
                        className="ml-sm font-normal tabular-nums"
                        style={{ color: 'var(--vv-texto-secundario)' }}
                      >
                        {Math.round(r.macros.kcal)} kcal
                      </span>
                    </p>
                    <ul className="mt-xs flex flex-col gap-xs text-sm">
                      {r.itens.map((i) => (
                        <li key={i.id} className="flex justify-between">
                          <span>
                            {i.alimento.nome}
                            <span
                              className="ml-sm text-xs"
                              style={{ color: 'var(--vv-texto-secundario)' }}
                            >
                              {i.quantidadeG} g
                            </span>
                          </span>
                          <span className="tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
                            {Math.round(i.macros.kcal)} kcal
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Cartao>
        ))}
      </div>
    </div>
  );
}
