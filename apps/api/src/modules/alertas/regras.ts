import {
  Classificacao,
  Papel,
  SeveridadeAlerta,
  classificarMarcador,
  type Marcador,
  type PapelDestino,
  type SexoBiologico,
} from '@vivio/contracts';

/**
 * Motor de alertas cruzados.
 *
 * Um achado no exame vira orientação para OUTRO membro da equipe de cuidado —
 * sem que esse outro veja o exame. É o que separa este app de três aplicativos
 * separados, e é a regra que a especificação chama de coração do diferencial.
 *
 * A regra dura, testada em `regras.spec.ts`: **o texto destinado a quem não
 * pode ver o marcador não menciona o marcador.** O personal recebe "evite
 * creatina e dieta hiperproteica até liberação médica", nunca "TFG 67". Se o
 * texto vazasse o achado, o alerta viraria um caminho indireto para mostrar o
 * exame a quem não pode lê-lo.
 *
 * Domínio clínico ("cuidado renal") pode aparecer; marcador e valor, não. É
 * exatamente essa a linha que a spec desenha ao dizer que personal e
 * nutricionista recebem o alerta derivado, e não o arquivo.
 */

export interface Aviso {
  papel: PapelDestino;
  titulo: string;
  orientacao: string;
}

export interface RegraDeAlerta {
  /** Identificador estável. Entra na dedupe — mudar quebra o histórico. */
  id: string;
  marcador: Marcador;
  quando: Classificacao[];
  /** Distingue "baixo demais" de "alto demais" no mesmo marcador. */
  lado?: 'ABAIXO' | 'ACIMA';
  avisos: Aviso[];
}

export const REGRAS: RegraDeAlerta[] = [
  {
    id: 'renal-carga-proteica',
    marcador: 'TFG_ESTIMADA',
    quando: [Classificacao.ATENCAO, Classificacao.CRITICO],
    lado: 'ABAIXO',
    avisos: [
      {
        papel: Papel.PERSONAL,
        titulo: 'Cuidado renal — suplementação e carga proteica',
        orientacao:
          'A equipe clínica sinalizou cuidado renal para este aluno. Evite recomendar creatina e dietas hiperproteicas até liberação do médico da equipe.',
      },
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Revisar a carga proteica prescrita',
        orientacao:
          'A função renal está abaixo do ideal. Revise a proteína do plano alimentar e alinhe com o médico da equipe antes de manter metas altas.',
      },
      {
        papel: Papel.MEDICO,
        titulo: 'Função renal abaixo do ideal',
        orientacao: 'Avalie a necessidade de investigação e de repetir o exame.',
      },
    ],
  },
  {
    id: 'ferro-baixo',
    marcador: 'FERRITINA',
    quando: [Classificacao.ATENCAO, Classificacao.CRITICO],
    lado: 'ABAIXO',
    avisos: [
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Reserva de ferro abaixo do ideal',
        orientacao:
          'Considere revisar a ingestão de ferro e os cofatores de absorção. Ferritina é proteína de fase aguda — leia junto com a PCR ultrassensível antes de concluir.',
      },
      {
        papel: Papel.PERSONAL,
        titulo: 'Possível queda de rendimento',
        orientacao:
          'A equipe clínica sinalizou um achado que costuma cursar com fadiga e menor tolerância a volume. Considere segurar aumentos de carga até a reavaliação.',
      },
    ],
  },
  {
    id: 'vitamina-d-baixa',
    marcador: 'VITAMINA_D',
    quando: [Classificacao.ATENCAO, Classificacao.CRITICO],
    lado: 'ABAIXO',
    avisos: [
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Vitamina D abaixo do alvo',
        orientacao:
          'Considere revisar a ingestão e a exposição solar, e discutir reposição com o médico da equipe.',
      },
      {
        papel: Papel.PERSONAL,
        titulo: 'Recuperação pode estar prejudicada',
        orientacao:
          'A equipe clínica sinalizou um achado associado a menor força e recuperação mais lenta. Vale acompanhar a resposta ao treino antes de progredir.',
      },
    ],
  },
  {
    id: 'glicemia-alterada',
    marcador: 'GLICOSE_JEJUM',
    quando: [Classificacao.CRITICO],
    lado: 'ACIMA',
    avisos: [
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Glicemia de jejum fora da faixa',
        orientacao:
          'Revise a distribuição de carboidratos e o fracionamento das refeições, e alinhe com o médico da equipe.',
      },
      {
        papel: Papel.MEDICO,
        titulo: 'Glicemia de jejum fora da faixa',
        orientacao: 'Avalie a necessidade de confirmação e de investigação metabólica.',
      },
    ],
  },
  {
    id: 'hba1c-alterada',
    marcador: 'HBA1C',
    quando: [Classificacao.CRITICO],
    lado: 'ACIMA',
    avisos: [
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Hemoglobina glicada fora da faixa',
        orientacao:
          'O controle glicêmico dos últimos meses está fora da faixa. Revise o plano alimentar com o médico da equipe.',
      },
      {
        papel: Papel.MEDICO,
        titulo: 'Hemoglobina glicada fora da faixa',
        orientacao: 'Avalie confirmação diagnóstica e conduta.',
      },
    ],
  },
  {
    id: 'inflamacao-elevada',
    marcador: 'PCR_US',
    quando: [Classificacao.ATENCAO, Classificacao.CRITICO],
    lado: 'ACIMA',
    avisos: [
      {
        papel: Papel.PERSONAL,
        titulo: 'Segurar progressão de carga',
        orientacao:
          'A equipe clínica sinalizou sinal de inflamação sistêmica. Evite aumentar volume e intensidade até a reavaliação; priorize recuperação.',
      },
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Marcador inflamatório elevado',
        orientacao:
          'Vale considerar o padrão alimentar anti-inflamatório e reavaliar leituras de ferritina, que sobem com inflamação.',
      },
      {
        papel: Papel.MEDICO,
        titulo: 'PCR ultrassensível elevada',
        orientacao:
          'Avalie se há quadro agudo em curso — valores muito altos costumam ser infecção, não risco basal.',
      },
    ],
  },
  {
    id: 'lipides-alterado',
    marcador: 'LDL',
    quando: [Classificacao.CRITICO],
    lado: 'ACIMA',
    avisos: [
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'LDL fora da faixa',
        orientacao:
          'Revise o perfil de gorduras do plano alimentar e alinhe a meta com o médico da equipe — a faixa depende do risco cardiovascular.',
      },
      {
        papel: Papel.MEDICO,
        titulo: 'LDL fora da faixa',
        orientacao: 'Estratifique o risco cardiovascular para definir o alvo adequado.',
      },
    ],
  },
  {
    /*
      Demonstra o desenho inteiro: o nutricionista NÃO pode ver TSH, e mesmo
      assim recebe a orientação derivada — sem o nome do marcador e sem o valor.
    */
    id: 'tireoide-alterada',
    marcador: 'TSH',
    quando: [Classificacao.CRITICO],
    avisos: [
      {
        papel: Papel.MEDICO,
        titulo: 'TSH fora da faixa de referência',
        orientacao: 'Avalie função tireoidiana e necessidade de repetir com T4 livre.',
      },
      {
        papel: Papel.NUTRICIONISTA,
        titulo: 'Metas de peso podem precisar de ajuste',
        orientacao:
          'A equipe médica sinalizou uma alteração metabólica em investigação. Alinhe as metas de perda ou ganho de peso com o médico antes de ajustar o plano.',
      },
    ],
  },
];

/** CRITICO muda a conduta agora; ATENCAO ajusta na próxima revisão. */
export function severidadeDe(classificacao: Classificacao): SeveridadeAlerta {
  return classificacao === Classificacao.CRITICO ? SeveridadeAlerta.ALTA : SeveridadeAlerta.MEDIA;
}

/** De que lado da faixa funcional o valor caiu. */
export function ladoDoValor(
  marcador: Marcador,
  valor: number,
  sexo: SexoBiologico,
): 'ABAIXO' | 'ACIMA' | 'DENTRO' {
  const { funcional } = classificarMarcador(marcador, valor, sexo);
  if (funcional.min !== undefined && valor < funcional.min) return 'ABAIXO';
  if (funcional.max !== undefined && valor > funcional.max) return 'ACIMA';
  return 'DENTRO';
}

export interface AlertaGerado {
  regra: string;
  marcador: Marcador;
  papelDestino: PapelDestino;
  severidade: SeveridadeAlerta;
  titulo: string;
  orientacao: string;
}

export interface ResultadoParaRegra {
  marcador: Marcador;
  valor: number;
  classificacao: Classificacao;
}

/**
 * Os alertas que este exame produz.
 *
 * Puro: mesma entrada, mesma saída, sem banco. A persistência e a deduplicação
 * ficam no serviço — aqui mora só a decisão clínica.
 */
export function alertasDoExame(
  resultados: ResultadoParaRegra[],
  sexo: SexoBiologico,
): AlertaGerado[] {
  const gerados: AlertaGerado[] = [];

  for (const resultado of resultados) {
    for (const regra of REGRAS) {
      if (regra.marcador !== resultado.marcador) continue;
      if (!regra.quando.includes(resultado.classificacao)) continue;
      if (regra.lado && ladoDoValor(resultado.marcador, resultado.valor, sexo) !== regra.lado) {
        continue;
      }

      for (const aviso of regra.avisos) {
        gerados.push({
          regra: regra.id,
          marcador: resultado.marcador,
          papelDestino: aviso.papel,
          severidade: severidadeDe(resultado.classificacao),
          titulo: aviso.titulo,
          orientacao: aviso.orientacao,
        });
      }
    }
  }

  return gerados;
}
