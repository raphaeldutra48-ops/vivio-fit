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

  console.log('\nSeed concluído. Senha de todos: ' + SENHA_PADRAO);
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
