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

const prisma = new PrismaClient();

const SENHA_PADRAO = 'Senha@123';
const VERSAO_TERMO = '2026-07-v1';

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

  // --- Biblioteca global de exercícios ------------------------------------
  const exerciciosGlobais = [
    ['Supino reto com barra', 'PEITO', 'Barra', 'Escápulas retraídas, barra na linha do mamilo.'],
    ['Supino inclinado com halteres', 'PEITO', 'Halteres', 'Banco a 30-45 graus.'],
    ['Crucifixo na polia', 'PEITO', 'Polia', 'Cotovelos levemente flexionados e fixos.'],
    ['Puxada frontal', 'COSTAS', 'Polia alta', 'Puxar com os cotovelos, não com as mãos.'],
    ['Remada curvada', 'COSTAS', 'Barra', 'Coluna neutra, tronco a 45 graus.'],
    ['Remada unilateral', 'COSTAS', 'Haltere', 'Apoiar o joelho e a mão no banco.'],
    ['Desenvolvimento militar', 'OMBRO', 'Barra', 'Não hiperestender a lombar.'],
    ['Elevação lateral', 'OMBRO', 'Halteres', 'Subir até a linha do ombro, sem balanço.'],
    ['Rosca direta', 'BICEPS', 'Barra', 'Cotovelos junto ao tronco.'],
    ['Rosca martelo', 'BICEPS', 'Halteres', 'Pegada neutra durante todo o movimento.'],
    ['Tríceps na polia', 'TRICEPS', 'Polia alta', 'Cotovelos fixos ao lado do corpo.'],
    ['Tríceps testa', 'TRICEPS', 'Barra W', 'Descer a barra até a testa, cotovelos parados.'],
    ['Agachamento livre', 'PERNA', 'Barra', 'Joelhos alinhados aos pés, descer até paralela.'],
    ['Leg press 45', 'PERNA', 'Máquina', 'Não travar o joelho na extensão.'],
    ['Cadeira extensora', 'PERNA', 'Máquina', 'Controlar a fase excêntrica.'],
    ['Mesa flexora', 'PERNA', 'Máquina', 'Quadril apoiado, sem tirar do banco.'],
    ['Levantamento terra', 'COSTAS', 'Barra', 'Coluna neutra; barra rente às pernas.'],
    ['Elevação pélvica', 'GLUTEO', 'Barra', 'Contrair o glúteo no topo por 1 segundo.'],
    ['Panturrilha em pé', 'PANTURRILHA', 'Máquina', 'Amplitude completa, pausa embaixo.'],
    ['Prancha abdominal', 'ABDOMEN', 'Peso corporal', 'Quadril alinhado, sem elevar.'],
    ['Abdominal supra', 'ABDOMEN', 'Peso corporal', 'Sem puxar o pescoço.'],
    ['Esteira — caminhada inclinada', 'CARDIO', 'Esteira', 'Inclinação 8-12%, sem se apoiar.'],
    ['Burpee', 'CORPO_INTEIRO', 'Peso corporal', 'Movimento contínuo e controlado.'],
  ] as const;

  for (const [nome, grupoMuscular, equipamento, instrucoes] of exerciciosGlobais) {
    const existente = await prisma.exercicio.findFirst({
      where: { nome, escopo: 'GLOBAL' },
    });
    if (!existente) {
      await prisma.exercicio.create({
        data: {
          nome,
          grupoMuscular,
          equipamento,
          instrucoes,
          escopo: 'GLOBAL',
          criadoPorId: admin.id,
        },
      });
    }
  }

  // --- Tabela de alimentos (valores por 100 g) ----------------------------
  // Subconjunto da TACO/IBGE para desenvolvimento. Confirmar licença de uso
  // comercial antes do lançamento (ver docs/PROMPT-BUILD.md, seção 11).
  const alimentos = [
    // nome, grupo, kcal, prot, carbo, gord, fibra, medida caseira, gramas
    ['Peito de frango grelhado', 'PROTEINA', 159, 32.0, 0, 2.5, 0, '1 filé médio', 100],
    ['Patinho bovino grelhado', 'PROTEINA', 219, 35.9, 0, 7.3, 0, '1 bife médio', 100],
    ['Tilápia grelhada', 'PROTEINA', 128, 26.1, 0, 2.0, 0, '1 filé', 120],
    ['Salmão grelhado', 'PROTEINA', 232, 23.8, 0, 15.0, 0, '1 posta', 130],
    ['Ovo de galinha cozido', 'PROTEINA', 146, 13.3, 0.6, 9.5, 0, '2 unidades', 100],
    ['Clara de ovo cozida', 'PROTEINA', 59, 13.4, 0, 0.1, 0, '4 claras', 130],
    ['Whey protein concentrado', 'PROTEINA', 400, 80.0, 8.0, 5.0, 0, '1 scoop', 30],
    ['Queijo cottage', 'PROTEINA', 98, 11.1, 3.4, 4.3, 0, '3 colheres de sopa', 60],
    ['Atum em água', 'PROTEINA', 116, 25.5, 0, 1.0, 0, '1 lata drenada', 120],
    ['Carne suína lombo assado', 'PROTEINA', 210, 29.0, 0, 10.0, 0, '1 fatia', 100],

    ['Arroz branco cozido', 'CARBOIDRATO', 128, 2.5, 28.1, 0.2, 1.6, '4 colheres de sopa', 100],
    ['Arroz integral cozido', 'CARBOIDRATO', 124, 2.6, 25.8, 1.0, 2.7, '4 colheres de sopa', 100],
    ['Batata doce cozida', 'CARBOIDRATO', 77, 0.6, 18.4, 0.1, 2.2, '1 unidade pequena', 100],
    ['Batata inglesa cozida', 'CARBOIDRATO', 52, 1.2, 11.9, 0, 1.3, '1 unidade média', 100],
    ['Mandioca cozida', 'CARBOIDRATO', 125, 0.6, 30.1, 0.3, 1.6, '1 pedaço', 100],
    ['Macarrão cozido', 'CARBOIDRATO', 111, 3.9, 22.0, 1.0, 1.5, '1 pegador', 100],
    ['Pão francês', 'CARBOIDRATO', 300, 8.0, 58.6, 3.1, 2.3, '1 unidade', 50],
    ['Pão integral', 'CARBOIDRATO', 253, 9.4, 49.9, 3.4, 6.9, '2 fatias', 50],
    ['Aveia em flocos', 'CARBOIDRATO', 394, 13.9, 66.6, 8.5, 9.1, '3 colheres de sopa', 30],
    ['Tapioca goma', 'CARBOIDRATO', 240, 0, 60.0, 0, 0, '1 unidade média', 60],
    ['Cuscuz de milho cozido', 'CARBOIDRATO', 113, 2.4, 25.3, 0.5, 1.4, '1 fatia', 100],

    ['Feijão carioca cozido', 'LEGUMINOSA', 76, 4.8, 13.6, 0.5, 8.5, '1 concha', 80],
    ['Feijão preto cozido', 'LEGUMINOSA', 77, 4.5, 14.0, 0.5, 8.4, '1 concha', 80],
    ['Lentilha cozida', 'LEGUMINOSA', 93, 6.3, 16.3, 0.5, 7.9, '1 concha', 80],
    ['Grão de bico cozido', 'LEGUMINOSA', 130, 8.4, 21.2, 2.1, 5.4, '1 concha', 80],

    ['Brócolis cozido', 'VEGETAL', 25, 2.1, 4.4, 0.5, 3.4, '1 pires', 80],
    ['Abobrinha refogada', 'VEGETAL', 25, 1.1, 4.3, 0.6, 1.6, '3 colheres de sopa', 80],
    ['Cenoura crua', 'VEGETAL', 34, 1.3, 7.7, 0.2, 3.2, '1 unidade média', 80],
    ['Alface crespa', 'VEGETAL', 11, 1.3, 1.7, 0.2, 1.8, '4 folhas', 40],
    ['Tomate cru', 'VEGETAL', 15, 1.1, 3.1, 0.2, 1.2, '1 unidade média', 100],
    ['Couve refogada', 'VEGETAL', 90, 1.7, 3.5, 7.9, 3.1, '2 colheres de sopa', 40],

    ['Banana prata', 'FRUTA', 98, 1.3, 26.0, 0.1, 2.0, '1 unidade média', 70],
    ['Maçã com casca', 'FRUTA', 56, 0.3, 15.2, 0, 1.3, '1 unidade média', 130],
    ['Mamão papaia', 'FRUTA', 40, 0.5, 10.4, 0.1, 1.0, '1 fatia', 100],
    ['Laranja pera', 'FRUTA', 37, 1.0, 8.9, 0.1, 0.8, '1 unidade', 130],
    ['Morango', 'FRUTA', 30, 0.9, 6.8, 0.3, 1.7, '1 xícara', 150],
    ['Abacate', 'FRUTA', 96, 1.2, 6.0, 8.4, 6.3, '3 colheres de sopa', 60],

    ['Azeite de oliva', 'GORDURA', 884, 0, 0, 100.0, 0, '1 colher de sopa', 13],
    ['Castanha do Pará', 'GORDURA', 643, 14.5, 15.1, 63.5, 7.9, '3 unidades', 15],
    ['Amendoim torrado', 'GORDURA', 544, 27.4, 20.3, 43.9, 8.0, '1 punhado', 30],
    ['Pasta de amendoim integral', 'GORDURA', 588, 25.0, 20.0, 50.0, 6.0, '1 colher de sopa', 20],

    ['Leite integral', 'LATICINIO', 61, 2.9, 4.3, 3.2, 0, '1 copo', 200],
    ['Leite desnatado', 'LATICINIO', 35, 3.4, 4.9, 0.2, 0, '1 copo', 200],
    ['Iogurte natural integral', 'LATICINIO', 61, 3.5, 4.7, 3.3, 0, '1 pote', 170],
    ['Queijo minas frescal', 'LATICINIO', 264, 17.4, 3.2, 20.2, 0, '1 fatia', 30],
  ] as const;

  for (const [nome, grupo, kcal, prot, carbo, gord, fibra, medida, gramas] of alimentos) {
    const existente = await prisma.alimento.findFirst({ where: { nome } });
    if (!existente) {
      await prisma.alimento.create({
        data: {
          nome,
          grupo,
          kcal,
          proteinaG: prot,
          carboidratoG: carbo,
          gorduraG: gord,
          fibraG: fibra,
          medidaCaseira: medida,
          medidaGramas: gramas,
          fonte: 'TACO',
        },
      });
    }
  }

  console.log('\nSeed concluído. Senha de todos: ' + SENHA_PADRAO);
  console.log(`Tabela de alimentos: ${alimentos.length} itens`);
  console.log(`Biblioteca global: ${exerciciosGlobais.length} exercícios\n`);
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
