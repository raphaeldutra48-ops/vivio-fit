import type { GrupoMuscular } from '@vivio/contracts';

/**
 * Biblioteca global de exercícios.
 *
 * Saiu de `catalogo.ts` quando passou de 20 para ~160 itens: misturada com a
 * tabela de alimentos, nenhuma das duas era navegável.
 *
 * **A instrução é a parte que importa.** Ela é o que o aluno lê no celular, na
 * academia, sem ninguém do lado — então cada uma diz o erro que se comete
 * naquele movimento, não uma descrição do que já está no nome. "Agachamento:
 * flexione os joelhos" não ajuda ninguém; "não deixe o joelho cair para
 * dentro" evita uma lesão.
 *
 * O texto é escrito aqui, do zero, de propósito: catálogo copiado de outro app
 * carrega licença junto, e isso reprova na loja.
 *
 * Imagem e vídeo ficam de fora por ora — `videoChave` e `thumbChave` existem no
 * modelo e hoje são preenchidos por upload do profissional. Biblioteca visual
 * pronta depende de decisão sobre licenciamento (ver PENDENCIAS).
 */
export type ExercicioGlobal = readonly [
  nome: string,
  grupo: GrupoMuscular,
  equipamento: string,
  instrucoes: string,
];

export const EXERCICIOS_GLOBAIS: readonly ExercicioGlobal[] = [
  // --- PEITO ---------------------------------------------------------------
  ['Supino reto com barra', 'PEITO', 'Barra', 'Escápulas retraídas e presas no banco. A barra desce na linha do mamilo, não no pescoço.'],
  ['Supino reto com halteres', 'PEITO', 'Halteres', 'Desça até os halteres ficarem na altura do peito. Não bata um no outro em cima.'],
  ['Supino inclinado com barra', 'PEITO', 'Barra', 'Banco entre 30 e 45 graus. Acima disso o ombro assume o trabalho.'],
  ['Supino inclinado com halteres', 'PEITO', 'Halteres', 'Banco a 30-45 graus. Punhos alinhados com os cotovelos o tempo todo.'],
  ['Supino declinado', 'PEITO', 'Barra', 'Prenda bem os pés antes de começar. Amplitude menor que no reto.'],
  ['Crucifixo reto', 'PEITO', 'Halteres', 'Cotovelos levemente flexionados e FIXOS. Se dobram no meio, virou supino.'],
  ['Crucifixo inclinado', 'PEITO', 'Halteres', 'Mesma regra do reto: o cotovelo não muda de ângulo durante o movimento.'],
  ['Crucifixo na polia', 'PEITO', 'Polia', 'Cruze levemente as mãos no fim para fechar o peitoral.'],
  ['Crossover polia alta', 'PEITO', 'Polia alta', 'Tronco levemente à frente. Puxe em arco, não em linha reta.'],
  ['Crossover polia baixa', 'PEITO', 'Polia baixa', 'Trabalha a porção superior. Suba as mãos até a altura dos olhos.'],
  ['Peck deck (voador)', 'PEITO', 'Máquina', 'Costas coladas no encosto. Não empurre o ombro à frente no fim.'],
  ['Flexão de braço', 'PEITO', 'Peso corporal', 'Corpo em prancha do calcanhar à cabeça. O quadril não sobe nem cai.'],
  ['Flexão com pés elevados', 'PEITO', 'Peso corporal', 'Quanto mais alto o pé, mais peito superior e mais ombro.'],
  ['Flexão diamante', 'PEITO', 'Peso corporal', 'Mãos juntas formando um losango. Cotovelos rentes ao corpo.'],
  ['Mergulho no paralelo', 'PEITO', 'Paralelas', 'Incline o tronco à frente para o peito assumir; ereto vira tríceps.'],
  ['Supino na máquina', 'PEITO', 'Máquina', 'Ajuste o banco para a pegada ficar na linha do peito, não do ombro.'],
  ['Pullover', 'PEITO', 'Haltere', 'Só o ombro se move. Desça até sentir alongar, sem forçar a lombar.'],
  ['Supino fechado', 'PEITO', 'Barra', 'Pegada na largura dos ombros. Divide trabalho entre peito interno e tríceps.'],

  // --- COSTAS --------------------------------------------------------------
  ['Barra fixa pronada', 'COSTAS', 'Barra fixa', 'Puxe com os cotovelos para baixo e para trás. Queixo passa a barra.'],
  ['Barra fixa supinada', 'COSTAS', 'Barra fixa', 'Pegada invertida traz mais bíceps. Não balance o corpo para subir.'],
  ['Puxada frontal', 'COSTAS', 'Polia alta', 'Puxe com os cotovelos, não com as mãos. Barra até o peito, nunca atrás da nuca.'],
  ['Puxada supinada', 'COSTAS', 'Polia alta', 'Pegada fechada e invertida. Peito para cima ao puxar.'],
  ['Puxada triângulo', 'COSTAS', 'Polia alta', 'Pegada neutra. Leve o triângulo até a parte alta do abdômen.'],
  ['Remada curvada com barra', 'COSTAS', 'Barra', 'Tronco a 45 graus e coluna neutra. Se as costas arredondam, tire peso.'],
  ['Remada curvada supinada', 'COSTAS', 'Barra', 'Pegada invertida recruta mais a porção baixa do dorsal.'],
  ['Remada unilateral', 'COSTAS', 'Haltere', 'Joelho e mão apoiados no banco. Puxe o cotovelo rente ao tronco.'],
  ['Remada baixa', 'COSTAS', 'Polia baixa', 'Não use o tronco como alavanca. As costas ficam paradas.'],
  ['Remada cavalinho', 'COSTAS', 'Barra', 'Peito apoiado quando houver banco — tira a lombar da conta.'],
  ['Remada na máquina', 'COSTAS', 'Máquina', 'Peito colado no apoio. Aperte as escápulas no fim.'],
  ['Levantamento terra', 'COSTAS', 'Barra', 'Coluna neutra e barra rente às pernas. O movimento começa nas pernas.'],
  ['Levantamento terra romeno', 'COSTAS', 'Barra', 'Joelhos quase retos. Empurre o quadril para trás até sentir o posterior.'],
  ['Pulldown com braço reto', 'COSTAS', 'Polia alta', 'Cotovelos travados. Só o ombro trabalha.'],
  ['Encolhimento de ombros', 'COSTAS', 'Halteres', 'Suba reto, sem girar o ombro. Pausa de 1 segundo no topo.'],
  ['Face pull', 'COSTAS', 'Polia alta', 'Puxe a corda até a testa, cotovelos altos. Ótimo para postura.'],
  ['Remada invertida', 'COSTAS', 'Barra', 'Corpo reto na diagonal. Quanto mais horizontal, mais difícil.'],
  ['Hiperextensão lombar', 'COSTAS', 'Banco romano', 'Suba até a linha do corpo, não além. Hiperestender não traz ganho.'],
  ['Good morning', 'COSTAS', 'Barra', 'Carga leve. Quadril para trás com a coluna travada em neutro.'],
  ['Pull-up assistida', 'COSTAS', 'Máquina', 'Para quem ainda não faz barra livre. Mesma técnica, com contrapeso.'],

  // --- OMBRO ---------------------------------------------------------------
  ['Desenvolvimento militar', 'OMBRO', 'Barra', 'Glúteo e abdômen contraídos. Não jogue a lombar para trás.'],
  ['Desenvolvimento com halteres', 'OMBRO', 'Halteres', 'Desça até o cotovelo passar de 90 graus. Punhos sobre os cotovelos.'],
  ['Desenvolvimento Arnold', 'OMBRO', 'Halteres', 'Comece com as palmas para você e gire ao subir.'],
  ['Desenvolvimento na máquina', 'OMBRO', 'Máquina', 'Ajuste o banco para a pegada nascer na altura das orelhas.'],
  ['Elevação lateral', 'OMBRO', 'Halteres', 'Suba até a linha do ombro, sem balanço. Mindinho levemente acima do polegar.'],
  ['Elevação lateral na polia', 'OMBRO', 'Polia baixa', 'Tensão constante do começo ao fim, diferente do haltere.'],
  ['Elevação frontal', 'OMBRO', 'Halteres', 'Suba até a altura dos olhos. Sem impulso de quadril.'],
  ['Elevação frontal com anilha', 'OMBRO', 'Anilha', 'Pegada nas laterais da anilha, braços quase retos.'],
  ['Crucifixo inverso', 'OMBRO', 'Halteres', 'Tronco à frente, cotovelos levemente dobrados. Aperte as escápulas.'],
  ['Crucifixo inverso na máquina', 'OMBRO', 'Máquina', 'Peito no apoio. Trabalha o deltoide posterior, o mais esquecido.'],
  ['Remada alta', 'OMBRO', 'Barra', 'Pegada na largura dos ombros. Se doer o ombro, troque por elevação lateral.'],
  ['Face pull para ombro', 'OMBRO', 'Polia alta', 'Cotovelos acima dos punhos. Rotação externa no fim.'],
  ['Desenvolvimento por trás', 'OMBRO', 'Barra', 'Só com boa mobilidade de ombro. Na dúvida, faça pela frente.'],
  ['Elevação lateral inclinada', 'OMBRO', 'Haltere', 'Deitado de lado no banco. Isola bem o deltoide médio.'],
  ['Rotação externa', 'OMBRO', 'Polia', 'Cotovelo colado ao tronco. Carga leve — é manguito rotador.'],
  ['Landmine press', 'OMBRO', 'Barra', 'Barra na quina. Ângulo mais amigável para quem tem dor no ombro.'],

  // --- BÍCEPS --------------------------------------------------------------
  ['Rosca direta com barra', 'BICEPS', 'Barra', 'Cotovelos junto ao tronco e parados. Se o cotovelo vai à frente, virou ombro.'],
  ['Rosca direta com halteres', 'BICEPS', 'Halteres', 'Gire o punho ao subir para fechar a contração.'],
  ['Rosca alternada', 'BICEPS', 'Halteres', 'Um braço por vez. O outro fica esticado, sem descansar apoiado.'],
  ['Rosca martelo', 'BICEPS', 'Halteres', 'Pegada neutra o tempo todo. Trabalha o braquial, que empurra o bíceps para cima.'],
  ['Rosca scott', 'BICEPS', 'Barra W', 'Braço inteiro apoiado. Não estenda totalmente no fim — protege o tendão.'],
  ['Rosca concentrada', 'BICEPS', 'Haltere', 'Cotovelo apoiado na coxa. O movimento é só do antebraço.'],
  ['Rosca inversa', 'BICEPS', 'Barra', 'Pegada pronada. Antebraço trabalha junto.'],
  ['Rosca na polia baixa', 'BICEPS', 'Polia baixa', 'Tensão constante — não há ponto de descanso como no haltere.'],
  ['Rosca 21', 'BICEPS', 'Barra', 'Sete parciais embaixo, sete em cima, sete completas. Carga menor que o normal.'],
  ['Rosca no banco inclinado', 'BICEPS', 'Halteres', 'Braços atrás do tronco alongam mais a cabeça longa.'],
  ['Rosca corda na polia', 'BICEPS', 'Polia baixa', 'Pegada neutra com abertura no fim.'],
  ['Rosca spider', 'BICEPS', 'Barra W', 'Peito apoiado no banco inclinado, braços na vertical.'],

  // --- TRÍCEPS -------------------------------------------------------------
  ['Tríceps na polia com barra', 'TRICEPS', 'Polia alta', 'Cotovelos colados ao corpo e imóveis. Só o antebraço se move.'],
  ['Tríceps na polia com corda', 'TRICEPS', 'Polia alta', 'Abra a corda no final para fechar a contração.'],
  ['Tríceps testa', 'TRICEPS', 'Barra W', 'Desça até a testa com os cotovelos parados e apontados ao teto.'],
  ['Tríceps francês', 'TRICEPS', 'Haltere', 'Halter atrás da cabeça. Cotovelos fechados, não abram para fora.'],
  ['Tríceps coice', 'TRICEPS', 'Haltere', 'Braço paralelo ao chão. Estenda até travar e segure 1 segundo.'],
  ['Mergulho no banco', 'TRICEPS', 'Banco', 'Quadril rente ao banco. Desça até o cotovelo formar 90 graus.'],
  ['Mergulho no paralelo (tríceps)', 'TRICEPS', 'Paralelas', 'Tronco ereto para o tríceps assumir; inclinado vira peito.'],
  ['Supino fechado (tríceps)', 'TRICEPS', 'Barra', 'Pegada na largura dos ombros. Cotovelos rentes ao tronco.'],
  ['Tríceps unilateral na polia', 'TRICEPS', 'Polia alta', 'Um braço por vez corrige diferença entre os lados.'],
  ['Tríceps na polia invertida', 'TRICEPS', 'Polia alta', 'Pegada supinada foca a cabeça medial.'],
  ['Extensão overhead na polia', 'TRICEPS', 'Polia', 'De costas para a polia. Alonga a cabeça longa do tríceps.'],
  ['Flexão fechada', 'TRICEPS', 'Peso corporal', 'Mãos na largura do peito, cotovelos para trás.'],

  // --- PERNA ---------------------------------------------------------------
  ['Agachamento livre', 'PERNA', 'Barra', 'Joelhos acompanham a ponta dos pés. Não deixe o joelho cair para dentro.'],
  ['Agachamento frontal', 'PERNA', 'Barra', 'Cotovelos altos. Exige tronco mais ereto e cobra o quadríceps.'],
  ['Agachamento no Smith', 'PERNA', 'Smith', 'Pés um pouco à frente. Bom para quem ainda ajusta o padrão do agachamento.'],
  ['Agachamento búlgaro', 'PERNA', 'Halteres', 'Pé de trás elevado. O joelho da frente não passa muito da ponta do pé.'],
  ['Agachamento sumô', 'PERNA', 'Haltere', 'Pés bem abertos e apontados para fora. Pega mais adutor e glúteo.'],
  ['Hack machine', 'PERNA', 'Máquina', 'Costas coladas. Não trave o joelho no topo.'],
  ['Leg press 45', 'PERNA', 'Máquina', 'Não trave o joelho na extensão e não deixe a lombar sair do banco.'],
  ['Leg press horizontal', 'PERNA', 'Máquina', 'Amplitude controlada. Joelho não passa da linha do peito.'],
  ['Cadeira extensora', 'PERNA', 'Máquina', 'Controle a descida. Pausa de 1 segundo em cima.'],
  ['Mesa flexora', 'PERNA', 'Máquina', 'Quadril colado no banco. Se ele sobe, tire carga.'],
  ['Cadeira flexora', 'PERNA', 'Máquina', 'Costas apoiadas. Puxe até o limite sem levantar o quadril.'],
  ['Flexora em pé', 'PERNA', 'Máquina', 'Um lado por vez. Tronco parado.'],
  ['Afundo', 'PERNA', 'Halteres', 'Passo longo. Desça o joelho de trás quase ao chão, tronco ereto.'],
  ['Afundo caminhando', 'PERNA', 'Halteres', 'Mesmo padrão, avançando. Exige mais equilíbrio.'],
  ['Passada lateral', 'PERNA', 'Peso corporal', 'Sente no quadril da perna que dobra. Trabalha adutor.'],
  ['Stiff', 'PERNA', 'Barra', 'Joelhos quase retos, quadril para trás. Pare quando a lombar quiser dobrar.'],
  ['Levantamento terra sumô', 'PERNA', 'Barra', 'Pés abertos, mãos por dentro dos joelhos. Mais quadril, menos lombar.'],
  ['Cadeira adutora', 'PERNA', 'Máquina', 'Movimento curto e controlado, sem pancada no fim.'],
  ['Cadeira abdutora', 'PERNA', 'Máquina', 'Tronco levemente à frente recruta mais glúteo médio.'],
  ['Agachamento goblet', 'PERNA', 'Haltere', 'Halter junto ao peito. Ótimo para aprender a descer com o tronco ereto.'],
  ['Passada no step', 'PERNA', 'Step', 'Suba empurrando com o calcanhar da perna de cima, não com a de baixo.'],
  ['Agachamento pistol', 'PERNA', 'Peso corporal', 'Uma perna só. Comece apoiado até dominar o equilíbrio.'],

  // --- GLÚTEO --------------------------------------------------------------
  ['Elevação pélvica', 'GLUTEO', 'Barra', 'Contraia o glúteo no topo por 1 segundo. Queixo para o peito.'],
  ['Elevação pélvica unilateral', 'GLUTEO', 'Peso corporal', 'Uma perna. Quadril não pode inclinar para o lado.'],
  ['Ponte de glúteo', 'GLUTEO', 'Peso corporal', 'Empurre pelos calcanhares. Costelas para baixo, sem arquear a lombar.'],
  ['Coice na polia', 'GLUTEO', 'Polia baixa', 'Tronco fixo. O movimento termina na linha do corpo, não além.'],
  ['Coice na máquina', 'GLUTEO', 'Máquina', 'Quadril apoiado no suporte e tronco parado. Sem impulso de lombar.'],
  ['Abdução em pé na polia', 'GLUTEO', 'Polia baixa', 'Perna estendida para fora. Trabalha glúteo médio.'],
  ['Abdução com miniband', 'GLUTEO', 'Elástico', 'Elástico acima do joelho. Ótimo aquecimento antes de agachar.'],
  ['Levantamento terra romeno unilateral', 'GLUTEO', 'Haltere', 'Uma perna apoiada. Quadril fecha e abre, sem rodar.'],
  ['Agachamento sumô com halter', 'GLUTEO', 'Haltere', 'Pés abertos. Empurre os joelhos para fora na subida.'],
  ['Cadeira abdutora (glúteo)', 'GLUTEO', 'Máquina', 'Incline o tronco à frente para pegar mais glúteo médio.'],
  ['Hip thrust na máquina', 'GLUTEO', 'Máquina', 'Amplitude completa. Pausa no topo.'],
  ['Passada reversa', 'GLUTEO', 'Halteres', 'Passo para trás. Menos joelho e mais glúteo que o afundo à frente.'],

  // --- PANTURRILHA ---------------------------------------------------------
  ['Panturrilha em pé', 'PANTURRILHA', 'Máquina', 'Amplitude completa: desça até alongar, suba até o máximo. Pausa embaixo.'],
  ['Panturrilha sentado', 'PANTURRILHA', 'Máquina', 'Joelho dobrado pega o sóleo, a parte de baixo da panturrilha.'],
  ['Panturrilha no leg press', 'PANTURRILHA', 'Máquina', 'Só a ponta dos pés na plataforma. Joelho levemente flexionado.'],
  ['Panturrilha unilateral', 'PANTURRILHA', 'Haltere', 'Uma perna por vez, apoiado com a mão livre.'],
  ['Panturrilha no step', 'PANTURRILHA', 'Step', 'Calcanhar abaixo da linha do degrau para alongar.'],
  ['Panturrilha no Smith', 'PANTURRILHA', 'Smith', 'Permite carga alta com segurança. Movimento lento.'],

  // --- ABDÔMEN -------------------------------------------------------------
  ['Prancha abdominal', 'ABDOMEN', 'Peso corporal', 'Quadril na linha do corpo. Se cair ou subir, encerre a série.'],
  ['Prancha lateral', 'ABDOMEN', 'Peso corporal', 'Corpo em linha reta vista de frente. Quadril não desce.'],
  ['Abdominal supra', 'ABDOMEN', 'Peso corporal', 'Mãos ao lado da cabeça sem puxar o pescoço. Suba pela contração.'],
  ['Abdominal infra', 'ABDOMEN', 'Peso corporal', 'Lombar colada no chão. Se ela sobe, diminua a amplitude.'],
  ['Elevação de pernas suspenso', 'ABDOMEN', 'Barra fixa', 'Sem balanço. Suba as pernas com o quadril enrolando.'],
  ['Elevação de joelhos no paralelo', 'ABDOMEN', 'Paralelas', 'Versão mais fácil da suspensa. Controle a descida.'],
  ['Abdominal na polia (ajoelhado)', 'ABDOMEN', 'Polia alta', 'Enrole a coluna. Não é movimento de quadril.'],
  ['Abdominal oblíquo', 'ABDOMEN', 'Peso corporal', 'Leve o cotovelo ao joelho oposto sem puxar o pescoço.'],
  ['Russian twist', 'ABDOMEN', 'Anilha', 'Gire o tronco, não só os braços. Pés podem ficar no chão.'],
  ['Abdominal remador', 'ABDOMEN', 'Peso corporal', 'Tronco e pernas sobem juntos. Movimento controlado.'],
  ['Prancha com apoio alternado', 'ABDOMEN', 'Peso corporal', 'Tire uma mão por vez sem girar o quadril.'],
  ['Ab wheel', 'ABDOMEN', 'Roda abdominal', 'Avance só até onde a lombar não arqueia. Volte pela contração.'],
  ['Dead bug', 'ABDOMEN', 'Peso corporal', 'Braço e perna opostos. Lombar colada no chão o tempo todo.'],
  ['Bird dog', 'ABDOMEN', 'Peso corporal', 'Estenda braço e perna opostos sem inclinar o quadril.'],
  ['Prancha dinâmica', 'ABDOMEN', 'Peso corporal', 'Alterne apoio de mão e antebraço mantendo o quadril parado.'],
  ['Hollow hold', 'ABDOMEN', 'Peso corporal', 'Lombar colada. Braços e pernas o mais baixo que der sem descolar.'],

  // --- CORPO INTEIRO -------------------------------------------------------
  ['Burpee', 'CORPO_INTEIRO', 'Peso corporal', 'Movimento contínuo. Se cansar, tire o salto antes de perder a técnica.'],
  ['Thruster', 'CORPO_INTEIRO', 'Halteres', 'Agachamento emendado com desenvolvimento, num movimento só.'],
  ['Clean (levantamento olímpico)', 'CORPO_INTEIRO', 'Barra', 'Técnica antes de carga. Aprenda com acompanhamento.'],
  ['Arranco (snatch)', 'CORPO_INTEIRO', 'Barra', 'O mais técnico dos levantamentos. Comece só com a barra.'],
  ['Kettlebell swing', 'CORPO_INTEIRO', 'Kettlebell', 'O movimento é de quadril, não de braço. O peso é lançado, não levantado.'],
  ['Turkish get-up', 'CORPO_INTEIRO', 'Kettlebell', 'Deitado até em pé, um passo por vez. Carga leve.'],
  ['Farmer walk', 'CORPO_INTEIRO', 'Halteres', 'Caminhe ereto com peso nas duas mãos. Ombros para trás.'],
  ['Battle rope', 'CORPO_INTEIRO', 'Corda naval', 'Joelhos semiflexionados. Alterne ou bata as duas juntas.'],
  ['Wall ball', 'CORPO_INTEIRO', 'Bola', 'Agache e lance a bola no alvo. Receba já descendo.'],
  ['Mountain climber', 'CORPO_INTEIRO', 'Peso corporal', 'Prancha firme. O quadril não sobe conforme acelera.'],
  ['Jump squat', 'CORPO_INTEIRO', 'Peso corporal', 'Aterrisse com o joelho macio, nunca travado.'],
  ['Prowler / trenó', 'CORPO_INTEIRO', 'Trenó', 'Tronco inclinado, passos curtos e fortes.'],

  // --- CARDIO --------------------------------------------------------------
  ['Esteira — caminhada inclinada', 'CARDIO', 'Esteira', 'Inclinação 8-12% sem se apoiar no corrimão. Apoiar tira metade do gasto.'],
  ['Esteira — corrida contínua', 'CARDIO', 'Esteira', 'Ritmo em que você ainda consegue falar frases curtas.'],
  ['Esteira — tiros (HIIT)', 'CARDIO', 'Esteira', 'Alterne esforço forte e caminhada. Comece com 1 minuto para 2.'],
  ['Bicicleta ergométrica', 'CARDIO', 'Bicicleta', 'Selim na altura do quadril; joelho quase reto embaixo.'],
  ['Bicicleta — tiros', 'CARDIO', 'Bicicleta', 'Carga alta por 20-30 segundos, leve para recuperar.'],
  ['Elíptico', 'CARDIO', 'Elíptico', 'Use também os braços. Baixo impacto para quem tem dor no joelho.'],
  ['Remo ergômetro', 'CARDIO', 'Remo', 'Ordem: pernas, tronco, braços. Na volta, o inverso.'],
  ['Escada / simulador', 'CARDIO', 'Escada', 'Não se pendure no corrimão. Postura ereta.'],
  ['Corda naval — cardio', 'CARDIO', 'Corda naval', 'Séries curtas de alta intensidade.'],
  ['Pular corda', 'CARDIO', 'Corda', 'Saltos baixos, na ponta dos pés. O giro é de punho.'],
] as const;
