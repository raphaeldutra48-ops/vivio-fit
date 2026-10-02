import { z } from 'zod';

/**
 * Dia do calendário — a conta que o app errava em cinco lugares diferentes.
 *
 * O produto guarda vários registros por DIA, não por instante: check-in, copo de
 * água, refeição marcada, cardio, data de pagamento. A coluna é `@db.Date` e o
 * valor é uma string `AAAA-MM-DD`. A pergunta "que dia é hoje" parece trivial e
 * tem duas respostas diferentes, e usar a errada foi o defeito:
 *
 * - `new Date().toISOString().slice(0, 10)` dá o dia em **UTC**. No Brasil
 *   (UTC-3) isso vira o dia seguinte às 21h. Medido no app: a partir das 21h, a
 *   água e as refeições registradas iam para AMANHÃ, o contador do dia zerava, e
 *   a aba de nutrição voltava a cobrar refeições que a pessoa já havia marcado.
 *   O mesmo relógio deslocado datava um pagamento recebido às 22h no dia
 *   seguinte.
 * - Os componentes LOCAIS dão o dia do relógio de quem está registrando, que é o
 *   que qualquer um desses registros significa.
 *
 * Existe um caso em que o UTC é o certo, e é o que torna a confusão fácil: um
 * `Date` que veio de um CAMPO de data (`<input type="date">`) nasce como
 * meia-noite UTC — `new Date('2026-10-10')` é 10/10 às 00:00Z, que no Brasil é
 * dia 9 às 21h. Ler esse `Date` com componentes locais devolveria o dia
 * anterior. Para ele existe `soData`, em `financeiro.ts`, e as duas funções não
 * se substituem: `diaLocal` é para INSTANTES ("agora"), `soData` é para dias que
 * alguém escolheu num campo.
 */

/**
 * O dia do calendário de quem está com o aparelho na mão, em `AAAA-MM-DD`.
 *
 * Use para tudo que significa "hoje para esta pessoa": o check-in, o copo de
 * água, a refeição marcada, o treino de hoje, a data em que o dinheiro entrou.
 */
export function diaLocal(agora: Date = new Date()): string {
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

/**
 * `AAAA-MM-DD` → meia-noite UTC.
 *
 * É assim que a coluna `@db.Date` guarda o dia, e é a única forma de comparar
 * dois dias do calendário sem o fuso entrar na conta. Construir com
 * `new Date('2026-10-10')` dá o mesmo resultado; a função existe para o código
 * dizer que a escolha do UTC aqui é deliberada, e não a mesma distração que
 * causava o defeito.
 */
export function inicioDoDiaUtc(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/**
 * Quantos dias inteiros separam dois dias do calendário, `de` → `ate`.
 *
 * Os dois chegam como `AAAA-MM-DD` e a conta é feita em meia-noite UTC, dos dois
 * lados. Misturar um dia local com um "hoje" em UTC era o que fazia o painel
 * dizer "1 dia sem check-in" para quem havia registrado naquela mesma noite.
 */
export function diasEntre(de: string, ate: string): number {
  const UM_DIA = 24 * 60 * 60 * 1000;
  return Math.round((inicioDoDiaUtc(ate).getTime() - inicioDoDiaUtc(de).getTime()) / UM_DIA);
}

/** O dia local de N dias atrás — a borda de uma janela como "últimos 30 dias". */
export function diaLocalMenos(dias: number, agora: Date = new Date()): string {
  const antes = new Date(agora.getTime());
  antes.setDate(antes.getDate() - dias);
  return diaLocal(antes);
}

/**
 * Um identificador novo para linha criada pelo cliente, com prefixo legível.
 *
 * As tabelas têm `id` de texto sem `default` no banco — era o `@default(cuid())`
 * do Prisma, que sorteava o valor em JavaScript e o mandava dentro do INSERT.
 * Sem o Prisma, quem sorteia é o SDK, e ele vinha usando
 * `` `${alunoId}-${Date.now()}` ``: dois registros no MESMO milissegundo colidem
 * na chave primária.
 *
 * É improvável e não é impossível — registrar água tem botões de volume rápido
 * lado a lado, e dois toques seguidos são um gesto comum. O preço do improvável
 * aqui é uma frase sem sentido: o segundo gole volta como "Esse registro já
 * existe", sobre um copo de água.
 *
 * O sufixo aleatório resolve sem depender de `crypto.randomUUID`, que não existe
 * no motor do aplicativo. O carimbo de tempo fica porque ordena, e o prefixo
 * porque um id legível ajuda a investigar no banco.
 */
export function novoId(prefixo: string): string {
  const aleatorio = Math.random().toString(36).slice(2, 10);
  return `${prefixo}-${Date.now()}-${aleatorio}`;
}

/**
 * `AAAA-MM-DD` ou um instante ISO — as duas formas que os filtros de data
 * aceitam, e nenhuma outra.
 *
 * Os campos `de` e `ate` das consultas de evolução e de agenda eram
 * `z.string()` puro: sem teto e sem forma. O valor vai direto para um filtro
 * `gte`/`lte` sobre coluna de data, então texto que não é data chega ao Postgres
 * e volta como erro de servidor — a tela mostra "erro inesperado" onde devia
 * dizer que a data está errada. E sem teto, nada impedia mandar um megabyte.
 */
export const diaOuInstanteSchema = z
  .string()
  .max(40)
  .regex(
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    'Use AAAA-MM-DD ou um instante ISO',
  );
