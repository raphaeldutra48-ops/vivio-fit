/**
 * Seed de desenvolvimento.
 *
 * Monta deliberadamente os três estados que os guards precisam distinguir:
 *   Ana    -> vínculo ATIVO + consentimento vigente  => acesso liberado
 *   Bruno  -> vínculo ATIVO + SEM consentimento      => 403 CONSENTIMENTO_AUSENTE
 *   Carla  -> vínculo PENDENTE                       => 403 VINCULO_AUSENTE
 *
 * Sem esses três casos no banco, o teste de aceite do B4 não tem o que provar.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient, Papel, StatusConta, StatusVinculo, EscopoDado } from '@prisma/client';
import { semearCatalogo } from './catalogo';

const prisma = new PrismaClient();

const SENHA_PADRAO = 'Senha@123';
const VERSAO_TERMO = '2026-07-v1';

/**
 * Treinos executados da Ana, com feedback.
 *
 * Sem isto o seed não tinha uma execução sequer, e metade do lado profissional
 * do app abria vazia numa demonstração: painel de progresso, evolução de
 * carga, recordes, sugestão de carga e a área de feedback. "Zero treinos" é um
 * estado legítimo do produto, mas é o pior primeiro contato possível com ele.
 *
 * A história é a de quem está progredindo com um incômodo no ombro: a carga do
 * supino sobe ao longo das semanas, e no meio aparecem dois treinos seguidos
 * com dor — que é exatamente o padrão que a área de feedback existe para
 * mostrar antes de virar lesão.
 */
async function semearTreinosDaAna(
  alunoId: string,
  personalId: string,
  diaDeTras: (dias: number) => Date,
): Promise<void> {
  const nome = 'Full body A';

  // Idempotente: rodar o seed de novo não empilha planos nem treinos.
  const jaTem = await prisma.planoTreino.findFirst({ where: { alunoId, nome } });
  if (jaTem) return;

  const [supino, agachamento, remada] = await Promise.all([
    prisma.exercicio.findFirst({ where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' } }),
    prisma.exercicio.findFirst({ where: { nome: 'Agachamento livre', escopo: 'GLOBAL' } }),
    prisma.exercicio.findFirst({ where: { nome: 'Remada curvada com barra', escopo: 'GLOBAL' } }),
  ]);
  if (!supino || !agachamento || !remada) return;

  const plano = await prisma.planoTreino.create({
    data: {
      alunoId,
      personalId,
      nome,
      objetivo: 'Hipertrofia — 3x por semana',
      status: 'ATIVO',
      inicioEm: diaDeTras(28),
      sessoes: {
        create: [
          {
            nome: 'Treino A — corpo inteiro',
            ordem: 1,
            itens: {
              create: [
                { exercicioId: supino.id, ordem: 1, series: 3, repsAlvo: '8-10', cargaSugeridaKg: 30 },
                { exercicioId: agachamento.id, ordem: 2, series: 3, repsAlvo: '10-12', cargaSugeridaKg: 40 },
                { exercicioId: remada.id, ordem: 3, series: 3, repsAlvo: '10', cargaSugeridaKg: 25 },
              ],
            },
          },
        ],
      },
    },
    include: { sessoes: { include: { itens: true } } },
  });

  const sessao = plano.sessoes[0]!;
  const itemDe = (exercicioId: string) => sessao.itens.find((i) => i.exercicioId === exercicioId)!;

  /*
    Uma linha por treino: [dias atrás, carga do supino, dificuldade, dor].
    A carga sobe de 30 para 37,5 em quatro semanas — progressão realista, não
    a curva perfeita que só existe em captura de tela.
  */
  const treinos: [number, number, number, boolean][] = [
    [26, 30, 3, false],
    [24, 30, 2, false],
    [21, 32.5, 3, false],
    [19, 32.5, 4, false],
    [17, 32.5, 3, false],
    [14, 35, 4, false],
    [12, 35, 4, true],
    [10, 35, 5, true],
    [7, 32.5, 3, false],
    [5, 35, 3, false],
    [2, 37.5, 4, false],
  ];

  const comentarios: Record<number, string> = {
    12: 'Senti um incômodo no ombro na última série do supino.',
    10: 'O ombro incomodou de novo, dessa vez desde o começo.',
    7: 'Baixei a carga como combinamos e não doeu nada.',
    2: 'Consegui as 3 séries completas! Achei que não ia.',
  };

  for (const [dias, carga, dificuldade, teveDor] of treinos) {
    const inicio = new Date(diaDeTras(dias).getTime() + 18 * 60 * 60 * 1000);
    const duracaoSeg = (48 + (dias % 5)) * 60;

    await prisma.execucaoTreino.create({
      data: {
        alunoId,
        sessaoId: sessao.id,
        clienteUuid: crypto.randomUUID(),
        iniciadoEm: inicio,
        finalizadoEm: new Date(inicio.getTime() + duracaoSeg * 1000),
        duracaoSeg,
        series: {
          create: [
            { itemTreinoId: itemDe(supino.id).id, exercicioId: supino.id, serieNum: 1, repsFeitas: 10, cargaKg: carga, rpe: 7 },
            { itemTreinoId: itemDe(supino.id).id, exercicioId: supino.id, serieNum: 2, repsFeitas: 9, cargaKg: carga, rpe: 8 },
            { itemTreinoId: itemDe(supino.id).id, exercicioId: supino.id, serieNum: 3, repsFeitas: 8, cargaKg: carga, rpe: 9 },
            { itemTreinoId: itemDe(agachamento.id).id, exercicioId: agachamento.id, serieNum: 1, repsFeitas: 12, cargaKg: carga + 10, rpe: 7 },
            { itemTreinoId: itemDe(agachamento.id).id, exercicioId: agachamento.id, serieNum: 2, repsFeitas: 11, cargaKg: carga + 10, rpe: 8 },
            { itemTreinoId: itemDe(remada.id).id, exercicioId: remada.id, serieNum: 1, repsFeitas: 10, cargaKg: carga - 5, rpe: 8 },
            { itemTreinoId: itemDe(remada.id).id, exercicioId: remada.id, serieNum: 2, repsFeitas: 10, cargaKg: carga - 5, rpe: 8 },
          ],
        },
        feedback: {
          create: {
            dificuldade,
            teveDor,
            localDor: teveDor ? 'ombro direito' : null,
            sensacao: teveDor ? 'Cansada' : 'Bem',
            comentario: comentarios[dias] ?? null,
          },
        },
      },
    });
  }
}

/**
 * Metas da Ana.
 *
 * Três, escolhidas para cobrir os três estados que a tela precisa saber
 * desenhar: uma em andamento com prazo folgado, uma **com prazo vencido** e
 * uma sem medição para acompanhar. Só com meta bem-comportada, a tela nunca
 * mostraria o que faz numa situação ruim — que é quando ela importa.
 *
 * O `valorInicial` fica em branco de propósito: o serviço o congela na
 * criação, e escrevê-lo aqui à mão criaria uma régua que não corresponde ao
 * que a pessoa media naquele dia.
 */
async function semearMetasDaAna(
  alunoId: string,
  personalId: string,
  diaDeTras: (dias: number) => Date,
): Promise<void> {
  const jaTem = await prisma.meta.findFirst({ where: { alunoId, deletadoEm: null } });
  if (jaTem) return;

  const primeiraMedida = await prisma.medida.findFirst({
    where: { alunoId },
    orderBy: { data: 'asc' },
  });

  await prisma.meta.createMany({
    data: [
      {
        alunoId,
        criadoPorId: personalId,
        tipo: 'PESO_CORPORAL',
        titulo: 'Chegar a 62 kg',
        alvo: 62,
        valorInicial: primeiraMedida?.pesoKg ?? null,
        prazo: diaDeTras(-60),
        observacao: 'Sem pressa: dois meses.',
      },
      {
        alunoId,
        criadoPorId: personalId,
        tipo: 'FREQUENCIA_SEMANAL',
        titulo: 'Treinar 3x por semana',
        alvo: 3,
        prazo: diaDeTras(-30),
      },
      {
        alunoId,
        criadoPorId: personalId,
        tipo: 'MEDIDA_CINTURA',
        titulo: 'Cintura em 70 cm',
        alvo: 70,
        valorInicial: primeiraMedida?.cinturaCm ?? null,
        // No passado: é a meta que mostra como a tela trata prazo vencido.
        prazo: diaDeTras(5),
      },
    ],
  });
}

async function main(): Promise<void> {
  const senhaHash = await hash(SENHA_PADRAO);

  // --- Admin -------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: 'admin@viviofit.com.br' },
    update: {},
    create: {
      email: 'admin@viviofit.com.br',
      nome: 'Admin Vívio',
      senhaHash,
      papel: Papel.ADMIN,
      status: StatusConta.ATIVA,
      emailVerifEm: new Date(),
    },
  });

  // --- Profissionais (já verificados pelo admin) --------------------------
  async function criarProfissional(
    email: string,
    nome: string,
    tipo: Papel,
    registro: string,
    especialidades: string[],
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        nome,
        senhaHash,
        papel: tipo,
        status: StatusConta.ATIVA,
        emailVerifEm: new Date(),
      },
    });
    await prisma.perfilProfissional.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        tipo,
        registroConselho: registro,
        ufRegistro: 'CE',
        especialidades,
        bio: `${nome} — perfil de demonstração.`,
        verificadoEm: new Date(),
        verificadoPorId: admin.id,
      },
    });
    return user;
  }

  const personal = await criarProfissional(
    'personal@viviofit.com.br',
    'Diego Personal',
    Papel.PERSONAL,
    'CREF 012345-G',
    ['Hipertrofia', 'Reabilitação'],
  );
  const nutri = await criarProfissional(
    'nutri@viviofit.com.br',
    'Eduarda Nutricionista',
    Papel.NUTRICIONISTA,
    'CRN 54321',
    ['Nutrição esportiva'],
  );
  const medico = await criarProfissional(
    'medico@viviofit.com.br',
    'Dra. Fernanda Médica',
    Papel.MEDICO,
    'CRM 98765',
    ['Medicina do esporte'],
  );

  // --- Alunos -------------------------------------------------------------
  async function criarAluno(email: string, nome: string, nascimento: string, alturaCm: number) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        nome,
        senhaHash,
        papel: Papel.ALUNO,
        status: StatusConta.ATIVA,
        emailVerifEm: new Date(),
      },
    });
    await prisma.perfilAluno.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        dataNascimento: new Date(nascimento),
        alturaCm,
        objetivo: 'HIPERTROFIA',
        nivelAtividade: 'MODERADO',
      },
    });
    return user;
  }

  const ana = await criarAluno('ana@exemplo.com', 'Ana Souza', '1995-04-12', 165);
  const bruno = await criarAluno('bruno@exemplo.com', 'Bruno Lima', '1990-11-03', 180);
  const carla = await criarAluno('carla@exemplo.com', 'Carla Dias', '2000-01-25', 170);

  // --- Vínculos -----------------------------------------------------------
  async function vincular(
    alunoId: string,
    profissionalId: string,
    tipo: Papel,
    status: StatusVinculo,
  ) {
    await prisma.vinculo.upsert({
      where: { alunoId_profissionalId: { alunoId, profissionalId } },
      update: {},
      create: {
        alunoId,
        profissionalId,
        tipo,
        status,
        convidadoPorId: profissionalId,
        iniciadoEm: status === StatusVinculo.ATIVO ? new Date() : null,
      },
    });
  }

  // Ana: equipe completa e ativa
  await vincular(ana.id, personal.id, Papel.PERSONAL, StatusVinculo.ATIVO);
  await vincular(ana.id, nutri.id, Papel.NUTRICIONISTA, StatusVinculo.ATIVO);
  await vincular(ana.id, medico.id, Papel.MEDICO, StatusVinculo.ATIVO);

  // Bruno: vínculo ativo com o personal, mas nenhum consentimento
  await vincular(bruno.id, personal.id, Papel.PERSONAL, StatusVinculo.ATIVO);

  // Carla: convite ainda não aceito
  await vincular(carla.id, personal.id, Papel.PERSONAL, StatusVinculo.PENDENTE);

  // --- Consentimentos (só a Ana concedeu) ---------------------------------
  const escoposDaAna: EscopoDado[] = [
    EscopoDado.TREINO,
    EscopoDado.NUTRICAO,
    EscopoDado.CLINICO,
    EscopoDado.EVOLUCAO,
    EscopoDado.MENSAGENS,
  ];
  for (const escopo of escoposDaAna) {
    const existente = await prisma.consentimento.findFirst({
      where: { alunoId: ana.id, escopo, profissionalId: null, revogadoEm: null },
    });
    if (!existente) {
      await prisma.consentimento.create({
        data: {
          alunoId: ana.id,
          escopo,
          profissionalId: null, // vale para toda a equipe de cuidado
          finalidade: `Compartilhar meus dados de ${escopo.toLowerCase()} com os profissionais que me acompanham.`,
          versaoTermo: VERSAO_TERMO,
        },
      });
    }
  }

  // --- Histórico de medidas da Ana ----------------------------------------
  // Os gráficos de composição corporal só mostram alguma coisa com série
  // temporal, e antes disto a única forma de ter uma era digitar no navegador —
  // que sumia quando alguém rodava a suíte. Agora o histórico vem do seed:
  // `pnpm seed` recompõe, e nenhum teste mais o apaga.
  //
  // Datas relativas a hoje, não fixas: um seed com data absoluta envelhece e
  // vira "última medição há 8 meses" na tela.
  const hoje = new Date();
  const diaDeTras = (dias: number) => {
    const d = new Date(hoje);
    d.setUTCDate(d.getUTCDate() - dias);
    // Coluna é @db.Date; zerar a hora evita depender do fuso da máquina.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };

  // Perda gradual de peso e de cintura com massa magra estável: é assim que se
  // parece um acompanhamento que está dando certo, e é o que a tela precisa
  // conseguir desenhar.
  const historicoDaAna = [
    [112, 68.4, 28.5, 48.9, 76.0],
    [84, 67.2, 27.8, 48.5, 74.8],
    [56, 66.1, 26.9, 48.3, 73.5],
    [28, 65.3, 26.2, 48.2, 72.4],
    [7, 64.6, 25.6, 48.1, 71.6],
  ] as const;

  for (const [dias, pesoKg, percentualGordura, massaMagraKg, cinturaCm] of historicoDaAna) {
    const data = diaDeTras(dias);
    await prisma.medida.upsert({
      where: { alunoId_data: { alunoId: ana.id, data } },
      update: {},
      create: {
        alunoId: ana.id,
        data,
        pesoKg,
        percentualGordura,
        massaMagraKg,
        cinturaCm,
        registradoPorId: personal.id,
      },
    });
  }

  // --- Catálogo (exercícios globais e tabela de alimentos) ----------------
  // O mesmo módulo que a produção usa: catálogo é conteúdo do produto, não
  // dado de demonstração, e manter duas cópias faria as duas divergirem.
  const catalogo = await semearCatalogo(prisma, admin.id);

  await semearTreinosDaAna(ana.id, personal.id, diaDeTras);
  await semearMetasDaAna(ana.id, personal.id, diaDeTras);

  console.log('\nSeed concluído. Senha de todos: ' + SENHA_PADRAO);
  console.log(`Tabela de alimentos: ${catalogo.alimentos} itens`);
  console.log(`Biblioteca global: ${catalogo.exercicios} exercícios\n`);
  console.table([
    { papel: 'ADMIN', email: admin.email },
    { papel: 'PERSONAL', email: personal.email },
    { papel: 'NUTRICIONISTA', email: nutri.email },
    { papel: 'MEDICO', email: medico.email },
    { papel: 'ALUNO (consente tudo)', email: ana.email },
    { papel: 'ALUNO (vinculo sem consent.)', email: bruno.email },
    { papel: 'ALUNO (vinculo pendente)', email: carla.email },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
