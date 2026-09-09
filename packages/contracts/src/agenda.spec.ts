import { describe, expect, it } from 'vitest';
import {
  fimDoCompromisso,
  montarHorariosLivres,
  type IntervaloOcupado,
  type JanelaDisponivel,
} from './agenda';

/**
 * As vagas do dia, sem banco no meio.
 *
 * A conta roda nos dois lados — a API e o SDK sobre o Postgres — e um erro
 * aqui não dá erro em lugar nenhum: oferece um horário que já está ocupado, e
 * quem descobre é o profissional, com duas pessoas na porta.
 */
const DIA = '2027-03-15';

const janela = (
  horaInicio: string,
  horaFim: string,
  duracaoMin = 60,
  id = 'j1',
): JanelaDisponivel => ({ id, diaSemana: 1, horaInicio, horaFim, duracaoMin });

const ocupado = (de: string, ate: string): IntervaloOcupado => ({
  inicioEm: `${DIA}T${de}:00.000Z`,
  fimEm: `${DIA}T${ate}:00.000Z`,
});

const horas = (livres: { inicioEm: string }[]): string[] =>
  livres.map((h) => h.inicioEm.slice(11, 16));

describe('montarHorariosLivres', () => {
  it('parte da janela e devolve as vagas inteiras', () => {
    const livres = montarHorariosLivres({
      dataISO: DIA,
      janelas: [janela('08:00', '11:00')],
      ocupados: [],
    });
    expect(horas(livres)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('a vaga que não cabe inteira na janela não é oferecida', () => {
    /*
      Janela até 11:30 com atendimento de 60 minutos: a vaga das 11h terminaria
      às 12h, meia hora depois de o profissional ter ido embora.
    */
    const livres = montarHorariosLivres({
      dataISO: DIA,
      janelas: [janela('08:00', '11:30')],
      ocupados: [],
    });
    expect(horas(livres)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('compromisso e bloqueio somem da lista', () => {
    const livres = montarHorariosLivres({
      dataISO: DIA,
      janelas: [janela('08:00', '12:00')],
      ocupados: [ocupado('09:00', '09:30'), ocupado('11:00', '12:00')],
    });
    expect(horas(livres)).toEqual(['08:00', '10:00']);
  });

  it('encostar não é colidir', () => {
    /*
      Um atendimento que termina às 10h e uma vaga que começa às 10h não se
      sobrepõem. Tratar como colisão apagaria uma vaga por atendimento, e a
      agenda de quem atende de hora em hora ficaria pela metade.
    */
    const livres = montarHorariosLivres({
      dataISO: DIA,
      janelas: [janela('09:00', '11:00')],
      ocupados: [ocupado('08:00', '09:00'), ocupado('11:00', '12:00')],
    });
    expect(horas(livres)).toEqual(['09:00', '10:00']);
  });

  it('a duração pedida vence a da janela', () => {
    // Uma janela de 60 minutos com atendimentos de 30 cabe o dobro de gente.
    const livres = montarHorariosLivres({
      dataISO: DIA,
      janelas: [janela('08:00', '10:00')],
      ocupados: [],
      duracaoMin: 30,
    });
    expect(horas(livres)).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });

  it('manhã e tarde saem em ordem de relógio, e não de janela', () => {
    // A tela lê de cima para baixo como uma linha do tempo.
    const livres = montarHorariosLivres({
      dataISO: DIA,
      janelas: [janela('14:00', '16:00', 60, 'tarde'), janela('08:00', '10:00', 60, 'manha')],
      ocupados: [],
    });
    expect(horas(livres)).toEqual(['08:00', '09:00', '14:00', '15:00']);
  });

  it('dia sem janela não é erro, é dia sem atendimento', () => {
    expect(montarHorariosLivres({ dataISO: DIA, janelas: [], ocupados: [] })).toEqual([]);
  });

  it('janela com duração zerada não trava a conta', () => {
    // Passo zero seria um laço infinito. A janela é ignorada.
    expect(
      montarHorariosLivres({
        dataISO: DIA,
        janelas: [janela('08:00', '10:00', 0)],
        ocupados: [],
      }),
    ).toEqual([]);
  });
});

describe('fimDoCompromisso', () => {
  const inicio = new Date(`${DIA}T09:00:00.000Z`);

  it('cada tipo tem a duração que o profissional espera sem digitar', () => {
    expect(fimDoCompromisso({ tipo: 'CONSULTA', inicioEm: inicio }).toISOString()).toBe(
      `${DIA}T09:50:00.000Z`,
    );
    expect(fimDoCompromisso({ tipo: 'RETORNO', inicioEm: inicio }).toISOString()).toBe(
      `${DIA}T09:30:00.000Z`,
    );
    expect(fimDoCompromisso({ tipo: 'AVALIACAO_FISICA', inicioEm: inicio }).toISOString()).toBe(
      `${DIA}T10:00:00.000Z`,
    );
  });

  it('a duração dita vence o padrão, e o fim dito vence os dois', () => {
    expect(
      fimDoCompromisso({ tipo: 'CONSULTA', inicioEm: inicio, duracaoMin: 20 }).toISOString(),
    ).toBe(`${DIA}T09:20:00.000Z`);
    expect(
      fimDoCompromisso({
        tipo: 'CONSULTA',
        inicioEm: inicio,
        duracaoMin: 20,
        fimEm: `${DIA}T11:00:00.000Z`,
      }).toISOString(),
    ).toBe(`${DIA}T11:00:00.000Z`);
  });
});
