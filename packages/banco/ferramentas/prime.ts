/**
 * Vídeos do Prime Coaching → catálogo do Vívio.
 *
 * ## De onde vem, e com que direito
 *
 * A exportação da biblioteca de exercícios do Prime (`todos os exercicios.xlsx`,
 * 752 linhas: ~250 exercícios em português, espanhol e inglês). Os vídeos moram
 * na conta paga deles no Bunny.net Stream, biblioteca `693551`, e são
 * demonstrações produzidas por eles.
 *
 * Em 24/08 eles ficaram de fora por direito autoral (ver
 * `docs/BENCHMARK-PRIME.md`, seção 8). Em 10/09 o Raphael informou que o Prime
 * autorizou o uso e assumiu a responsabilidade pela autorização. Ela precisa
 * existir **por escrito** fora deste repositório: é o que responde a uma
 * notificação de loja, não este comentário.
 *
 * ## Só português
 *
 * A mesma demonstração aparece três vezes na planilha, uma por idioma, com
 * vídeos diferentes — o áudio e o texto na tela mudam. Este mapa usa só as
 * linhas marcadas "Português".
 *
 * ## Como os arquivos chegam
 *
 * Ainda não chegam. A página do player é pública, mas o arquivo de vídeo
 * responde 403: a conta do Prime bloqueia o acesso direto, e só o player deles
 * busca o vídeo. Passar por cima disso seria disfarçar a requisição como se
 * fosse o player do Prime — contornar uma proteção que eles mesmos ligaram, e
 * isso não se faz nem com autorização. Com autorização há caminho melhor: uma
 * chave de leitura da biblioteca, ou os arquivos entregues por eles.
 *
 * ## O casamento
 *
 * Mesma regra do `wger.ts`: **mapa escrito à mão, nunca adivinhação**. Vídeo
 * errado é pior que vídeo nenhum — ninguém desconfia de uma demonstração, e o
 * aluno executa o movimento errado achando que está certo. Cada linha foi
 * decidida olhando o catálogo inteiro, e não só o candidato mais parecido.
 *
 * O comparador por palavras sozinho teria errado feio, e fica registrado para
 * ninguém confiar nele de novo:
 *
 * - "Rotação externa de ombro na polia" pontuou 0,75 contra a nossa "Rotação
 *   **interna**" — o movimento oposto, no mesmo músculo.
 * - "Desenvolvimento com halteres com banco inclinado" caiu numa **remada**.
 * - "Supino declinado com barra" caiu no supino **reto**; o certo, o nosso
 *   "Supino declinado", vinha em segundo.
 *
 * `conferir` marca o par que é provavelmente o mesmo exercício, mas cujo nome
 * não diz o bastante — quase sempre o aparelho. Esses vão para o teste antes do
 * catálogo: alguém assiste ao vídeo e confirma.
 *
 * ## O que ficou de fora, e por quê
 *
 * **Aparelho diferente do nosso** — o vídeo mostraria outra coisa:
 * variações na máquina, no Smith ou na polia que o catálogo não tem ("Rosca
 * Scott na Máquina", "Supino inclinado no Smith", "Rosca martelo na polia"),
 * "Elevação pélvica unilateral com barra" (a nossa é sem peso), "Leg press 180
 * unilateral" (o nosso unilateral fica no 45).
 *
 * **Movimento diferente, nome parecido**: "Passada com barra nas costas" não é
 * o búlgaro; "Prancha com elevação de perna" não é a elevação suspensa; "Rosca
 * de punho com corda" e "com halteres" não são roscas de bíceps.
 *
 * **Genérico demais para escolher**: "4 apoios" (o nosso é na polia), "Glúteo
 * na polia", "Extensão de quadril", "Elevação de pernas" (deitado ou
 * suspenso?). Com dois candidatos plausíveis, não há como saber sem ver.
 *
 * **Sinônimos no nosso catálogo.** Quatro pares são o mesmo exercício com dois
 * nomes — "Face pull" e "Face pull para ombro", "Agachamento sumô" e
 * "Agachamento sumô com halter", "Supino fechado" e "Supino fechado (tríceps)",
 * "Afundo" e "Afundo com halteres". Os dois de cada par recebem o mesmo vídeo,
 * e o teste só aceita repetição nesses quatro. Unir os pares é outra conversa:
 * mexe em plano e execução que já existem.
 */

export const BIBLIOTECA_PRIME = '693551';

/** Crédito exibido junto do vídeo. */
export const CREDITO_PRIME = 'Prime Coaching — uso autorizado';

/** A página do player de onde o vídeo veio — a procedência, para quem conferir. */
export const origemPrime = (video: string): string =>
  `https://iframe.mediadelivery.net/embed/${BIBLIOTECA_PRIME}/${video}`;

export interface VideoPrime {
  /** Como o Prime chama o exercício — para achar a linha na planilha. */
  nomeNoPrime: string;
  /** Id do vídeo na biblioteca do Bunny. */
  video: string;
  /** Presente quando o nome não basta: assistir antes de pôr no catálogo. */
  conferir?: string;
}

/** Nome no nosso catálogo → vídeo em português do Prime. */

export const MAPA_PRIME: Readonly<Record<string, VideoPrime>> = {
  // --- peito -----------------------------------------------------------------
  'Crossover na polia média': {
    nomeNoPrime: 'Crossover médio',
    video: '8807f0f6-0093-4c83-9266-465e6c7dd8d5',
  },
  'Crossover polia alta': {
    nomeNoPrime: 'Crossover',
    video: '0fda029c-07b4-42c8-b8c9-3c31e1f61631',
    conferir: 'o Crossover deles não diz a altura; costuma ser a polia alta',
  },
  'Crossover polia baixa': {
    nomeNoPrime: 'Crossover baixo',
    video: '887baaf4-c16a-449b-ad3a-a9000b563048',
  },
  'Crucifixo declinado': {
    nomeNoPrime: 'Crucifixo declinado',
    video: '97ef7a96-1f33-4f5e-8688-81fdf6de689d',
  },
  'Crucifixo inclinado': {
    nomeNoPrime: 'Crucifixo inclinado com halter',
    video: '0a08022e-e1c2-4e90-8e79-02bf4a5f946d',
  },
  'Crucifixo na polia': {
    nomeNoPrime: 'Crucifixo reto no cabo',
    video: '66b1d3f4-1242-40e9-8128-b0d9441644fa',
    conferir: 'o nosso não diz se é no banco ou em pé',
  },
  'Crucifixo reto': {
    nomeNoPrime: 'Crucifixo reto com halter',
    video: 'd1956d61-f403-451b-91c2-453b27035d34',
  },
  'Flexão de braço': {
    nomeNoPrime: 'Flexão de braços',
    video: '3c67b9e4-6844-40b4-a5b4-12e935e14e93',
  },
  'Paralelas na máquina': {
    nomeNoPrime: 'Paralelas na máquina',
    video: '2a6fd9da-aa26-4c19-95e4-0c5fb6a6ab5a',
  },
  'Peck deck (voador)': {
    nomeNoPrime: 'Voador',
    video: 'eba688e6-5774-4639-aab4-4a1eb8e20539',
  },
  'Pullover': {
    nomeNoPrime: 'Pullover com haltere',
    video: 'bfdba23f-ab3a-4a19-824c-142a7b44433b',
  },
  'Supino declinado': {
    nomeNoPrime: 'Supino declinado com barra',
    video: '25eb9c42-5222-4fc5-9fa7-3d7039066324',
  },
  'Supino inclinado com barra': {
    nomeNoPrime: 'Supino inclinado com barra',
    video: 'f8846763-712f-4cc0-ab1e-a7a4d33a8c53',
  },
  'Supino inclinado com halteres': {
    nomeNoPrime: 'Supino inclinado com halteres',
    video: 'f6fca161-b5a5-4318-adf5-5ac606544c1d',
  },
  'Supino na máquina': {
    nomeNoPrime: 'Supino reto na máquina',
    video: 'ba652a68-808d-459a-a905-63aeb137e5af',
  },
  'Supino no chão': {
    nomeNoPrime: 'Supino reto deitado no chão',
    video: 'ff153f75-252d-45b6-b6bb-f1441fe7af13',
    conferir: 'o nome não diz o aparelho; o nosso é com barra',
  },
  'Supino reto com barra': {
    nomeNoPrime: 'Supino reto com barra',
    video: '0a596c8e-9e42-4511-a414-11d98fbc8067',
  },
  'Supino reto com halteres': {
    nomeNoPrime: 'Supino reto com halteres',
    video: '477d9976-c950-4c51-b3b2-79d6150ce2d4',
  },
  'Supino fechado': {
    nomeNoPrime: 'Supino para tríceps',
    video: '35dfa4f3-67d8-43ce-8d32-a8237cbc32a5',
    conferir: 'supino para tríceps deve ser o fechado; confirmar a pegada',
  },
  // --- costas ----------------------------------------------------------------
  'Barra fixa pronada': {
    nomeNoPrime: 'Barra fixa pronada',
    video: 'b56ea364-d125-4870-9859-afcb55df0dee',
  },
  'Barra fixa supinada': {
    nomeNoPrime: 'Barra fixa supinada',
    video: '95f2bf0a-a4eb-47a6-9d79-cc822123c179',
  },
  'Encolhimento de ombros': {
    nomeNoPrime: 'Encolhimento de ombros',
    video: 'f82f4ee0-cc8e-4a40-942d-50cd4e27f14f',
    conferir: 'o nome não diz o aparelho; o nosso é com halteres',
  },
  'Face pull': {
    nomeNoPrime: 'Face pull com corda na polia',
    video: '32bf7a28-18e8-4403-91cb-31553689eabf',
  },
  'Good morning': {
    nomeNoPrime: 'Goodmorning barra livre',
    video: 'f07c00dd-1acd-4c2d-9281-94e84ce23d24',
  },
  'High row na máquina': {
    nomeNoPrime: 'High Row',
    video: '02565a48-a54a-4446-8de6-460a3c333009',
  },
  'Hiperextensão lombar': {
    nomeNoPrime: 'Lombar no Banco Romano',
    video: '46a0c5b9-9ed8-40bb-a264-e63d028932e7',
  },
  'Levantamento terra': {
    nomeNoPrime: 'Levantamento terra',
    video: 'd330dc46-e8d5-41e0-98b4-0db9d3cb2783',
  },
  'Levantamento terra romeno': {
    nomeNoPrime: 'RDL (Romanian Deadlift)',
    video: '24e915da-8369-42cb-a8c6-5089d4a97cb0',
    conferir: 'o nome não diz o aparelho; o nosso é com barra',
  },
  'Pulldown com braço reto': {
    nomeNoPrime: 'Pulldown na polia com barra reta',
    video: 'b4adec5a-db72-4207-af8e-13735606c62c',
  },
  'Pullover na máquina': {
    nomeNoPrime: 'Pullover Maquina',
    video: '514e9689-eb40-4be8-be9d-cfd5060212a2',
  },
  'Puxada frontal': {
    nomeNoPrime: 'Puxador pela frente pegada aberta',
    video: 'ed90821f-5947-4615-ba95-6efcf73bc0bf',
  },
  'Puxada pegada neutra': {
    nomeNoPrime: 'Puxador pela frente pegada neutra',
    video: '12bd0dee-88f5-42ce-9b60-df64d5667e24',
  },
  'Puxada por trás': {
    nomeNoPrime: 'Puxador por traz pegada aberta',
    video: '021119b8-54e0-4407-9826-4a001f54a987',
  },
  'Puxada supinada': {
    nomeNoPrime: 'Puxador pela frente pegada supinada',
    video: '59a26ac0-679b-4347-adca-27bb7f0c1f4f',
  },
  'Puxada triângulo': {
    nomeNoPrime: 'Puxador pela frente com triângulo',
    video: 'a9c9e4c5-4154-4851-a1fc-057ee3f1a0fe',
  },
  'Puxada unilateral na polia': {
    nomeNoPrime: 'Puxador pela frente unilateral',
    video: 'fa25c9b9-7797-4b26-aa9d-d16c7839cf36',
  },
  'Remada articulada': {
    nomeNoPrime: 'Remada articulada pronada',
    video: 'b4c2fe8c-d62b-48a7-98ac-bfdad9f45045',
    conferir: 'o nosso não diz a pegada; o deles tem pronada e fechada',
  },
  'Remada articulada unilateral': {
    nomeNoPrime: 'Remada articulada pronada unilateral',
    video: '8ea50387-5068-4b7e-b1e0-977c6ee66918',
    conferir: 'o nosso não diz a pegada; o deles tem pronada e fechada',
  },
  'Remada baixa': {
    nomeNoPrime: 'Remada baixa triângulo',
    video: '551f27c8-adfd-4b5a-ae56-5513459f4425',
  },
  'Remada baixa pegada aberta': {
    nomeNoPrime: 'Remada baixa pegada aberta no pulley',
    video: 'f0240202-f51e-4962-b19a-120b6bac48f6',
  },
  'Remada baixa pegada supinada': {
    nomeNoPrime: 'Remada baixa pegada supinada no pulley',
    video: '110b7bf5-5d7f-4792-8401-67223f9c0ac2',
  },
  'Remada cavalinho': {
    nomeNoPrime: 'Remada Cavalinho barra livre',
    video: 'b58101a3-7b01-46d5-9afc-26043bc148e4',
  },
  'Remada cavalinho pronada': {
    nomeNoPrime: 'Cavalinho Pronado',
    video: 'd625ea3a-af31-4418-92b0-e1a8225197f9',
    conferir: 'o nosso é barra com apoio; confirmar o apoio de peito',
  },
  'Remada com halteres no banco inclinado': {
    nomeNoPrime: 'Remada com halteres no banco inclinado',
    video: '3b39fe32-8164-4dc1-bd72-ee433f8c1a4f',
  },
  'Remada curvada com barra': {
    nomeNoPrime: 'Remada curvada',
    video: '85cf389d-4dee-4884-a9d2-d0bdd70318fa',
  },
  'Remada Meadows': {
    nomeNoPrime: 'Meadows Row',
    video: 'b5a34b9c-e5b6-4487-a51a-f3f992145c44',
  },
  'Remada na máquina': {
    nomeNoPrime: 'Remada máquina',
    video: 'e642f040-d8f4-4685-88aa-bd90e8831f26',
  },
  'Remada unilateral': {
    nomeNoPrime: 'Remada unilateral com haltere',
    video: 'a08123cb-661a-4260-b2da-4dc98bcbd060',
  },
  // --- ombro -----------------------------------------------------------------
  'Face pull para ombro': {
    nomeNoPrime: 'Face pull com corda na polia',
    video: '32bf7a28-18e8-4403-91cb-31553689eabf',
  },
  'Crucifixo inverso': {
    nomeNoPrime: 'Crucifixo inverso com halteres',
    video: 'c263be1e-005f-43ef-8a42-4e98ed34df60',
  },
  'Crucifixo inverso na máquina': {
    nomeNoPrime: 'Crucifixo inverso na máquina',
    video: '6fcc7854-c1df-4079-9e30-3180d6f89df2',
  },
  'Crucifixo inverso na polia': {
    nomeNoPrime: 'Crucifixo inverso Cross over',
    video: '28e37ea7-7f01-4be3-9f23-dba5d5861f75',
  },
  'Desenvolvimento Arnold': {
    nomeNoPrime: 'Desenvolvimento Arnold',
    video: 'dfe7b4ee-3931-4879-8664-9646dde8cba0',
  },
  'Desenvolvimento com halteres': {
    nomeNoPrime: 'Desenvolvimento com halteres',
    video: '1161dbe4-b3f7-488b-9677-69d1ff655f94',
  },
  'Desenvolvimento militar': {
    nomeNoPrime: 'Desenvolvimento militar',
    video: '2d1ada3c-7836-495d-84e2-6b90d09905cf',
  },
  'Desenvolvimento na máquina': {
    nomeNoPrime: 'Desenvolvimento máquina',
    video: '1e0cc6e0-af4f-48e1-b746-58dda9b36ac2',
  },
  'Desenvolvimento no Smith': {
    nomeNoPrime: 'Desenvolvimento no Smith',
    video: '86415391-0e30-4724-b857-0e656753982f',
  },
  'Elevação frontal': {
    nomeNoPrime: 'Elevaçao frontal com halteres',
    video: 'debb01a1-5f0e-4495-86e6-885986d47c8b',
  },
  'Elevação frontal na polia': {
    nomeNoPrime: 'Elevação frontal na polia',
    video: 'b5c5b108-2ca3-4718-b4f5-17ac1612e64a',
  },
  'Elevação lateral': {
    nomeNoPrime: 'Elevação lateral com halteres',
    video: '1921043d-c358-4c94-bf46-fcedfbc59670',
  },
  'Elevação lateral inclinada': {
    nomeNoPrime: 'Elevação lateral unilateral com Halter com banco inclinado',
    video: '4727fe06-9f8e-4515-9cbf-1e272a935083',
    conferir: 'o deles é no banco inclinado; confirmar que o nosso é o mesmo',
  },
  'Elevação lateral na polia': {
    nomeNoPrime: 'Elevação lateral na polia',
    video: '4fd26d54-9b17-49d4-bc29-b9f8b3569d74',
  },
  'Elevação lateral sentado': {
    nomeNoPrime: 'Elevação lateral com Halter sentado',
    video: '47a0b268-f53a-43fd-b169-90c56fa76cdb',
  },
  'Elevação Y': {
    nomeNoPrime: 'Elevaçao Y (Y-raise)',
    video: '130c8276-0923-4e7d-a222-7ff7593c2c0b',
  },
  'Remada alta': {
    nomeNoPrime: 'Remada alta com barra',
    video: '1cf22ee8-27c1-4ef2-91e2-8a17f885cc0c',
  },
  'Rotação externa': {
    nomeNoPrime: 'Rotação externa de ombro na polia',
    video: '89310e4f-594b-4497-9fb8-38ee239998db',
  },
  'Rotação interna de ombro na polia': {
    nomeNoPrime: 'Rotação interna de ombro na polia',
    video: '5bff9deb-9619-42f9-af11-784f612a9668',
  },
  // --- biceps ----------------------------------------------------------------
  'Extensão de punho': {
    nomeNoPrime: 'Extensão de punho',
    video: '5892d666-3dcb-4419-b95f-ad997d483edd',
    conferir: 'o nome não diz o aparelho; o nosso é com barra',
  },
  'Flexão de punho': {
    nomeNoPrime: 'Rosca de punho com barra',
    video: '3eb7d126-8788-43ca-8d80-a5c3c20f0e27',
    conferir: 'rosca de punho é a flexão: conferir palma PARA CIMA; a extensão é o movimento oposto',
  },
  'Flexão de punho na polia': {
    nomeNoPrime: 'Flexão de punho no cabo',
    video: 'd72fa32c-b674-4754-b03c-c21f90e843f8',
  },
  'Rosca alternada': {
    nomeNoPrime: 'Rosca alternada',
    video: '69c5281e-4e4d-40a2-b274-7cdf8897f0a9',
  },
  'Rosca concentrada': {
    nomeNoPrime: 'Rosca concentrada',
    video: '94184060-98f8-484d-80e8-816f21273c3e',
  },
  'Rosca corda na polia': {
    nomeNoPrime: 'Rosca martelo na polia',
    video: '946bfaa3-2661-4fe0-9138-68f6ab2b7073',
    conferir: 'rosca com corda costuma ser a pegada martelo; confirmar a corda',
  },
  'Rosca direta com barra': {
    nomeNoPrime: 'Rosca direta com barra',
    video: 'ac05cb02-3d68-4e5d-b8a6-6d492923ebcb',
  },
  'Rosca direta com halteres': {
    nomeNoPrime: 'Rosca Simultanea',
    video: '58414026-b559-449f-be71-c53ca5d93700',
    conferir: 'simultânea deve ser os dois braços com halteres; confirmar',
  },
  'Rosca inversa': {
    nomeNoPrime: 'Rosca inversa com barra',
    video: 'c5087c9f-b0d6-49dd-bb7e-579c34acae84',
  },
  'Rosca martelo': {
    nomeNoPrime: 'Rosca martelo com halteres',
    video: 'fee8c02e-893b-44a0-b632-9d8877bbbf01',
  },
  'Rosca na polia alta': {
    nomeNoPrime: 'Rosca bilateral na polia alta',
    video: 'd0fe2242-2d59-4382-a955-72bb962a4efc',
  },
  'Rosca na polia baixa': {
    nomeNoPrime: 'Rosca direta na polia',
    video: 'f2af8faf-01b3-46b4-9893-f0481e03bd79',
    conferir: 'o nome não diz a altura da polia',
  },
  'Rosca no banco inclinado': {
    nomeNoPrime: 'Rosca Simultanea Banco 45',
    video: '621ee99f-c006-4017-b707-d921305ebc0c',
    conferir: 'simultânea no banco 45; o nosso não diz se é alternada',
  },
  'Rosca scott': {
    nomeNoPrime: 'Rosca Scott com barra',
    video: 'b0841b5c-9bfa-4f6e-bdc0-7317c5c2ec83',
    conferir: 'o nosso é com barra W; o deles, barra: confirmar a barra',
  },
  'Rosca scott unilateral': {
    nomeNoPrime: 'Scott com Halter Unilateral',
    video: 'a9a97342-0cea-40f9-90bb-7f679cc34023',
  },
  'Rosca spider': {
    nomeNoPrime: 'Rosca spider com barra',
    video: 'c0a1f7f7-89f4-4425-afe1-91c781c2cab8',
    conferir: 'o nosso é com barra W; o deles, barra: confirmar a barra',
  },
  'Rosca Superman': {
    nomeNoPrime: 'Rosca Super Man',
    video: '2b83b511-7acc-4fa4-87d1-f3ef0562eeb6',
    conferir: 'o nosso diz polia BAIXA; a rosca superman costuma ser na polia alta',
  },
  // --- triceps ---------------------------------------------------------------
  'Supino fechado (tríceps)': {
    nomeNoPrime: 'Supino para tríceps',
    video: '35dfa4f3-67d8-43ce-8d32-a8237cbc32a5',
    conferir: 'supino para tríceps deve ser o fechado; confirmar a pegada',
  },
  'Extensão overhead na polia': {
    nomeNoPrime: 'Tríceps francês na polia',
    video: 'bebbcf20-1b4b-4c7c-b81b-1563a4c36a2e',
  },
  'Mergulho no banco': {
    nomeNoPrime: 'Tríceps apoiado no banco',
    video: 'fe5b41c0-bb76-4195-ad50-83a9600bb61b',
    conferir: 'tríceps apoiado no banco deve ser o mergulho; confirmar',
  },
  'Tríceps coice': {
    nomeNoPrime: 'Triceps Coice com Halter',
    video: 'f4a86977-78b7-47b6-8dee-490a7b77d159',
  },
  'Tríceps francês': {
    nomeNoPrime: 'Tríceps francês com haltere',
    video: 'b4ca730a-e6fe-4a0b-b53a-db1273d17c46',
  },
  'Tríceps na polia com barra': {
    nomeNoPrime: 'Tríceps barra na polia',
    video: 'f72e739c-4fb8-4ae8-88b4-efb9451e4c07',
  },
  'Tríceps na polia com corda': {
    nomeNoPrime: 'Tríceps corda',
    video: '5e250831-3078-45be-b1d1-a9e4978a5400',
  },
  'Tríceps na polia invertida': {
    nomeNoPrime: 'Triceps Supinado',
    video: 'da04fc79-c514-400e-9aff-ce80f01a7bb4',
    conferir: 'tríceps supinado deve ser a pegada invertida na polia; confirmar',
  },
  'Tríceps testa pegada pronada': {
    nomeNoPrime: 'Triceps testa pegada pronada',
    video: 'ee40165e-c0dd-4769-aab9-76bf559e8d2b',
  },
  'Tríceps unilateral na polia': {
    nomeNoPrime: 'Tríceps unilateral na polia',
    video: '9976b1db-cc41-4d19-adf5-7eb57811684f',
  },
  // --- perna -----------------------------------------------------------------
  'Agachamento sumô': {
    nomeNoPrime: 'Agachamento Sumo com Halter',
    video: 'bd5c933b-dea6-4373-a36b-4b8cf945863f',
  },
  'Cadeira abdutora': {
    nomeNoPrime: 'Cadeira abdutora',
    video: 'b3257da2-e5f3-4aef-a406-46ce20576b15',
  },
  'Afundo': {
    nomeNoPrime: 'Afundo com halter',
    video: 'c8402774-4a7e-404e-84ba-4fbf40b41f67',
  },
  'Afundo com halteres': {
    nomeNoPrime: 'Afundo com halter',
    video: 'c8402774-4a7e-404e-84ba-4fbf40b41f67',
  },
  'Afundo caminhando': {
    nomeNoPrime: 'Passada com Halter',
    video: '98fbe822-57ae-49e9-8e4d-c1116c654472',
    conferir: 'passada costuma ser o afundo caminhando; confirmar',
  },
  'Agachamento búlgaro': {
    nomeNoPrime: 'Búlgaro com halter',
    video: 'a20dc6e6-39e7-48cb-8e7a-f529ddcd91c1',
  },
  'Agachamento frontal': {
    nomeNoPrime: 'Front Squat',
    video: 'e8d06879-0293-4b26-bcc2-24bd1976c18c',
  },
  'Agachamento livre': {
    nomeNoPrime: 'Agachamento livre',
    video: '05cc29f9-5ec0-464e-8db3-f0595d6c8f07',
  },
  'Agachamento no Smith': {
    nomeNoPrime: 'Agachamento Smith',
    video: '6cb3c8d4-5ee2-45e3-be8b-89c71eb82c75',
  },
  'Agachamento sissy': {
    nomeNoPrime: 'Agachamento sissy',
    video: 'e8c8408b-3c7b-4c9c-8f8b-84eccdf0ae1b',
  },
  'Búlgaro com barra nas costas': {
    nomeNoPrime: 'Búlgaro com barra nas costas',
    video: '932eb38a-734c-4c61-bd70-62cba5d95433',
  },
  'Cadeira adutora': {
    nomeNoPrime: 'Cadeira adutora',
    video: '2a4ed1ad-643e-407f-9f2e-2f1926322f77',
  },
  'Cadeira extensora': {
    nomeNoPrime: 'Cadeira Extensora',
    video: '510e1e43-5509-45f5-ac3c-11e46fed8d66',
  },
  'Cadeira flexora': {
    nomeNoPrime: 'Cadeira Flexora',
    video: '94107763-c8b7-40aa-afc9-e697138f8f08',
  },
  'Flexão nórdica': {
    nomeNoPrime: 'Flexão Nórdica',
    video: 'a959b1b6-8671-4655-a610-1b5d4a86b169',
  },
  'Flexora em pé': {
    nomeNoPrime: 'Flexora em pé',
    video: 'ab03f5f6-fd9d-4c70-b44f-08fa4c054de0',
  },
  'Flexora unilateral': {
    nomeNoPrime: 'Flexora unilateral',
    video: 'ffd9b780-3a0b-4dc3-a215-8c6ad16478ba',
  },
  'Hack machine': {
    nomeNoPrime: 'Agachamento hack',
    video: '1ecf9c0e-1e18-4686-85bf-646b54d36746',
  },
  'Leg press 45': {
    nomeNoPrime: 'Leg press 45º',
    video: '969ebd0a-8738-4559-a584-303aec7fbe20',
  },
  'Leg press com pés afastados': {
    nomeNoPrime: 'Leg 45 Pés Abduzidos',
    video: '9d9e76ca-81ca-427c-8a4a-99ed062ffee9',
  },
  'Leg press horizontal': {
    nomeNoPrime: 'Leg press 180',
    video: '8cd6bc3a-8dca-4969-bbea-b7831bb6392e',
  },
  'Leg press unilateral': {
    nomeNoPrime: 'Leg 45 Unilateral',
    video: 'a2b0eab4-1ab8-4377-9bf8-d82c02e8b326',
    conferir: 'o deles é no 45; o nosso não diz o leg press',
  },
  'Levantamento terra sumô': {
    nomeNoPrime: 'Terra Sumo Livre',
    video: '4113a734-ed7b-4030-861c-bf7eaf87e402',
  },
  'Mesa flexora': {
    nomeNoPrime: 'Mesa flexora',
    video: 'e537465b-0915-4bdd-b526-f061fa4cdb34',
  },
  'Passada no step': {
    nomeNoPrime: 'Step up livre',
    video: '9e547839-0d7a-4ae7-94ac-d1dff9714147',
    conferir: 'step up deve ser a passada no step; confirmar',
  },
  'Rack pull (meio terra)': {
    nomeNoPrime: 'Rack pull',
    video: '6d6d1011-5dde-4f8e-822e-1fc084ae207c',
  },
  'Step up no banco': {
    nomeNoPrime: 'Step up com halter',
    video: '93381c6b-8c04-412b-b27e-56506ec4a40f',
  },
  'Stiff': {
    nomeNoPrime: 'Stiff com barra livre',
    video: 'ee14bc3a-61c5-4aaa-a222-7171b9d35a19',
  },
  'Stiff com halteres': {
    nomeNoPrime: 'Stiff com halter',
    video: '3c0e1755-e546-47b3-b666-2a212a8bb4d6',
  },
  'Stiff no Smith': {
    nomeNoPrime: 'Stiff no Smith',
    video: '79bb6812-288e-42b1-9da8-e4b6ac93a2a5',
  },
  'Stiff sumô': {
    nomeNoPrime: 'Stiff barra livre sumo',
    video: '243b2958-95a0-4aaa-ba98-023333f5b679',
  },
  'Stiff unilateral com halter': {
    nomeNoPrime: 'Stiff unilateral halter',
    video: '597af46a-45ff-47b9-af0c-1eb1f0d3fa12',
  },
  // --- gluteo ----------------------------------------------------------------
  'Abdução de quadril com o pé atrás': {
    nomeNoPrime: 'Abdução de quadril com o pé atrás',
    video: 'e19579c6-8040-4b80-8b9f-07c1de0cacd9',
  },
  'Abdução em pé na polia': {
    nomeNoPrime: 'Abdução de quadril na polia',
    video: 'd5ba5247-d2ca-414c-aac0-cb9549198ad0',
  },
  'Agachamento sumô com halter': {
    nomeNoPrime: 'Agachamento Sumo com Halter',
    video: 'bd5c933b-dea6-4373-a36b-4b8cf945863f',
  },
  'Cadeira abdutora com tronco inclinado': {
    nomeNoPrime: 'Cadeira Abdutora tronco inclinado',
    video: '48e76b13-67c9-4905-a7b9-d423f040548a',
  },
  'Coice na polia': {
    nomeNoPrime: 'Extensão de quadril na polia',
    video: 'f31eac86-68ad-4c87-9803-de42551ef12a',
    conferir: 'o coice na polia é a extensão de quadril em pé; confirmar',
  },
  'Elevação pélvica': {
    nomeNoPrime: 'Elevação pélvica barra livre',
    video: 'a7fd69da-c093-435b-a20c-f79262ac76de',
  },
  'Elevação pélvica unilateral': {
    nomeNoPrime: 'Elevação pélvica unilateral sem peso',
    video: '997b5a9f-0943-4cad-821c-7bd57f682035',
  },
  'Extensão de quadril no banco romano': {
    nomeNoPrime: 'Extensao Quadril Banco Romano',
    video: '73a01435-c001-4630-be77-8a4041de6331',
  },
  'Glúteo quatro apoios na polia': {
    nomeNoPrime: 'Glúteo 4 apoios na polia',
    video: '318f97bb-33c1-4d80-9dcb-9056ab44b877',
  },
  'Hip thrust na máquina': {
    nomeNoPrime: 'Elevação Pélvica na Máquina',
    video: 'abfcaea3-aec8-4b88-b40b-78860889eb75',
  },
  'Ostra com miniband': {
    nomeNoPrime: 'Ostra com mini band',
    video: '6c1f114e-2440-4866-8982-202ea93cfc9a',
  },
  'Passada reversa': {
    nomeNoPrime: 'Afundo reverso',
    video: '9003f782-8de0-4397-9efe-358d107ae997',
    conferir: 'o nome não diz o aparelho; o nosso é com halteres',
  },
  'Ponte de glúteo': {
    nomeNoPrime: 'Ponte de glúteos',
    video: 'c36dba81-10ff-4bdd-ac3c-990d227638e1',
  },
  'Ponte rã': {
    nomeNoPrime: 'Frog livre',
    video: '1d790b52-3848-4e8c-9e5e-b3de26b6609a',
  },
  // --- panturrilha -----------------------------------------------------------
  'Panturrilha em pé': {
    nomeNoPrime: 'Panturrilha em pé',
    video: '90f634fc-acee-4a26-b2b6-b7fe069e7d1b',
    conferir: 'o nome não diz o aparelho; o nosso é na máquina',
  },
  'Panturrilha sentado': {
    nomeNoPrime: 'Panturrilha sentada',
    video: '8eb22dc3-e20d-4122-bb80-e50bd4d6ff2d',
  },
  // --- abdomen ---------------------------------------------------------------
  'Abdominal bicicleta': {
    nomeNoPrime: 'Abdominal bicicleta',
    video: 'cfbfd8aa-ad9c-4d86-a7a8-62b4c06420b1',
  },
  'Abdominal infra': {
    nomeNoPrime: 'Abdominal Infra Solo',
    video: '8b20cf96-6dbf-43a9-b9ec-eb379cb08410',
  },
  'Abdominal supra': {
    nomeNoPrime: 'Abdominal Supra Solo',
    video: 'c13a5cda-8e69-4cba-bd6e-4bd2ecd11f66',
  },
  'Abdominal na polia (ajoelhado)': {
    nomeNoPrime: 'Abdominal Supra na Polia',
    video: '30895b82-a393-4fef-8125-15fd3dcdab0f',
    conferir: 'o nosso é ajoelhado; confirmar a posição',
  },
  'Elevação de pernas suspenso': {
    nomeNoPrime: 'Abdominal Infra Barra',
    video: '1d5404c1-9c61-4877-ad5a-71969c40acd4',
    conferir: 'infra na barra deve ser suspenso na barra fixa, mas o nome não garante',
  },
  'Prancha abdominal': {
    nomeNoPrime: 'Prancha abdominal',
    video: '27f09221-1fdf-4c16-89ff-66cf10b5e128',
  },
  // --- corpo_inteiro ---------------------------------------------------------
  'Alongamento de dorsal': {
    nomeNoPrime: 'Alongamento de Dorsal',
    video: '2ae20951-7396-46cb-9836-51993495fb9d',
  },
  'Alongamento de ombro': {
    nomeNoPrime: 'Alongamento de Ombro',
    video: '607ebf4c-d56d-4352-94a6-f470efbd16d9',
  },
  'Alongamento de peitoral': {
    nomeNoPrime: 'Alongamento de Peitoral',
    video: 'bfad7bbd-3e3e-4742-bfc7-fba92d8b0f7c',
  },
  'Alongamento de posterior de coxa': {
    nomeNoPrime: 'Alongamento de Posterior',
    video: 'f6bf855f-3b07-4467-b011-1ca6505d4d65',
  },
  'Alongamento de quadríceps': {
    nomeNoPrime: 'Alongamento de Quadríceps',
    video: '872e5c2e-d8d0-4ed2-b393-cd015e6b2a0e',
  },
  'Mobilidade de quadril e tornozelo': {
    nomeNoPrime: 'Mobilidade Quadril e Tornozelo',
    video: 'ffe8b40c-9c7f-432a-a229-5d47af43e355',
  },
  'Agachamento profundo (mobilidade)': {
    nomeNoPrime: 'Mobilidade de Cócoras',
    video: '8fd5f48e-4dd3-47e4-9380-4c46d09b2127',
    conferir: 'cócoras deve ser o agachamento profundo; confirmar',
  },
};
