'use client';

import type { AlimentoResumo } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Campo, Cartao } from '../../../../components/ui';
import { useListaBuscada } from '../../../../lib/busca';
import { sdk } from '../../../../lib/sdk';

export default function Alimentos() {
  const [grupos, setGrupos] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  /*
    Não há mais `setErro` aqui: a única falha desta tela é a da busca, e quem a
    reporta é o gancho. Manter um estado que ninguém escreve é convidar o próximo
    a achar que existe tratamento de erro onde não existe.
  */
  /*
    Falhar a lista de grupos deixava o filtro com "Todos" e nada mais.

    Parece inofensivo, e não é: sem os grupos o filtro se torna inútil
    justamente na tabela de onde sai o cálculo de todo cardápio — e quem procura
    "leguminosas" conclui que o catálogo não tem a categoria, quando o que houve
    foi a rede. A busca por nome continua funcionando; o que muda é a tela dizer
    que o filtro está incompleto.
  */
  const [falhouOsGrupos, setFalhouOsGrupos] = useState(false);

  useEffect(() => {
    setFalhouOsGrupos(false);
    sdk.alimentos
      .grupos()
      .then(setGrupos)
      .catch(() => setFalhouOsGrupos(true));
  }, []);

  /*
    Pelo gancho: ele espera o dedo parar e descarta resposta de busca antiga.
    Sem isso eram seis requisições por palavra digitada, e a lista podia acabar
    mostrando o resultado de "fran" com o campo escrito "frango".
  */
  const { itens: alimentos, falhou: falhouABusca } = useListaBuscada<AlimentoResumo>(
    () => sdk.alimentos.listar({ q: busca || undefined, grupo: grupo || undefined, limit: 100 }),
    [busca, grupo],
  );

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Alimentos</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Composição nutricional por 100 g. É desta tabela que sai o cálculo dos cardápios.
        </p>
      </div>

      {falhouOsGrupos && (
        <Aviso tipo="erro">
          Não foi possível carregar os grupos de alimentos, então o filtro por categoria ficou
          vazio. A busca por nome continua funcionando — recarregue para ter o filtro de volta.
        </Aviso>
      )}

      <div className="grid gap-md sm:grid-cols-[1fr_220px]">
        <Campo
          rotulo="Buscar alimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="frango, arroz, aveia…"
        />
        <label className="flex flex-col gap-xs">
          <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Grupo
          </span>
          <select
            className="min-h-toque rounded-md border px-md"
            style={{
              background: 'var(--vv-superficie)',
              borderColor: 'var(--vv-borda)',
              color: 'var(--vv-texto-primario)',
            }}
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
          >
            <option value="">{falhouOsGrupos ? 'Todos (filtro indisponível)' : 'Todos'}</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      {falhouABusca && (
        <Aviso tipo="erro">
          Não foi possível carregar a tabela de alimentos. A lista abaixo pode estar vazia por isso,
          e não por falta de resultado.
        </Aviso>
      )}

      <Cartao className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 640 }}>
          <thead>
            <tr style={{ color: 'var(--vv-texto-secundario)' }}>
              <th className="pb-sm text-left font-semibold">Alimento</th>
              <th className="pb-sm text-right font-semibold">kcal</th>
              <th className="pb-sm text-right font-semibold">Prot</th>
              <th className="pb-sm text-right font-semibold">Carb</th>
              <th className="pb-sm text-right font-semibold">Gord</th>
              <th className="pb-sm text-right font-semibold">Fibra</th>
            </tr>
          </thead>
          <tbody>
            {alimentos.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--vv-borda)' }}>
                <td className="py-sm">
                  <span className="font-medium">{a.nome}</span>
                  {a.medidaCaseira && (
                    <span className="block text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {a.medidaCaseira}
                      {a.medidaGramas ? ` · ${a.medidaGramas} g` : ''}
                    </span>
                  )}
                </td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.kcal}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.proteinaG}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.carboidratoG}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.gorduraG}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.fibraG}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {alimentos.length === 0 && (
          <p className="pt-md" style={{ color: 'var(--vv-texto-secundario)' }}>
            Nenhum alimento encontrado.
          </p>
        )}
      </Cartao>

      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        Valores por 100 g · fonte TACO
      </p>
    </div>
  );
}
