import { GRUPOS_MUSCULARES, criarExercicioSchema } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { EXERCICIOS_GLOBAIS } from './exercicios-globais';

/**
 * O catálogo é conteúdo do produto, não dado de demonstração — e conteúdo
 * errado aqui vira treino errado na academia. Estes testes existem porque a
 * lista é escrita à mão e vai crescer: sem eles, um grupo com nome trocado ou
 * um nome repetido só apareceria quando alguém montasse o treino.
 */
describe('biblioteca global de exercícios', () => {
  it('todo exercício passa no mesmo schema que a API exige de um criado à mão', () => {
    for (const [nome, grupoMuscular, equipamento, instrucoes] of EXERCICIOS_GLOBAIS) {
      const r = criarExercicioSchema.safeParse({ nome, grupoMuscular, equipamento, instrucoes });
      // A mensagem cita o nome: "falhou o item 87" não ajuda ninguém a achar.
      expect(r.success, `${nome}: ${r.success ? '' : r.error.issues[0]?.message}`).toBe(true);
    }
  });

  /*
    Nome repetido não quebra nada visivelmente — a semeadura é idempotente por
    nome, então o segundo simplesmente nunca entra. O personal procuraria por
    ele para sempre.
  */
  it('não há nome repetido', () => {
    const nomes = EXERCICIOS_GLOBAIS.map(([nome]) => nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  /*
    O filtro da tela é por grupo muscular. Um grupo sem exercício nenhum é uma
    aba vazia — que foi exatamente o que se viu em produção com "peito".
  */
  it('todo grupo muscular tem exercício, e nenhum grupo é raso demais', () => {
    const porGrupo = new Map<string, number>();
    for (const [, grupo] of EXERCICIOS_GLOBAIS) {
      porGrupo.set(grupo, (porGrupo.get(grupo) ?? 0) + 1);
    }

    for (const grupo of GRUPOS_MUSCULARES) {
      // Cinco é o mínimo para montar um treino do grupo sem repetir tudo.
      expect(porGrupo.get(grupo) ?? 0, `grupo ${grupo}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('não inventa grupo muscular fora da lista do contrato', () => {
    for (const [nome, grupo] of EXERCICIOS_GLOBAIS) {
      expect(GRUPOS_MUSCULARES, `${nome}`).toContain(grupo);
    }
  });

  /*
    A instrução é o que o aluno lê sozinho na academia. Uma linha genérica
    ("faça o movimento corretamente") ocupa o espaço sem ensinar nada, e é o
    tipo de coisa que passa despercebida numa lista de 156.
  */
  it('toda instrução tem conteúdo suficiente para orientar', () => {
    for (const [nome, , , instrucoes] of EXERCICIOS_GLOBAIS) {
      expect(instrucoes.length, `${nome}`).toBeGreaterThan(30);
      expect(instrucoes.trim().endsWith('.'), `${nome} deveria terminar em ponto`).toBe(true);
    }
  });

  it('todo exercício declara equipamento', () => {
    for (const [nome, , equipamento] of EXERCICIOS_GLOBAIS) {
      expect(equipamento.trim(), `${nome}`).not.toBe('');
    }
  });
});
