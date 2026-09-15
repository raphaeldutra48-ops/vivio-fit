/**
 * Passo a passo de execução, por exercício.
 *
 * ## Por que existe, se cada exercício já tem `instrucoes`
 *
 * As duas coisas servem a momentos diferentes, e uma não substitui a outra.
 *
 * `instrucoes` é **uma linha** e diz o erro que se comete naquele movimento —
 * "não deixe o joelho cair para dentro". É para ler de relance, entre uma
 * série e outra, por quem já sabe fazer.
 *
 * `passos` ensina o movimento a quem nunca fez. Lê-se uma vez, com calma,
 * antes da primeira tentativa.
 *
 * ## Cobertura parcial, de propósito
 *
 * Escrever seis passos para 156 exercícios é umas quinze mil palavras, e feito
 * de uma vez sairia raso — que é pior que não ter. A lista começa pelos que
 * mais aparecem em treino e pelos de maior risco de lesão quando executados
 * errado; exercício sem passos cai para a linha única, que continua lá.
 *
 * Ligado por **nome**, como o mapa do wger, e com o mesmo teste protegendo
 * contra nome que não existe no catálogo.
 */
export const PASSOS_EXERCICIOS: Readonly<Record<string, readonly string[]>> = {
  // --- peito ---------------------------------------------------------------
  'Supino reto com barra': [
    'Deite no banco com os pés firmes no chão e o quadril apoiado.',
    'Puxe as escápulas para trás e para baixo, como se guardasse no bolso de trás, e mantenha assim o exercício inteiro.',
    'Pegue a barra um pouco mais aberto que a largura dos ombros.',
    'Desça a barra controlando, até tocar de leve a linha do mamilo — não o pescoço.',
    'Empurre de volta até estender os cotovelos, sem travar com força.',
    'Se a barra sobe torta ou o quadril levanta do banco, o peso está alto demais.',
  ],
  'Supino inclinado com halteres': [
    'Ajuste o banco entre 30 e 45 graus. Mais que isso e o ombro assume o trabalho.',
    'Sente com os halteres nas coxas e use as pernas para jogá-los à posição inicial ao deitar.',
    'Comece com os braços estendidos, halteres na largura dos ombros.',
    'Desça até os halteres ficarem na altura do peito, cotovelos a cerca de 45 graus do tronco.',
    'Suba juntando os halteres sem batê-los um no outro.',
  ],
  'Crucifixo reto': [
    'Deite com um haltere em cada mão, braços estendidos acima do peito.',
    'Dobre levemente os cotovelos e **trave** esse ângulo — ele não muda mais.',
    'Abra os braços em arco até sentir o peitoral alongar, sem forçar o ombro.',
    'Volte pelo mesmo arco, imaginando que abraça um barril.',
    'Se o cotovelo dobra e estende durante o movimento, virou supino: reduza a carga.',
  ],
  'Flexão de braço': [
    'Apoie as mãos no chão, um pouco mais abertas que os ombros.',
    'Estenda as pernas e forme uma linha reta do calcanhar à cabeça.',
    'Contraia abdômen e glúteo para o quadril não subir nem afundar.',
    'Desça até o peito quase tocar o chão, cotovelos a 45 graus do tronco.',
    'Empurre de volta mantendo a linha do corpo.',
    'Se o quadril cai, apoie os joelhos e faça a versão facilitada.',
  ],
  // --- costas --------------------------------------------------------------
  'Puxada frontal': [
    'Ajuste o apoio das coxas para o corpo não subir junto com o peso.',
    'Pegue a barra mais aberto que os ombros, palmas para a frente.',
    'Sente com o tronco levemente inclinado para trás e o peito aberto.',
    'Puxe a barra até a parte alta do peito, levando os cotovelos para baixo e para trás.',
    'Suba controlando, deixando as escápulas subirem no fim.',
    'Nunca puxe atrás da nuca: o ombro fica numa posição vulnerável e não há ganho.',
  ],
  'Remada curvada com barra': [
    'Em pé, pés na largura do quadril, segure a barra com pegada pronada.',
    'Empurre o quadril para trás e incline o tronco até cerca de 45 graus, com a coluna neutra.',
    'Deixe a barra pendurada com os braços estendidos, próxima às canelas.',
    'Puxe a barra em direção ao umbigo, levando os cotovelos rentes ao tronco.',
    'Desça controlando, sem deixar o tronco subir para ajudar.',
    'Se as costas arredondam, tire peso: a lombar não deve ceder em nenhum momento.',
  ],
  'Levantamento terra': [
    'Pés na largura do quadril, barra sobre o meio do pé, quase encostando na canela.',
    'Empurre o quadril para trás e dobre os joelhos até alcançar a barra.',
    'Pegue por fora das pernas e puxe o peito para cima até a coluna ficar neutra.',
    'Empurre o chão com as pernas — o movimento começa nelas, não nas costas.',
    'Passando os joelhos, estenda o quadril até ficar em pé, sem jogar o tronco para trás.',
    'Desça pelo mesmo caminho, com a barra rente às pernas.',
  ],
  'Barra fixa pronada': [
    'Segure a barra com as palmas para a frente, um pouco mais aberto que os ombros.',
    'Fique pendurado com os braços estendidos e as escápulas soltas.',
    'Antes de puxar, "encaixe" os ombros: puxe as escápulas para baixo.',
    'Suba levando os cotovelos para baixo e para trás, peito em direção à barra.',
    'Passe o queixo da barra e desça controlando até estender de novo.',
    'Sem balanço: se precisar impulsionar as pernas, use a versão assistida.',
  ],
  // --- ombro ---------------------------------------------------------------
  'Desenvolvimento militar': [
    'Em pé, pés na largura do quadril, barra apoiada na parte alta do peito.',
    'Contraia abdômen e glúteo — é isso que impede a lombar de arquear.',
    'Empurre a barra para cima, tirando a cabeça levemente do caminho.',
    'Estenda os cotovelos com a barra acima da cabeça, alinhada ao meio dos pés.',
    'Desça controlando até a barra voltar à altura do queixo.',
    'Se a lombar arqueia para você conseguir subir, o peso está alto demais.',
  ],
  'Elevação lateral': [
    'Em pé, um haltere em cada mão ao lado do corpo, cotovelos levemente dobrados.',
    'Mantenha o tronco parado — sem balanço para dar impulso.',
    'Levante os braços pelos lados até a altura dos ombros, não além.',
    'O mindinho deve terminar um pouco mais alto que o polegar.',
    'Desça devagar, controlando a descida por dois segundos.',
  ],
  // --- bíceps e tríceps ----------------------------------------------------
  'Rosca direta com barra': [
    'Em pé, pés na largura do quadril, barra com pegada supinada na largura dos ombros.',
    'Cotovelos junto ao tronco. Eles ficam parados o exercício inteiro.',
    'Suba a barra dobrando só os cotovelos, até a altura do peito.',
    'Desça controlando até estender quase por completo.',
    'Se o cotovelo vai para a frente ou o tronco balança, o peso está alto.',
  ],
  'Tríceps na polia com barra': [
    'De frente para a polia alta, pegue a barra com as palmas para baixo.',
    'Cotovelos colados ao tronco, antebraços paralelos ao chão.',
    'Estenda os cotovelos empurrando a barra para baixo, até os braços ficarem retos.',
    'Segure um instante embaixo e volte controlando até o antebraço ficar paralelo ao chão.',
    'O cotovelo não sai do lugar: se ele abre para os lados, reduza a carga.',
  ],
  // --- perna ---------------------------------------------------------------
  'Agachamento livre': [
    'Barra apoiada na parte alta das costas, não no pescoço.',
    'Pés na largura dos ombros, pontas levemente para fora.',
    'Inspire, contraia o abdômen e empurre o quadril para trás enquanto dobra os joelhos.',
    'Desça até a coxa ficar paralela ao chão, ou até onde a coluna se mantenha neutra.',
    'Os joelhos acompanham a direção dos pés — não deixe cair para dentro.',
    'Suba empurrando o chão com o meio do pé, estendendo joelho e quadril juntos.',
  ],
  'Leg press 45': [
    'Sente com as costas e o quadril totalmente apoiados no encosto.',
    'Pés na plataforma na largura dos ombros, na altura média.',
    'Destrave o aparelho e desça controlando até o joelho formar cerca de 90 graus.',
    'Pare antes de a lombar descolar do encosto — é o limite da sua amplitude.',
    'Empurre de volta sem travar o joelho no fim.',
  ],
  Stiff: [
    'Em pé, barra à frente das coxas, pegada na largura dos ombros.',
    'Joelhos quase retos, com uma dobra mínima que não muda durante o movimento.',
    'Empurre o quadril para trás, deixando a barra descer rente às pernas.',
    'Desça até sentir o posterior da coxa alongar — normalmente perto do joelho.',
    'Pare no instante em que a lombar quiser arredondar.',
    'Volte empurrando o quadril para a frente, contraindo o glúteo no fim.',
  ],
  'Elevação pélvica': [
    'Sente no chão com as costas apoiadas num banco, na linha das escápulas.',
    'Barra sobre o quadril, com proteção. Pés na largura do quadril, joelhos a 90 graus.',
    'Queixo levemente para o peito e costelas para baixo.',
    'Empurre pelos calcanhares e suba o quadril até o tronco ficar paralelo ao chão.',
    'Contraia o glúteo no topo por um segundo.',
    'Desça controlando, sem apoiar totalmente o peso entre as repetições.',
  ],
  // --- abdômen -------------------------------------------------------------
  'Prancha abdominal': [
    'Apoie os antebraços no chão, cotovelos abaixo dos ombros.',
    'Estenda as pernas e apoie as pontas dos pés.',
    'Forme uma linha reta do calcanhar à cabeça.',
    'Contraia abdômen e glúteo; leve as costelas levemente para baixo.',
    'Respire normalmente e segure. Quando o quadril subir ou cair, encerre a série.',
  ],
} as const;
