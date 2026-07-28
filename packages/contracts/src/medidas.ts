import { z } from 'zod';

const decimalOpcional = (min: number, max: number) => z.coerce.number().min(min).max(max).optional();

export const registrarMedidaSchema = z.object({
  data: z.coerce.date().default(() => new Date()),
  pesoKg: decimalOpcional(20, 400),
  percentualGordura: decimalOpcional(1, 70),
  massaMagraKg: decimalOpcional(10, 200),
  cinturaCm: decimalOpcional(30, 250),
  quadrilCm: decimalOpcional(30, 250),
  bracoCm: decimalOpcional(10, 100),
  coxaCm: decimalOpcional(20, 150),
  toraxCm: decimalOpcional(30, 250),
  fonte: z.enum(['MANUAL', 'BIOIMPEDANCIA', 'WEARABLE']).default('MANUAL'),
});
export type RegistrarMedidaInput = z.infer<typeof registrarMedidaSchema>;

export interface MedidaResumo {
  id: string;
  data: string;
  pesoKg: number | null;
  percentualGordura: number | null;
  massaMagraKg: number | null;
  cinturaCm: number | null;
  quadrilCm: number | null;
  bracoCm: number | null;
  coxaCm: number | null;
  toraxCm: number | null;
  fonte: string;
}
