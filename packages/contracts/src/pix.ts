import { z } from 'zod';

/**
 * Gerador de BR Code — o "PIX copia e cola" do Banco Central.
 *
 * É padrão aberto (EMV® QRCPS adaptado pelo BACEN), então não depende de
 * gateway, conta PJ nem contrato: o profissional informa a própria chave e o
 * app monta o código. O dinheiro vai direto do aluno para ele.
 *
 * O que isto NÃO faz: confirmar pagamento. Sem gateway não existe webhook, e o
 * profissional marca como recebido no financeiro. Prometer confirmação
 * automática aqui seria mentira.
 */

export const TipoChavePix = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'EMAIL',
  TELEFONE: 'TELEFONE',
  ALEATORIA: 'ALEATORIA',
} as const;
export type TipoChavePix = (typeof TipoChavePix)[keyof typeof TipoChavePix];

export const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  TELEFONE: 'Telefone',
  ALEATORIA: 'Chave aleatória',
};

/** Normaliza a chave para o formato que os bancos esperam no BR Code. */
export function normalizarChavePix(tipo: TipoChavePix, valor: string): string {
  const limpo = valor.trim();
  if (tipo === 'CPF' || tipo === 'CNPJ') return limpo.replace(/\D/g, '');
  if (tipo === 'TELEFONE') {
    const digitos = limpo.replace(/\D/g, '');
    // Telefone entra com +55 na frente; sem isso alguns bancos recusam.
    return `+${digitos.length <= 11 ? `55${digitos}` : digitos}`;
  }
  if (tipo === 'EMAIL') return limpo.toLowerCase();
  return limpo;
}

export function validarChavePix(tipo: TipoChavePix, valor: string): string | null {
  const normalizada = normalizarChavePix(tipo, valor);
  if (tipo === 'CPF' && normalizada.length !== 11) return 'CPF precisa de 11 dígitos';
  if (tipo === 'CNPJ' && normalizada.length !== 14) return 'CNPJ precisa de 14 dígitos';
  if (tipo === 'EMAIL' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizada)) {
    return 'E-mail inválido';
  }
  if (tipo === 'TELEFONE' && !/^\+55\d{10,11}$/.test(normalizada)) {
    return 'Telefone precisa de DDD e 8 ou 9 dígitos';
  }
  if (tipo === 'ALEATORIA' && !/^[0-9a-f-]{36}$/i.test(normalizada)) {
    return 'Chave aleatória tem 36 caracteres, no formato do banco';
  }
  return null;
}

/**
 * CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF).
 *
 * É o campo 63 do BR Code. Errar aqui produz um código que o app do banco
 * recusa sem explicar o motivo — daí existir teste com valor conhecido.
 */
export function crc16(payload: string): string {
  let resultado = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    resultado ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      resultado = resultado & 0x8000 ? ((resultado << 1) ^ 0x1021) & 0xffff : (resultado << 1) & 0xffff;
    }
  }
  return resultado.toString(16).toUpperCase().padStart(4, '0');
}

/** Campo do payload: id + tamanho em 2 dígitos + valor. */
function campo(id: string, valor: string): string {
  return `${id}${valor.length.toString().padStart(2, '0')}${valor}`;
}

/**
 * Remove acento e caractere fora do ASCII imprimível.
 *
 * Nome com acento faz parte dos bancos recusarem o código — o padrão só
 * garante ASCII.
 */
function apenasAscii(texto: string, tamanhoMaximo: number): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, tamanhoMaximo)
    .toUpperCase();
}

export interface DadosDoBrCode {
  chave: string;
  /** Nome de quem recebe, até 25 caracteres. */
  recebedor: string;
  cidade: string;
  /** Em centavos. Zero ou ausente = o pagador digita o valor. */
  valorCentavos?: number;
  /** Aparece no extrato do pagador. Até 25 caracteres, sem espaço. */
  identificador?: string;
}

/** Monta o BR Code completo, pronto para copiar ou virar QR. */
export function gerarBrCode(dados: DadosDoBrCode): string {
  const merchant =
    campo('00', 'br.gov.bcb.pix') + campo('01', dados.chave);

  const partes = [
    campo('00', '01'),
    // 12 = pode pagar mais de uma vez. Cobrança de mensalidade não é uso único.
    campo('01', '12'),
    campo('26', merchant),
    campo('52', '0000'),
    campo('53', '986'), // BRL
    ...(dados.valorCentavos && dados.valorCentavos > 0
      ? [campo('54', (dados.valorCentavos / 100).toFixed(2))]
      : []),
    campo('58', 'BR'),
    campo('59', apenasAscii(dados.recebedor, 25) || 'RECEBEDOR'),
    campo('60', apenasAscii(dados.cidade, 15) || 'BRASIL'),
    campo(
      '62',
      campo('05', dados.identificador ? apenasAscii(dados.identificador, 25).replace(/\s/g, '') : '***'),
    ),
  ].join('');

  // O CRC é calculado sobre o payload já com "6304" no fim.
  const comMarcador = `${partes}6304`;
  return `${comMarcador}${crc16(comMarcador)}`;
}

// --- contrato ---------------------------------------------------------------

export const salvarPagamentoSchema = z.object({
  tipoChave: z.nativeEnum(TipoChavePix),
  chave: z.string().min(3).max(80),
  recebedor: z.string().min(2).max(25),
  cidade: z.string().min(2).max(15),
});
export type SalvarPagamentoInput = z.infer<typeof salvarPagamentoSchema>;

export interface DadosDePagamento {
  tipoChave: TipoChavePix;
  chave: string;
  recebedor: string;
  cidade: string;
}

export interface CobrancaComPix {
  cobrancaId: string;
  valorCentavos: number;
  descricao: string;
  aluno: string;
  /** O "copia e cola". */
  brCode: string;
}
