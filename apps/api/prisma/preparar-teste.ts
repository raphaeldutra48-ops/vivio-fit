import { hash } from '@node-rs/argon2';
import {
  EscopoDado,
  Papel,
  PrismaClient,
  StatusConta,
  StatusPlano,
  StatusVinculo,
} from '@prisma/client';
import { FINALIDADE_POR_ESCOPO } from '@vivio/contracts';

/**
 * Monta um par de contas pronto para a primeira rodada de testes em produção.
 *
 * Não existe "usuário master" neste app, e a ausência é o produto: quem
 * prescreve e quem executa são pessoas diferentes, e é o aluno que autoriza o
 * que o profissional vê. Testar as duas pontas de um login só esconderia
 * justamente os defeitos que importam — o primeiro buraco encontrado no teste
 * real foi exatamente um que só aparece com duas contas.
 *
 * O que dá para eliminar é o **atrito**: as quatro etapas manuais (criar
 * profissional, verificar o registro, convidar, aceitar e autorizar) viram um
 * comando. Ao final as duas contas existem, o vínculo está ATIVO, todos os
 * consentimentos concedidos e há um plano de treino ativo — entra e usa.
 *
 *   TESTE_EMAIL_PRO=...  TESTE_EMAIL_ALUNO=...  TESTE_SENHA=... \
 *     pnpm --filter @vivio/api exec tsx prisma/preparar-teste.ts
 *
 * A senha vale para as duas contas de propósito: são suas, de teste, e uma
 * senha só é menos coisa para esquecer no meio de um teste. **Não use uma
 * senha que você já usa em outro lugar** — e apague as variáveis depois.
 *
 * Idempotente. Rodar de novo não duplica nem troca a senha de conta existente.
 *
 * Diferente do `seed.ts`, que monta Ana, Bruno e Carla: aquele descreve casos
 * de guard e não pode encostar num banco com gente de verdade. Este cria só o
 * que você pediu, com os e-mails que você deu.
 */
const prisma = new PrismaClient();

const VERSAO_TERMO = '2026-07-v1';

/** Todos os escopos: o objetivo aqui é enxergar o app inteiro funcionando. */
const ESCOPOS: EscopoDado[] = [
  EscopoDado.TREINO,
  EscopoDado.NUTRICAO,
  EscopoDado.CLINICO,
  EscopoDado.EVOLUCAO,
  EscopoDado.MENSAGENS,
];

function exigir(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`Defina ${nome}. Veja o cabeçalho deste arquivo.`);
    process.exit(1);
  }
  return valor;
}

async function main(): Promise<void> {
  const emailPro = exigir('TESTE_EMAIL_PRO').toLowerCase();
  const emailAluno = exigir('TESTE_EMAIL_ALUNO').toLowerCase();
  const senha = exigir('TESTE_SENHA');

  if (emailPro === emailAluno) {
    console.error('Os dois e-mails precisam ser diferentes — são duas pessoas.');
    process.exit(1);
  }
  if (senha.length < 8) {
    console.error('A senha precisa de ao menos 8 caracteres.');
    process.exit(1);
  }

  const senhaHash = await hash(senha);

  /*
    `emailVerifEm` já preenchido: quem tem acesso às variáveis do servidor
    provou posse muito antes de um e-mail conseguir provar, e travar o teste
    numa caixa de entrada não protege ninguém aqui.
  */
  const criar = async (email: string, nome: string, papel: Papel) => {
    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      console.log(`· ${email} já existe (papel ${existente.papel}) — senha mantida.`);
      return existente;
    }
    const novo = await prisma.user.create({
      data: {
        email,
        nome,
        senhaHash,
        papel,
        status: StatusConta.ATIVA,
        emailVerifEm: new Date(),
      },
    });
    console.log(`· ${email} criado como ${papel}.`);
    return novo;
  };

  const pro = await criar(emailPro, 'Personal de Teste', Papel.PERSONAL);
  const aluno = await criar(emailAluno, 'Aluno de Teste', Papel.ALUNO);

  if (pro.papel !== Papel.PERSONAL || aluno.papel !== Papel.ALUNO) {
    console.error(
      `\n!! Papéis incompatíveis: ${emailPro} é ${pro.papel} e ${emailAluno} é ${aluno.papel}.` +
        '\n   Use e-mails novos — o script não troca o papel de uma conta que já existe.',
    );
    process.exit(1);
  }

  // Perfil do aluno: sem ele a ficha abre sem idade nem objetivo.
  await prisma.perfilAluno.upsert({
    where: { userId: aluno.id },
    update: {},
    create: {
      userId: aluno.id,
      dataNascimento: new Date('1995-01-01'),
      alturaCm: 175,
      objetivo: 'HIPERTROFIA',
      nivelAtividade: 'MODERADO',
    },
  });

  /*
    O perfil profissional nasce com `verificadoEm` preenchido — é o passo que
    normalmente exige um admin aprovando na tela, e sem ele o convite é
    recusado com "registro no conselho não verificado".
  */
  await prisma.perfilProfissional.upsert({
    where: { userId: pro.id },
    update: { verificadoEm: new Date() },
    create: {
      userId: pro.id,
      tipo: Papel.PERSONAL,
      registroConselho: 'CREF TESTE',
      ufRegistro: 'CE',
      especialidades: ['Teste'],
      bio: 'Conta de teste do próprio dono do app.',
      verificadoEm: new Date(),
    },
  });

  await prisma.vinculo.upsert({
    where: { alunoId_profissionalId: { alunoId: aluno.id, profissionalId: pro.id } },
    update: { status: StatusVinculo.ATIVO, encerradoEm: null },
    create: {
      alunoId: aluno.id,
      profissionalId: pro.id,
      tipo: Papel.PERSONAL,
      status: StatusVinculo.ATIVO,
      convidadoPorId: pro.id,
      iniciadoEm: new Date(),
    },
  });

  for (const escopo of ESCOPOS) {
    const vigente = await prisma.consentimento.findFirst({
      where: { alunoId: aluno.id, escopo, profissionalId: null, revogadoEm: null },
    });
    if (!vigente) {
      await prisma.consentimento.create({
        data: {
          alunoId: aluno.id,
          escopo,
          profissionalId: null,
          versaoTermo: VERSAO_TERMO,
          // O mesmo texto que a tela mostra ao aluno no aceite. Gravar outro
          // faria o registro divergir do que a pessoa leu.
          finalidade: FINALIDADE_POR_ESCOPO[escopo],
        },
      });
    }
  }

  // Plano de treino: sem ele o app do aluno abre em "nenhum treino ativo", e
  // metade do que há para testar depende de existir um treino para executar.
  const jaTemPlano = await prisma.planoTreino.findFirst({
    where: { alunoId: aluno.id, status: StatusPlano.ATIVO },
  });

  if (!jaTemPlano) {
    const exercicios = await prisma.exercicio.findMany({
      where: { escopo: 'GLOBAL', nome: { in: ['Supino reto com barra', 'Agachamento livre', 'Remada curvada com barra'] } },
      select: { id: true, nome: true },
    });

    if (exercicios.length === 0) {
      console.log('· Catálogo vazio — plano não criado. Rode SEMEAR_CATALOGO=true antes.');
    } else {
      await prisma.planoTreino.create({
        data: {
          alunoId: aluno.id,
          personalId: pro.id,
          nome: 'Treino de teste',
          objetivo: 'Ver o app funcionando de ponta a ponta',
          status: StatusPlano.ATIVO,
          inicioEm: new Date(),
          sessoes: {
            create: [
              {
                nome: 'Treino A — corpo inteiro',
                ordem: 1,
                itens: {
                  create: exercicios.map((e, i) => ({
                    exercicioId: e.id,
                    ordem: i + 1,
                    series: 3,
                    repsAlvo: '8-12',
                    cargaSugeridaKg: 20,
                    descansoSeg: 90,
                  })),
                },
              },
            ],
          },
        },
      });
      console.log(`· Plano ativo criado com ${exercicios.length} exercícios.`);
    }
  }

  console.log('\nPronto. Entre com as duas contas:');
  console.log(`  profissional  ${emailPro}    → https://app.viviofit.com.br`);
  console.log(`  aluno         ${emailAluno}  → https://vivio-fit.expo.app`);
  console.log('\nApague TESTE_EMAIL_PRO, TESTE_EMAIL_ALUNO e TESTE_SENHA das variáveis.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
