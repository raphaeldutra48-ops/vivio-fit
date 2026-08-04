import {
  GravidadeCondicao,
  Papel,
  RegiaoCorpo,
  ROTULO_REGIAO,
  SeveridadeAlerta,
  TipoCondicao,
  type PapelDestino,
} from '@vivio/contracts';
import type { AlertaGerado } from './regras';

/**
 * Alertas cruzados a partir de CONDIÇÃO de saúde.
 *
 * O exame produz achado bioquímico; aqui está o que não sai em exame nenhum —
 * uma lesão no joelho, uma alergia a amendoim, uma gestação. São esses os
 * fatos que mudam a conduta de quem prescreve treino e dieta, e que a
 * especificação chama de coração do diferencial: condição ativa do tipo LESÃO
 * com região do corpo dispara alerta para o PERSONAL.
 *
 * A diferença em relação às regras de exame: condição **é legível pelos três
 * profissionais**, então o texto pode nomear o achado. O que não pode é ser
 * genérico — "cuidado com o joelho" não ajuda ninguém a montar treino. Por
 * isso a orientação ao personal é específica por região.
 */

/**
 * O que evitar em cada região, na língua de quem monta treino.
 *
 * Escrito como movimento e padrão, não como diagnóstico: o personal não vai
 * decidir se é tendinite ou bursite, vai decidir se prescreve desenvolvimento
 * militar.
 */
const CUIDADO_POR_REGIAO: Record<RegiaoCorpo, string> = {
  OMBRO:
    'Evite movimentos acima da cabeça (desenvolvimento, arranco) e amplitude final em supino aberto. Priorize empurrar e puxar na horizontal, com pegada neutra.',
  COTOVELO:
    'Reduza volume de exercícios de braço isolados e pegadas pronadas com carga alta. Rosca com pegada neutra costuma tolerar melhor.',
  PUNHO_MAO:
    'Evite apoio de peso sobre as mãos em extensão (flexão de braço no solo, front squat com pegada limpa). Considere alças e pegada neutra.',
  COLUNA_CERVICAL:
    'Evite carga direta sobre a barra na cervical e movimentos que exijam olhar para cima sob carga. Cuidado com encolhimento de ombros pesado.',
  COLUNA_LOMBAR:
    'Evite carga axial (agachamento com barra alta, levantamento terra) e flexão de tronco com peso. Priorize máquinas com apoio e trabalho de estabilização.',
  QUADRIL:
    'Evite amplitude final de flexão profunda sob carga e abdução resistida com dor. Ajuste a profundidade do agachamento ao que não incomoda.',
  JOELHO:
    'Evite impacto (salto, corrida em piso duro) e agachamento profundo sob carga. Cadeia posterior e amplitude parcial costumam tolerar melhor.',
  TORNOZELO_PE:
    'Evite impacto e trabalho unilateral instável. Prefira máquinas sentado ou deitado enquanto não houver liberação.',
};

/** Só a gravidade grave muda a conduta agora; o resto ajusta na revisão. */
function severidadeDe(gravidade: GravidadeCondicao): SeveridadeAlerta {
  return gravidade === GravidadeCondicao.GRAVE ? SeveridadeAlerta.ALTA : SeveridadeAlerta.MEDIA;
}

export interface CondicaoParaRegra {
  tipo: TipoCondicao;
  descricao: string;
  regiao: RegiaoCorpo | null;
  gravidade: GravidadeCondicao;
}

interface AvisoBruto {
  papel: PapelDestino;
  titulo: string;
  orientacao: string;
}

function avisosDe(condicao: CondicaoParaRegra): { regra: string; avisos: AvisoBruto[] } | null {
  const { tipo, descricao, regiao } = condicao;

  switch (tipo) {
    case TipoCondicao.LESAO:
    case TipoCondicao.CIRURGIA_RECENTE: {
      // A região é obrigatória nestes dois pelo schema; sem ela não há o que
      // dizer de útil, e é melhor não gerar alerta do que gerar um genérico.
      if (!regiao) return null;

      const parte = ROTULO_REGIAO[regiao].toLowerCase();
      const ehCirurgia = tipo === TipoCondicao.CIRURGIA_RECENTE;

      return {
        regra: ehCirurgia ? 'cirurgia-regiao' : 'lesao-regiao',
        avisos: [
          {
            papel: Papel.PERSONAL,
            titulo: `Adaptar o treino — ${parte}`,
            orientacao: `${descricao}. ${CUIDADO_POR_REGIAO[regiao]}${
              ehCirurgia ? ' Aguarde liberação médica antes de progredir carga.' : ''
            }`,
          },
          {
            papel: Papel.MEDICO,
            titulo: `Acompanhar — ${parte}`,
            orientacao: `${descricao}. Reavalie e resolva a condição quando houver alta, para o treino voltar a progredir.`,
          },
        ],
      };
    }

    case TipoCondicao.ALERGIA_ALIMENTAR:
      return {
        regra: 'alergia-alimentar',
        avisos: [
          {
            papel: Papel.NUTRICIONISTA,
            titulo: 'Alergia alimentar no plano',
            orientacao: `${descricao}. Confira o plano alimentar e os substitutos sugeridos, inclusive traços em produtos industrializados.`,
          },
          {
            // Personal costuma indicar suplemento — e é onde a alergia escapa.
            papel: Papel.PERSONAL,
            titulo: 'Cuidado ao indicar suplemento',
            orientacao: `${descricao}. Não indique suplemento sem conferir a composição com o nutricionista da equipe.`,
          },
        ],
      };

    case TipoCondicao.INTOLERANCIA:
    case TipoCondicao.RESTRICAO_ALIMENTAR:
      return {
        regra: 'restricao-alimentar',
        avisos: [
          {
            papel: Papel.NUTRICIONISTA,
            titulo: 'Restrição a considerar no plano',
            orientacao: `${descricao}. Ajuste o plano alimentar e verifique se as metas de macro continuam alcançáveis dentro da restrição.`,
          },
        ],
      };

    case TipoCondicao.GESTACAO:
      return {
        regra: 'gestacao',
        avisos: [
          {
            papel: Papel.PERSONAL,
            titulo: 'Gestação — adaptar o treino',
            orientacao:
              'Evite exercícios em decúbito dorsal prolongado, impacto e manobra de Valsalva. Progressão de carga só com liberação médica.',
          },
          {
            papel: Papel.NUTRICIONISTA,
            titulo: 'Gestação — revisar o plano alimentar',
            orientacao:
              'Necessidades energéticas e de micronutrientes mudam por trimestre. Revise o plano e alinhe com o médico da equipe.',
          },
          {
            papel: Papel.MEDICO,
            titulo: 'Gestação registrada',
            orientacao: 'Defina as liberações de atividade física e acompanhe com a equipe.',
          },
        ],
      };

    case TipoCondicao.MEDICACAO_CONTINUA:
      return {
        regra: 'medicacao-continua',
        avisos: [
          {
            papel: Papel.NUTRICIONISTA,
            titulo: 'Medicação contínua — checar interações',
            orientacao: `${descricao}. Verifique interação com alimentos e suplementos antes de prescrever.`,
          },
          {
            papel: Papel.MEDICO,
            titulo: 'Medicação contínua registrada',
            orientacao: `${descricao}. Confirme se afeta resposta ao treino ou leitura de exames.`,
          },
        ],
      };

    case TipoCondicao.DOENCA_CRONICA:
      return {
        regra: 'doenca-cronica',
        avisos: [
          {
            papel: Papel.MEDICO,
            titulo: 'Doença crônica registrada',
            orientacao: `${descricao}. Defina as restrições que a equipe precisa respeitar.`,
          },
          {
            papel: Papel.PERSONAL,
            titulo: 'Condição clínica a respeitar',
            orientacao: `${descricao}. Confirme com o médico da equipe quais intensidades estão liberadas antes de progredir.`,
          },
          {
            papel: Papel.NUTRICIONISTA,
            titulo: 'Condição clínica a respeitar',
            orientacao: `${descricao}. Alinhe o plano alimentar com a conduta médica.`,
          },
        ],
      };

    default:
      return null;
  }
}

/**
 * Os alertas que uma condição produz.
 *
 * Puro, como o motor de exame: mesma entrada, mesma saída, sem banco. A
 * persistência e a deduplicação ficam no serviço.
 */
export function alertasDaCondicao(condicao: CondicaoParaRegra): AlertaGerado[] {
  const resultado = avisosDe(condicao);
  if (!resultado) return [];

  return resultado.avisos.map((aviso) => ({
    regra: resultado.regra,
    // Alerta de condição não tem marcador de exame: a origem é a própria
    // condição, e o serviço grava o `condicaoId`.
    marcador: null,
    papelDestino: aviso.papel,
    severidade: severidadeDe(condicao.gravidade),
    titulo: aviso.titulo,
    orientacao: aviso.orientacao,
  }));
}

export { CUIDADO_POR_REGIAO };
