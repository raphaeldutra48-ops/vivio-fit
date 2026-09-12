/**
 * A conta da composição corporal mudou de casa.
 *
 * Ela foi para `@vivio/contracts` quando o SDK passou a gravar a avaliação
 * falando direto com o Postgres: com uma cópia aqui e outra lá, uma delas
 * aceitaria o que a outra recusa, e o número entraria no histórico do jeito
 * errado com cara de medido.
 *
 * O reexporte existe para não espalhar a mudança por quem já importava daqui.
 */
export {
  ErroDeCalculo,
  calcularPorBioimpedancia,
  calcularPorDobras,
  densidadeCorporal,
  siri,
  type EntradaAdipometria,
  type EntradaBioimpedancia,
} from '@vivio/contracts';
