import { describe, expect, it } from 'vitest';
import {
  avaliarCabecalhos,
  avaliarContas,
  avaliarFuncaoDeBorda,
  avaliarMidia,
  avaliarRegrasClinicas,
  avaliarRotina,
  resumir,
} from './regras';

/**
 * As regras do diagnóstico.
 *
 * Um diagnóstico que aprova tudo é pior do que nenhum: ele dá a sensação de
 * conferência sem conferir nada, e uma comparação invertida basta para isso. Por
 * isso cada regra é testada pelos DOIS lados — o estado bom e o estado ruim que
 * ela existe para pegar. Todos os casos ruins aqui aconteceram de verdade neste
 * projeto, nas últimas duas semanas.
 */
const agora = new Date('2026-09-25T18:00:00Z');

describe('cabeçalhos de segurança', () => {
  it('aprova quando os seis chegam', () => {
    const r = avaliarCabecalhos({
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self)',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
    expect(r.ok).toBe(true);
  });

  it('reprova e diz qual falta', () => {
    // O estado real do site até 22/09: nenhum cabeçalho.
    const r = avaliarCabecalhos({ 'content-type': 'text/html' });
    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain('x-frame-options');
  });
});

describe('função de borda', () => {
  it('401 é publicada e exigindo sessão', () => {
    expect(avaliarFuncaoDeBorda('ler-dieta', 401).ok).toBe(true);
  });

  it('404 reprova, e a frase diz o que fazer', () => {
    // Foi o estado real por duas semanas, com a tela dizendo apenas que a
    // leitura automática "não estava configurada".
    const r = avaliarFuncaoDeBorda('ler-dieta', 404);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toMatch(/não publicada/i);
  });

  it('200 sem sessão também reprova — seria porta aberta', () => {
    expect(avaliarFuncaoDeBorda('ler-dieta', 200).ok).toBe(false);
  });
});

describe('rotina do banco', () => {
  it('execução recente com sucesso aprova', () => {
    const r = avaliarRotina('lembretes', { status: 'succeeded', quando: new Date('2026-09-25T17:59:00Z') }, agora);
    expect(r.ok).toBe(true);
  });

  it('parada há horas reprova, mesmo que a última tenha dado certo', () => {
    /*
      É o caso que o "existe e está ativa" não pega: o agendador pode estar
      registrado e não rodar. Foi assim que o disparo de lembretes ficou dias
      sem existir — com a tela salvando horário normalmente.
    */
    const r = avaliarRotina('lembretes', { status: 'succeeded', quando: new Date('2026-09-25T14:00:00Z') }, agora);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toMatch(/parada/i);
  });

  it('última execução com falha reprova', () => {
    const r = avaliarRotina('lembretes', { status: 'failed', quando: new Date('2026-09-25T17:59:30Z') }, agora);
    expect(r.ok).toBe(false);
  });

  it('nunca executou reprova', () => {
    expect(avaliarRotina('lembretes', null, agora).ok).toBe(false);
  });
});

describe('mídia', () => {
  it('chave sem arquivo reprova; arquivo sem dono só avisa', () => {
    const [comArquivo, semDono] = avaliarMidia(
      ['catalogo/exercicios/a.png', 'evolucao/aluno/b.png'],
      ['catalogo/exercicios/a.png', 'exames/prof/sobra.pdf'],
    );

    // A foto que a tela promete e não abre.
    expect(comArquivo!.ok).toBe(false);
    expect(comArquivo!.detalhe).toContain('evolucao/aluno/b.png');

    // A sobra de upload interrompido: ocupa espaço, não quebra nada, e apagar
    // por conta própria é o risco que não vale (pendência 23).
    expect(semDono!.ok).toBe(false);
    expect(semDono!.informativo).toBe(true);
  });

  it('catálogo não conta como arquivo sem dono', () => {
    // Ele é acervo: existe sem nenhuma linha apontando para ele.
    const [, semDono] = avaliarMidia([], ['catalogo/exercicios/a.png']);
    expect(semDono!.ok).toBe(true);
  });
});

describe('contas', () => {
  it('sobra de teste reprova', () => {
    const [sobras] = avaliarContas(['personal@viviofit.com.br', 'prova-medida-123@teste.com']);
    expect(sobras!.ok).toBe(false);
  });

  it('semente e alunos de exemplo não são sobra', () => {
    const [sobras] = avaliarContas(['ana@exemplo.com', 'nutri@viviofit.com.br']);
    expect(sobras!.ok).toBe(true);
  });

  it('gente de verdade no banco é aviso, não falha — e muda o que a suíte pode fazer', () => {
    const [, reais] = avaliarContas(['ana@exemplo.com', 'cliente@gmail.com']);
    expect(reais!.ok).toBe(true);
    expect(reais!.informativo).toBe(true);
    expect(reais!.detalhe).toMatch(/NÃO pode mais rodar/);
  });
});

describe('o resumo', () => {
  it('informativo não derruba o comando; falha derruba', () => {
    const semFalha = resumir([
      { nome: 'a', ok: true, detalhe: '' },
      { nome: 'b', ok: false, detalhe: '', informativo: true },
    ]);
    expect(semFalha.codigoDeSaida).toBe(0);
    expect(semFalha.avisos).toHaveLength(1);

    const comFalha = resumir([{ nome: 'c', ok: false, detalhe: '' }]);
    expect(comFalha.codigoDeSaida).toBe(1);
    expect(comFalha.reprovadas).toHaveLength(1);
  });
});

describe('as três tabelas clínicas em dia com o TypeScript', () => {
  /*
    Checagem é a coisa mais fácil de aprovar tudo para sempre — basta uma
    comparação invertida, e o relatório fica verde justamente quando devia
    gritar. Por isso cada pergunta aqui tem **amostra boa e amostra ruim**, e as
    duas passam pelo mesmo caminho da função.
  */
  const faixa = (marcador: string, sexo: string, funcMin: number | null, funcMax: number | null) => ({
    marcador,
    sexo,
    funcMin,
    funcMax,
  });

  const ESPERADO = {
    faixas: [faixa('GLICOSE_JEJUM', 'M', 75, 88), faixa('GLICOSE_JEJUM', 'F', 75, 88)],
    escopos: [{ marcador: 'GLICOSE_JEJUM', escopo: 'NUTRICIONAL' }],
    regras: ['renal-carga-proteica:PERSONAL', 'restricao-alimentar:INTOLERANCIA:NUTRICIONISTA'],
  };

  const BOM = {
    faixas: [...ESPERADO.faixas],
    escopos: [...ESPERADO.escopos],
    regrasAtivas: [...ESPERADO.regras],
  };

  it('amostra BOA: banco em dia passa nas três', () => {
    const r = avaliarRegrasClinicas(BOM, ESPERADO);
    expect(r).toHaveLength(3);
    for (const c of r) expect(c.ok, c.nome).toBe(true);
  });

  it('amostra RUIM: banco vazio reprova as três de uma vez', () => {
    // É o estado de um banco recém-migrado: ninguém rodou o exportador.
    const r = avaliarRegrasClinicas({ faixas: [], escopos: [], regrasAtivas: [] }, ESPERADO);
    for (const c of r) expect(c.ok, c.nome).toBe(false);
    expect(r[0]!.detalhe).toMatch(/ausentes/);
    expect(r[0]!.detalhe).toMatch(/exportar-regras/);
  });

  it('faixa PRESENTE com número diferente é reprovada, e dita como divergência', () => {
    /*
      A distinção que importa no relatório: ausência manda para `ATENCAO`, que é
      o lado seguro de errar; divergência carimba classificação errada com cara
      de certa. Quem lê o relatório precisa saber qual das duas tem na mão.
    */
    const r = avaliarRegrasClinicas(
      { ...BOM, faixas: [faixa('GLICOSE_JEJUM', 'M', 75, 88), faixa('GLICOSE_JEJUM', 'F', 70, 99)] },
      ESPERADO,
    );
    expect(r[0]!.ok).toBe(false);
    expect(r[0]!.detalhe).toMatch(/divergentes/);
    expect(r[0]!.detalhe).toMatch(/GLICOSE_JEJUM\|F/);
    expect(r[0]!.detalhe).not.toMatch(/ausentes/);
  });

  it('faixa de UM sexo só é ausência, não acerto pela metade', () => {
    // O gatilho busca por (marcador, sexo): a linha que falta manda o exame
    // daquele sexo para ATENCAO, mesmo com o outro sexo cadastrado.
    const r = avaliarRegrasClinicas({ ...BOM, faixas: [faixa('GLICOSE_JEJUM', 'M', 75, 88)] }, ESPERADO);
    expect(r[0]!.ok).toBe(false);
    expect(r[0]!.detalhe).toMatch(/1 ausentes/);
  });

  it('escopo trocado é reprovado — não basta a linha existir', () => {
    // Escopo errado não é ausência: o marcador existe na tabela e o
    // nutricionista deixa de vê-lo porque o rótulo mudou.
    const r = avaliarRegrasClinicas(
      { ...BOM, escopos: [{ marcador: 'GLICOSE_JEJUM', escopo: 'MEDICO' }] },
      ESPERADO,
    );
    expect(r[1]!.ok).toBe(false);
    expect(r[1]!.detalhe).toMatch(/GLICOSE_JEJUM/);
  });

  it('regra DESLIGADA conta como ausente, porque o gatilho filtra por ativa', () => {
    /*
      O exportador desliga (em vez de apagar) a regra que sumiu do TypeScript,
      para não deixar histórico órfão. Então "existe a linha" não responde nada:
      a pergunta é se ela está ATIVA, que é o que o gatilho exige.
    */
    const r = avaliarRegrasClinicas(
      { ...BOM, regrasAtivas: ['renal-carga-proteica:PERSONAL'] },
      ESPERADO,
    );
    expect(r[2]!.ok).toBe(false);
    expect(r[2]!.detalhe).toMatch(/1 de 2/);
    expect(r[2]!.detalhe).toMatch(/restricao-alimentar:INTOLERANCIA:NUTRICIONISTA/);
  });

  it('regra SOBRANDO no banco não reprova — é histórico desligado em breve', () => {
    // Linha a mais é regra que saiu do TypeScript e o exportador vai desligar.
    // Reprovar por isso faria o relatório ficar vermelho por sobra, e sobra não
    // tira alerta de ninguém.
    const r = avaliarRegrasClinicas(
      { ...BOM, regrasAtivas: [...ESPERADO.regras, 'regra-antiga:PERSONAL'] },
      ESPERADO,
    );
    expect(r[2]!.ok).toBe(true);
  });
});
