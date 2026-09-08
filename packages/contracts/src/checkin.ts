import { z } from 'zod';

/**
 * Check-in diário do aluno.
 *
 * Já existia o **feedback pós-treino**, que é outra coisa: ele só nasce quando
 * há treino. O dado que faltava é justamente o dos dias em que a pessoa **não**
 * treinou — é ele que revela queda de adesão antes de virar desistência, e é
 * ele que o alerta para o personal consome.
 *
 * Por isso `treinou: false` é um check-in perfeitamente válido, e não uma
 * ausência de registro.
 */

/** 1 = exausto, 5 = ótimo. Escala curta porque é respondida todo dia, no celular. */
export const ENERGIA_MIN = 1;
export const ENERGIA_MAX = 5;

export const registrarCheckinSchema = z.object({
  /**
   * Dia a que o check-in se refere, em `AAAA-MM-DD`.
   *
   * Vem do cliente, e não do relógio do servidor, porque o aluno pode
   * registrar a noite anterior de manhã — e porque o fuso dele não é o do
   * contêiner. O serviço é que decide se a data é aceitável.
   */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD'),
  treinou: z.boolean(),
  energia: z.number().int().min(ENERGIA_MIN).max(ENERGIA_MAX),
  teveDor: z.boolean().default(false),
  localDor: z.string().max(120).optional(),
  observacao: z.string().max(500).optional(),
});
export type RegistrarCheckinInput = z.infer<typeof registrarCheckinSchema>;

/**
 * O "hoje" do aluno, em `AAAA-MM-DD`.
 *
 * Existe porque `new Date().toISOString().slice(0, 10)` é a forma errada e
 * óbvia de fazer isto: `toISOString` converte para UTC, e no Brasil (UTC-3)
 * qualquer registro feito depois das 21h sairia com a data de **amanhã**. O
 * aluno que faz o check-in antes de dormir teria o dia de hoje marcado como
 * não registrado e o de amanhã já respondido — e o alerta de adesão do
 * personal leria isso como um dia perdido.
 *
 * Os componentes locais dão a data do relógio de quem está registrando, que é
 * exatamente o que o check-in significa.
 */
export function dataLocalDoCheckin(agora: Date = new Date()): string {
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

export const consultaCheckinsSchema = z.object({
  /** Janela em dias, contada para trás a partir de hoje. */
  dias: z.coerce.number().int().min(1).max(365).default(30),
});
export type ConsultaCheckins = z.infer<typeof consultaCheckinsSchema>;

export interface CheckinResumo {
  id: string;
  data: string;
  treinou: boolean;
  energia: number;
  teveDor: boolean;
  localDor: string | null;
  observacao: string | null;
  criadoEm: string;
}

/**
 * Números que o painel do profissional mostra.
 *
 * `aderencia` é a razão entre dias treinados e dias com check-in — não entre
 * dias treinados e dias do período. A diferença importa: quem não registrou
 * nada não "deixou de treinar", apenas não contou. Misturar as duas coisas
 * daria 20% de adesão para quem treina direito e só esquece de registrar.
 */
export interface ResumoDeCheckins {
  dias: number;
  comCheckin: number;
  treinou: number;
  /** 0 a 100, ou `null` quando não houve check-in nenhum no período. */
  aderencia: number | null;
  energiaMedia: number | null;
  diasComDor: number;
  /** Dias desde o último check-in; `null` se nunca houve. */
  diasSemCheckin: number | null;
  ultimoEm: string | null;
}

/** Quantos dias para trás dá para registrar. */
export const DIAS_RETROATIVOS = 3;

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Meia-noite UTC de hoje — é assim que a coluna `@db.Date` guarda o dia. */
export function hojeUtc(agora: Date = new Date()): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
}

/**
 * Os números que o painel do profissional mostra.
 *
 * ## A decisão que importa é o denominador
 *
 * A adesão é sobre **dias com check-in**, não dias do período. Quem não
 * registrou nada não "deixou de treinar" — apenas não contou. Usar o período
 * inteiro daria 20% de adesão a quem treina certo e só esquece de marcar, e o
 * personal ligaria cobrando a pessoa errada.
 *
 * Para "sumiu" existe campo próprio: `diasSemCheckin`.
 *
 * Função pura, e mora aqui pelo mesmo motivo das séries de evolução: é conta
 * sobre linhas que quem pergunta já pode ler. Os dois lados chamam esta mesma
 * implementação enquanto a API existe.
 *
 * Espera os registros em ordem DECRESCENTE de data — o primeiro é o último
 * check-in.
 */
export function resumoDeCheckins(
  registros: CheckinResumo[],
  dias: number,
  agora: Date = new Date(),
): ResumoDeCheckins {
  const comCheckin = registros.length;
  const treinou = registros.filter((r) => r.treinou).length;
  const diasComDor = registros.filter((r) => r.teveDor).length;
  const somaEnergia = registros.reduce((s, r) => s + r.energia, 0);
  const ultimo = registros[0] ?? null;

  return {
    dias,
    comCheckin,
    treinou,
    aderencia: comCheckin === 0 ? null : Math.round((treinou / comCheckin) * 100),
    energiaMedia: comCheckin === 0 ? null : Number((somaEnergia / comCheckin).toFixed(1)),
    diasComDor,
    diasSemCheckin: ultimo
      ? Math.floor(
          (hojeUtc(agora).getTime() - new Date(`${ultimo.data}T00:00:00.000Z`).getTime()) /
            DIA_EM_MS,
        )
      : null,
    ultimoEm: ultimo?.data ?? null,
  };
}
