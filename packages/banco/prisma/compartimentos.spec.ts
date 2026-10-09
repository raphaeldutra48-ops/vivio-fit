import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPARTIMENTO_POR_TIPO, LIMITES_MIDIA } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { divergenciasDeCompartimento, lerCompartimentos, type LimiteDoCliente } from './compartimentos';

/**
 * Limite e formatos de mídia: o que o cliente acredita × o que o balde impõe.
 *
 * Como em toda checagem deste pacote, a primeira metade prova que ela SABE
 * acusar — amostra boa e amostra ruim pelo mesmo caminho —, e a segunda aplica
 * ao repositório. Sem a primeira, "nenhuma divergência" é também o que uma
 * leitura quebrada do SQL responde.
 */

// ---------------------------------------------------------------------------
// 1. A leitura do SQL e a comparação sabem acusar
// ---------------------------------------------------------------------------

const SQL_DE_AMOSTRA = `
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  /*
    Prosa com (parênteses), vírgulas, e até 'aspas' — não pode virar balde.
    ('fantasma', 'fantasma', true, 1, array['x/y'])
  */
  ('catalogo', 'catalogo', true, 52428800,
   array['image/png','video/mp4']),

  -- ('outro_fantasma', 'x', false, 1, array['a/b'])
  ('evolucao', 'evolucao', false, 15728640,
   array['image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public;
`;

const CLIENTE_DE_AMOSTRA: Record<string, LimiteDoCliente> = {
  FOTO: { tamanhoMaximoBytes: 15728640, mimesAceitos: ['image/jpeg', 'image/png'] },
};
const MAPA_DE_AMOSTRA = { FOTO: 'evolucao' };

describe('lerCompartimentos', () => {
  const lidos = lerCompartimentos(SQL_DE_AMOSTRA);

  it('lê cada balde com tamanho, visibilidade e formatos', () => {
    expect([...lidos.keys()]).toEqual(['catalogo', 'evolucao']);
    expect(lidos.get('evolucao')).toEqual({
      id: 'evolucao',
      publico: false,
      limiteBytes: 15728640,
      mimes: ['image/jpeg', 'image/png'],
    });
    expect(lidos.get('catalogo')!.publico).toBe(true);
  });

  it('balde escrito dentro de COMENTÁRIO não existe', () => {
    // O SQL real tem prosa com parênteses e aspas no meio do bloco; uma tupla
    // lida ali seria um compartimento que ninguém criou.
    expect(lidos.has('fantasma')).toBe(false);
    expect(lidos.has('outro_fantasma')).toBe(false);
  });

  it('SQL sem o insert devolve vazio, e a comparação acusa — não aprova', () => {
    expect(lerCompartimentos('select 1;').size).toBe(0);
    const achados = divergenciasDeCompartimento(new Map(), CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA);
    expect(achados.join('\n')).toMatch(/não existe em storage\.buckets/);
  });
});

describe('divergenciasDeCompartimento: amostra BOA', () => {
  it('cliente e balde iguais não acusam nada', () => {
    expect(divergenciasDeCompartimento(lerCompartimentos(SQL_DE_AMOSTRA), CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA)).toEqual([]);
  });

  it('a ordem dos formatos não importa', () => {
    const cliente = { FOTO: { tamanhoMaximoBytes: 15728640, mimesAceitos: ['image/png', 'image/jpeg'] } };
    expect(divergenciasDeCompartimento(lerCompartimentos(SQL_DE_AMOSTRA), cliente, MAPA_DE_AMOSTRA)).toEqual([]);
  });

  it('o catálogo público é decisão: não acusa por ser público', () => {
    expect(divergenciasDeCompartimento(lerCompartimentos(SQL_DE_AMOSTRA), CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA).join()).not.toMatch(/catalogo/);
  });
});

describe('divergenciasDeCompartimento: amostras RUINS', () => {
  const noSql = lerCompartimentos(SQL_DE_AMOSTRA);
  const com = (limite: Partial<LimiteDoCliente>) => ({
    FOTO: { ...CLIENTE_DE_AMOSTRA.FOTO!, ...limite },
  });

  it('cliente aceita mais bytes que o balde: o envio inteiro falha no fim', () => {
    const a = divergenciasDeCompartimento(noSql, com({ tamanhoMaximoBytes: 20 * 1024 * 1024 }), MAPA_DE_AMOSTRA);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/cliente aceita 20971520 bytes e o compartimento "evolucao" aceita 15728640/);
  });

  it('balde aceita mais bytes que o cliente: o teto do app deixa de ser o teto real', () => {
    expect(divergenciasDeCompartimento(noSql, com({ tamanhoMaximoBytes: 1024 }), MAPA_DE_AMOSTRA)).toHaveLength(1);
  });

  it('cliente oferece um formato que o balde recusa', () => {
    const a = divergenciasDeCompartimento(noSql, com({ mimesAceitos: ['image/jpeg', 'image/png', 'image/heic'] }), MAPA_DE_AMOSTRA);
    expect(a.join()).toMatch(/oferece image\/heic e o compartimento "evolucao" recusa/);
  });

  it('balde aceita um formato que a lista fechada do cliente não tem', () => {
    const a = divergenciasDeCompartimento(noSql, com({ mimesAceitos: ['image/jpeg'] }), MAPA_DE_AMOSTRA);
    expect(a.join()).toMatch(/aceita image\/png e a lista do cliente não/);
  });

  it('tipo apontando para compartimento que não existe', () => {
    expect(divergenciasDeCompartimento(noSql, CLIENTE_DE_AMOSTRA, { FOTO: 'evolcao' }).join()).toMatch(/"evolcao" não existe/);
  });

  it('tipo sem compartimento no mapa', () => {
    expect(divergenciasDeCompartimento(noSql, CLIENTE_DE_AMOSTRA, {}).join()).toMatch(/não tem compartimento/);
  });

  it('compartimento PÚBLICO guardando mídia de pessoa', () => {
    const publico = lerCompartimentos(SQL_DE_AMOSTRA.replace("'evolucao', 'evolucao', false", "'evolucao', 'evolucao', true"));
    expect(divergenciasDeCompartimento(publico, CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA).join()).toMatch(/é PÚBLICO/);
  });

  it('compartimento no SQL que nenhum tipo usa', () => {
    const a = divergenciasDeCompartimento(noSql, CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA);
    expect(a).toEqual([]);
    const comSobra = lerCompartimentos(SQL_DE_AMOSTRA.replace("('evolucao'", "('sobra', 'sobra', false, 1, array['a/b']),\n  ('evolucao'"));
    expect(divergenciasDeCompartimento(comSobra, CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA).join()).toMatch(/"sobra" existe no SQL e nenhum tipo/);
  });

  it('o catálogo deixando de ser público também é acusado', () => {
    const privado = lerCompartimentos(SQL_DE_AMOSTRA.replace("'catalogo', 'catalogo', true", "'catalogo', 'catalogo', false"));
    expect(divergenciasDeCompartimento(privado, CLIENTE_DE_AMOSTRA, MAPA_DE_AMOSTRA).join()).toMatch(/devia ser público/);
  });
});

// ---------------------------------------------------------------------------
// 2. O repositório de verdade
// ---------------------------------------------------------------------------

describe('limite e formatos de mídia: contracts × storage.buckets', () => {
  const sql = readFileSync(join(__dirname, 'rls', '32-armazenamento.sql'), 'utf8');
  const noSql = lerCompartimentos(sql);

  it('o SQL real foi lido: seis compartimentos, sendo só o catálogo público', () => {
    // Sem isto, uma leitura quebrada devolveria um mapa vazio e a comparação
    // abaixo acusaria tudo — o contrário também é verdade: com os dois lados
    // vazios ela aprovaria tudo.
    expect([...noSql.keys()].sort()).toEqual(['avatares', 'catalogo', 'evolucao', 'exames', 'exercicios', 'materiais']);
    expect([...noSql.values()].filter((c) => c.publico).map((c) => c.id)).toEqual(['catalogo']);
  });

  it('cada tipo de mídia tem exatamente o limite e os formatos do seu compartimento', () => {
    expect(
      divergenciasDeCompartimento(noSql, LIMITES_MIDIA, COMPARTIMENTO_POR_TIPO),
    ).toEqual([]);
  });

  it('cobre todos os tipos: nenhum fica fora da comparação', () => {
    expect(Object.keys(LIMITES_MIDIA).sort()).toEqual(Object.keys(COMPARTIMENTO_POR_TIPO).sort());
    expect(Object.keys(LIMITES_MIDIA).length).toBeGreaterThanOrEqual(5);
  });
});
