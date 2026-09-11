import { z } from 'zod';

/** Categorias de mídia. Definem limites e onde o arquivo é guardado. */
export const TipoMidia = {
  VIDEO_EXERCICIO: 'VIDEO_EXERCICIO',
  FOTO_EVOLUCAO: 'FOTO_EVOLUCAO',
  AVATAR: 'AVATAR',
  /** Biblioteca do profissional: e-book, planilha, vídeo de apoio. */
  MATERIAL: 'MATERIAL',
  /**
   * O PDF ou a foto do laudo laboratorial.
   *
   * É a mídia mais restrita do app: só o médico e o próprio aluno recebem link
   * de leitura. O nutricionista lê os marcadores do exame e nunca o arquivo.
   */
  LAUDO_EXAME: 'LAUDO_EXAME',
} as const;
export type TipoMidia = (typeof TipoMidia)[keyof typeof TipoMidia];

export const LIMITES_MIDIA: Record<
  TipoMidia,
  { tamanhoMaximoBytes: number; mimesAceitos: readonly string[] }
> = {
  VIDEO_EXERCICIO: {
    tamanhoMaximoBytes: 100 * 1024 * 1024,
    mimesAceitos: ['video/mp4', 'video/quicktime', 'video/webm'],
  },
  FOTO_EVOLUCAO: {
    tamanhoMaximoBytes: 15 * 1024 * 1024,
    mimesAceitos: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },
  AVATAR: {
    tamanhoMaximoBytes: 5 * 1024 * 1024,
    mimesAceitos: ['image/jpeg', 'image/png', 'image/webp'],
  },
  MATERIAL: {
    tamanhoMaximoBytes: 200 * 1024 * 1024,
    // Lista fechada de propósito: o arquivo vai para a mão do aluno, e aceitar
    // qualquer mimeType convidaria a subir executável.
    mimesAceitos: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'audio/mpeg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
    ],
  },
  LAUDO_EXAME: {
    // Laudo é PDF de poucas páginas ou foto do papel. 25 MB cobre folgado, e
    // um teto baixo evita alguém anexar um exame de imagem inteiro aqui.
    tamanhoMaximoBytes: 25 * 1024 * 1024,
    mimesAceitos: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },
};

export const pedirUploadSchema = z.object({
  tipo: z.nativeEnum(TipoMidia),
  mimeType: z.string().min(3).max(100),
  tamanhoBytes: z.number().int().positive(),
});
export type PedirUploadInput = z.infer<typeof pedirUploadSchema>;

export interface AutorizacaoDeUpload {
  /** Identifica o arquivo no storage. É isto que o cliente devolve ao criar o registro. */
  chave: string;
  urlUpload: string;
  metodo: 'PUT';
  cabecalhos: Record<string, string>;
  expiraEm: string;
}

export interface UrlAssinada {
  url: string;
  expiraEm: string;
}

// --- Fotos de evolução ------------------------------------------------------

export const AnguloFoto = {
  FRENTE: 'FRENTE',
  LADO_DIREITO: 'LADO_DIREITO',
  LADO_ESQUERDO: 'LADO_ESQUERDO',
  /** Mantido: fotos antigas foram tiradas antes de os lados se separarem. */
  LADO: 'LADO',
  COSTAS: 'COSTAS',
  LIVRE: 'LIVRE',
} as const;
export type AnguloFoto = (typeof AnguloFoto)[keyof typeof AnguloFoto];

export const registrarFotoSchema = z.object({
  chave: z.string().min(10),
  mimeType: z.string().min(3).max(100),
  tamanhoBytes: z.number().int().positive(),
  data: z.coerce.date().default(() => new Date()),
  angulo: z.nativeEnum(AnguloFoto).default(AnguloFoto.FRENTE),
  observacao: z.string().max(500).optional(),
  /**
   * Quem pode ver. Vazio = só o próprio aluno.
   * A foto de evolução é o dado mais íntimo do app; o padrão é não compartilhar.
   */
  visivelPara: z.array(z.enum(['PERSONAL', 'NUTRICIONISTA', 'MEDICO'])).default([]),
});
export type RegistrarFotoInput = z.infer<typeof registrarFotoSchema>;

export const atualizarVisibilidadeFotoSchema = z.object({
  visivelPara: z.array(z.enum(['PERSONAL', 'NUTRICIONISTA', 'MEDICO'])),
});
export type AtualizarVisibilidadeFotoInput = z.infer<typeof atualizarVisibilidadeFotoSchema>;

export interface FotoEvolucaoResumo {
  id: string;
  data: string;
  angulo: AnguloFoto;
  observacao: string | null;
  visivelPara: string[];
  /** Link assinado de curta duração — nunca URL pública. */
  url: string;
  urlExpiraEm: string;
}

/**
 * Hosts de onde aceitamos PLAYER de vídeo embutido.
 *
 * O endereço vem do banco, mas vira `src` de iframe no site e de WebView no
 * aplicativo — e um iframe apontado para qualquer lugar é página de terceiro
 * rodando dentro do app, com a sessão do aluno aberta ao lado. Lista fechada:
 * só o player do Bunny Stream, que é onde mora o acervo do Prime.
 */
export const HOSTS_DE_PLAYER_EXTERNO: readonly string[] = ['iframe.mediadelivery.net'];

/**
 * A URL do player, se for de um host aceito; senão `null`.
 *
 * Compara o host EXATO, e não "termina com" nem "contém": com qualquer um dos
 * dois, `iframe.mediadelivery.net.qualquercoisa.com` passaria.
 */
export function playerExternoSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!HOSTS_DE_PLAYER_EXTERNO.includes(u.hostname)) return null;
  if (!u.pathname.startsWith('/embed/')) return null;
  return u.toString();
}

/**
 * O player configurado como demonstração: começa sozinho, sem som, e repete.
 *
 * As demonstrações do acervo têm poucos segundos. Tocar uma vez e parar obriga
 * o aluno a apertar o play a cada repetição que quer rever — no meio da série,
 * com a mão ocupada. Em loop e mudo, se comporta como a imagem animada que
 * substitui.
 *
 * Mudo é condição para começar sozinho: navegador e sistema do celular só
 * deixam tocar sem toque do usuário o vídeo que não tem som.
 */
export function comoDemonstracao(url: string): string {
  const u = new URL(url);
  u.searchParams.set('autoplay', 'true');
  u.searchParams.set('muted', 'true');
  u.searchParams.set('loop', 'true');
  u.searchParams.set('preload', 'true');
  u.searchParams.set('responsive', 'true');
  return u.toString();
}

/** O que a tela deve tocar: um arquivo no `<video>`, ou uma página de player. */
export type VideoParaTocar =
  | { tipo: 'ARQUIVO'; url: string }
  | { tipo: 'PLAYER'; url: string }
  | null;

/**
 * Qual vídeo mostrar, quando há mais de um.
 *
 * O arquivo nosso vence o player externo sempre. `arquivoUrl` já chega com a
 * outra precedência resolvida pela API — a gravação de quem acompanha o aluno
 * antes da do acervo —, então aqui só resta decidir entre "é nosso" e "é de
 * fora". O de fora é o que cobre o catálogo enquanto a gravação própria não
 * chega; não é o que a substitui.
 *
 * Fica numa função só porque são duas telas (site e aplicativo) decidindo a
 * mesma coisa. Escrita duas vezes, bastaria uma delas inverter a ordem para o
 * aluno ver a demonstração genérica por cima da que o personal gravou.
 */
export function videoDeMaiorPrioridade(v: {
  /** Link do arquivo nosso, quando já foi pedido. */
  arquivoUrl?: string | null;
  /**
   * Há arquivo nosso, mesmo que o link ainda não tenha sido pedido.
   *
   * No site, o link assinado só é buscado quando alguém aperta "Ver vídeo".
   * Sem esta informação, o exercício com gravação do personal mostraria o
   * player de fora até o clique — a demonstração genérica por cima da dele.
   */
  temArquivo?: boolean;
  playerUrl?: string | null;
}): VideoParaTocar {
  if (v.arquivoUrl) return { tipo: 'ARQUIVO', url: v.arquivoUrl };
  if (v.temArquivo) return null;
  const player = playerExternoSeguro(v.playerUrl);
  return player ? { tipo: 'PLAYER', url: comoDemonstracao(player) } : null;
}
