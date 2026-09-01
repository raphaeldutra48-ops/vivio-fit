import { Papel } from '@vivio/contracts';

/**
 * Estrutura do menu lateral do painel do profissional.
 *
 * Definida como dado, não como JSX: assim a ordem, os papéis que enxergam cada
 * item e o estado de construção ficam num lugar só, e a navegação inteira é
 * consequência disso.
 */

export type EstadoDoItem = 'pronto' | 'em-construcao';

export interface ItemDeMenu {
  rotulo: string;
  href: string;
  estado: EstadoDoItem;
  /** Papéis que enxergam o item. Vazio = todos os profissionais. */
  papeis?: Papel[];
}

export interface GrupoDeMenu {
  /** Título da seção. null = itens soltos no topo. */
  titulo: string | null;
  icone?: string;
  itens: ItemDeMenu[];
}

export interface SecaoRecolhivel {
  rotulo: string;
  icone: string;
  /** Subitens. Se vazio, o próprio rótulo é o link. */
  itens: ItemDeMenu[];
  href?: string;
  estado?: EstadoDoItem;
  papeis?: Papel[];
}

export interface BlocoDeMenu {
  titulo: string | null;
  secoes: SecaoRecolhivel[];
}

// Anotado como Papel[]: sem isso o tipo vira a união estreita dos 4 valores e
// comparar com um Papel qualquer (que inclui ALUNO) não compila.
const TODOS_PROFISSIONAIS: Papel[] = [
  Papel.PERSONAL,
  Papel.NUTRICIONISTA,
  Papel.MEDICO,
  Papel.ADMIN,
];

export const MENU: BlocoDeMenu[] = [
  {
    titulo: null,
    secoes: [
      /* Primeiro item e tela inicial: responde "quem precisa de mim hoje?"
         antes de o profissional ter de procurar aluno por aluno. */
      { rotulo: 'Resumo', icone: '🏠', href: '/resumo', estado: 'pronto', itens: [] },
      { rotulo: 'Alunos', icone: '👥', href: '/alunos', estado: 'pronto', itens: [] },
      { rotulo: 'Agenda', icone: '📅', href: '/agenda', estado: 'pronto', itens: [] },
      {
        // Liberar profissional é liberar acesso a dado de saúde de terceiros.
        rotulo: 'Verificar profissionais',
        icone: '🛡️',
        href: '/admin/profissionais',
        estado: 'pronto',
        papeis: [Papel.ADMIN],
        itens: [],
      },
      {
        rotulo: 'Controle financeiro',
        icone: '📈',
        href: '/financeiro',
        estado: 'pronto',
        itens: [],
      },
      {
        rotulo: 'Receba Fácil',
        icone: '💳',
        href: '/receba-facil',
        estado: 'pronto',
        itens: [],
      },
      { rotulo: 'Relatórios', icone: '📊', href: '/relatorios', estado: 'pronto', itens: [] },
      /* Ao lado de Relatórios: os dois respondem "como está indo", um pelos
         números e o outro pelo que o aluno falou. */
      { rotulo: 'Feedback', icone: '🗣️', href: '/feedback', estado: 'pronto', itens: [] },
    ],
  },
  {
    titulo: 'FIDELIZAÇÃO',
    secoes: [
      {
        rotulo: 'Site profissional',
        icone: '🌐',
        href: '/site-profissional',
        estado: 'pronto',
        itens: [],
      },
      { rotulo: 'Chat', icone: '💬', href: '/chat', estado: 'pronto', itens: [] },
      { rotulo: 'Materiais', icone: '📁', href: '/materiais', estado: 'pronto', itens: [] },
    ],
  },
  {
    titulo: 'MEU CONTEÚDO',
    secoes: [
      {
        rotulo: 'Plano alimentar',
        icone: '🥗',
        papeis: [Papel.NUTRICIONISTA, Papel.ADMIN],
        itens: [
          {
            rotulo: 'Cardápios',
            href: '/plano-alimentar/cardapios',
            estado: 'pronto',
            // Modelos de plano alimentar reutilizáveis, para montar a dieta de um
            // paciente novo sem começar do zero.
          },
          {
            rotulo: 'Refeições',
            href: '/plano-alimentar/refeicoes',
            estado: 'pronto',
            // Refeições prontas (café da manhã padrão, pré-treino) para encaixar em
            // qualquer cardápio.
          },
          {
            rotulo: 'Receitas',
            href: '/plano-alimentar/receitas',
            estado: 'pronto',
            // Receitas com modo de preparo e macros calculados a partir dos
            // ingredientes.
          },
          {
            rotulo: 'Alimentos',
            href: '/plano-alimentar/alimentos',
            estado: 'pronto',
            // Tabela de composição nutricional e alimentos próprios.
          },
        ],
      },
      {
        rotulo: 'Exercícios',
        icone: '🏋️',
        href: '/exercicios',
        estado: 'pronto',
        papeis: [Papel.PERSONAL, Papel.ADMIN],
        itens: [],
      },
      {
        rotulo: 'Prescrições',
        icone: '📋',
        papeis: [Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN],
        itens: [
          {
            rotulo: 'Modelos de prescrições',
            href: '/prescricoes/modelos',
            estado: 'pronto',
            // Modelos reutilizáveis de prescrição, com posologia e orientações.
          },
          {
            rotulo: 'Suplementos',
            href: '/prescricoes/suplementos',
            estado: 'pronto',
            // Cadastro de suplementos com dose, horário e forma de uso.
          },
          {
            rotulo: 'Fitoterápicos',
            href: '/prescricoes/fitoterapicos',
            estado: 'pronto',
            // Cadastro de fitoterápicos com posologia e contraindicações.
          },
          {
            // Prescrever medicamento é privativo do médico (CRM) — a API recusa
            // de qualquer forma, mas nem mostrar o caminho é mais honesto.
            rotulo: 'Medicamentos',
            href: '/prescricoes/medicamentos',
            estado: 'pronto',
            papeis: [Papel.MEDICO, Papel.ADMIN],
            // Cadastro de medicamentos com princípio ativo e apresentação.
          },
        ],
      },
      {
        rotulo: 'Avaliação física',
        icone: '📏',
        itens: [
          {
            rotulo: 'Bioimpedância',
            href: '/avaliacao/bioimpedancia',
            estado: 'pronto',
            // Importa os dados da balança de bioimpedância e alimenta os gráficos de
            // composição corporal.
          },
          {
            rotulo: 'Adipometria',
            href: '/avaliacao/adipometria',
            estado: 'pronto',
            // Dobras cutâneas com cálculo de percentual de gordura pelos protocolos
            // Pollock e Jackson-Pollock.
          },
        ],
      },
      {
        rotulo: 'Lista de compras',
        icone: '🛒',
        href: '/lista-de-compras',
        estado: 'pronto',
        papeis: [Papel.NUTRICIONISTA, Papel.ADMIN],
        itens: [],
      },
      {
        rotulo: 'Outros cadastros',
        icone: '⚙️',
        itens: [
          {
            rotulo: 'Meu perfil',
            href: '/cadastros/perfil',
            estado: 'pronto',
            // Seus dados, registro no conselho e especialidades.
          },
          {
            rotulo: 'Modelos de anamnese',
            href: '/cadastros/anamnese',
            estado: 'pronto',
            // Questionários de anamnese personalizados por tipo de atendimento.
          },
        ],
      },
      {
        // Quem não lança exame não precisa da página que explica as faixas —
        // e o personal não lança nem lê.
        rotulo: 'Metodologia',
        icone: '🧪',
        href: '/metodologia',
        estado: 'pronto',
        papeis: [Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN],
        itens: [],
      },
      { rotulo: 'Ajuda', icone: '❓', href: '/ajuda', estado: 'pronto', itens: [] },
    ],
  },
];

/** Filtra o menu pelo papel de quem está logado. */
export function menuPara(papel: Papel): BlocoDeMenu[] {
  const podeVer = (papeis?: Papel[]) =>
    !papeis || papeis.length === 0 ? TODOS_PROFISSIONAIS.includes(papel) : papeis.includes(papel);

  return MENU.map((bloco) => ({
    ...bloco,
    secoes: bloco.secoes
      .filter((s) => podeVer(s.papeis))
      // Subitens também têm papel próprio: Medicamentos, por exemplo, só o médico.
      .map((s) => ({ ...s, itens: s.itens.filter((i) => podeVer(i.papeis)) }))
      // Seção que era só um agrupador e ficou sem nenhum subitem some.
      .filter((s) => s.itens.length > 0 || s.href),
  })).filter((bloco) => bloco.secoes.length > 0);
}

