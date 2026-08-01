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
  /** O que a tela faz — exibido enquanto ela não existe. */
  descricao?: string;
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
            descricao:
              'Modelos de plano alimentar reutilizáveis, para montar a dieta de um paciente novo sem começar do zero.',
          },
          {
            rotulo: 'Refeições',
            href: '/plano-alimentar/refeicoes',
            estado: 'pronto',
            descricao:
              'Refeições prontas (café da manhã padrão, pré-treino) para encaixar em qualquer cardápio.',
          },
          {
            rotulo: 'Receitas',
            href: '/plano-alimentar/receitas',
            estado: 'pronto',
            descricao:
              'Receitas com modo de preparo e macros calculados a partir dos ingredientes.',
          },
          {
            rotulo: 'Alimentos',
            href: '/plano-alimentar/alimentos',
            estado: 'pronto',
            descricao: 'Tabela de composição nutricional e alimentos próprios.',
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
            descricao: 'Modelos reutilizáveis de prescrição, com posologia e orientações.',
          },
          {
            rotulo: 'Suplementos',
            href: '/prescricoes/suplementos',
            estado: 'pronto',
            descricao: 'Cadastro de suplementos com dose, horário e forma de uso.',
          },
          {
            rotulo: 'Fitoterápicos',
            href: '/prescricoes/fitoterapicos',
            estado: 'pronto',
            descricao: 'Cadastro de fitoterápicos com posologia e contraindicações.',
          },
          {
            // Prescrever medicamento é privativo do médico (CRM) — a API recusa
            // de qualquer forma, mas nem mostrar o caminho é mais honesto.
            rotulo: 'Medicamentos',
            href: '/prescricoes/medicamentos',
            estado: 'pronto',
            papeis: [Papel.MEDICO, Papel.ADMIN],
            descricao: 'Cadastro de medicamentos com princípio ativo e apresentação.',
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
            descricao:
              'Importa os dados da balança de bioimpedância e alimenta os gráficos de composição corporal.',
          },
          {
            rotulo: 'Adipometria',
            href: '/avaliacao/adipometria',
            estado: 'pronto',
            descricao:
              'Dobras cutâneas com cálculo de percentual de gordura pelos protocolos Pollock e Jackson-Pollock.',
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
            descricao: 'Seus dados, registro no conselho e especialidades.',
          },
          {
            rotulo: 'Modelos de anamnese',
            href: '/cadastros/anamnese',
            estado: 'pronto',
            descricao: 'Questionários de anamnese personalizados por tipo de atendimento.',
          },
        ],
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

/** Encontra a descrição de uma rota — usada pela tela de "em construção". */
export function descricaoDaRota(href: string): { rotulo: string; descricao?: string } | null {
  for (const bloco of MENU) {
    for (const secao of bloco.secoes) {
      if (secao.href === href) return { rotulo: secao.rotulo };
      const item = secao.itens.find((i) => i.href === href);
      if (item) return { rotulo: item.rotulo, descricao: item.descricao };
    }
  }
  return null;
}
