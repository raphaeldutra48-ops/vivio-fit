import { z } from 'zod';
import type { Papel } from './enums';

/**
 * Endereço da página: /p/{slug}.
 *
 * Minúsculas, números e hífen. Sem acento nem espaço porque vira URL, e sem
 * underscore porque some quando o link é sublinhado.
 */
export const slugSchema = z
  .string()
  .min(3, 'Use ao menos 3 caracteres')
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use só letras minúsculas, números e hífen');

/** Reservados para rotas do próprio app — não podem virar página de ninguém. */
export const SLUGS_RESERVADOS = [
  'admin',
  'api',
  'app',
  'alunos',
  'login',
  'cadastrar',
  'sobre',
  'ajuda',
  'suporte',
  'contato',
  'termos',
  'privacidade',
  'vivio',
  'viviofit',
];

export const salvarPerfilPublicoSchema = z.object({
  slug: slugSchema,
  titulo: z.string().min(3).max(120),
  apresentacao: z.string().max(2000).optional(),
  cidade: z.string().max(80).optional(),
  uf: z.string().length(2).optional(),
  atendeOnline: z.boolean().default(true),
  atendePresencial: z.boolean().default(false),
  /** Só dígitos; a tela monta o link do WhatsApp. */
  whatsapp: z.string().regex(/^\d{10,13}$/, 'Use só números, com DDD').optional(),
  instagram: z.string().max(40).optional(),
  publicado: z.boolean().default(false),
});
export type SalvarPerfilPublicoInput = z.infer<typeof salvarPerfilPublicoSchema>;

export interface PerfilPublicoResumo {
  id: string;
  slug: string;
  titulo: string;
  apresentacao: string | null;
  cidade: string | null;
  uf: string | null;
  atendeOnline: boolean;
  atendePresencial: boolean;
  whatsapp: string | null;
  instagram: string | null;
  publicado: boolean;
  /** Quantos pedidos de contato ainda não foram atendidos. */
  pedidosPendentes: number;
}

/** O que qualquer pessoa vê. Sem e-mail, sem telefone que não foi publicado. */
export interface PaginaPublica {
  slug: string;
  titulo: string;
  apresentacao: string | null;
  cidade: string | null;
  uf: string | null;
  atendeOnline: boolean;
  atendePresencial: boolean;
  whatsapp: string | null;
  instagram: string | null;
  profissional: {
    nome: string;
    papel: Papel;
    /** Registro no conselho: obrigatório divulgar, e é o que dá confiança. */
    registroConselho: string;
    ufRegistro: string;
    especialidades: string[];
  };
}

export const enviarPedidoSchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email().max(160),
  telefone: z.string().min(8).max(20).optional(),
  mensagem: z.string().max(1000).optional(),
});
export type EnviarPedidoInput = z.infer<typeof enviarPedidoSchema>;

export interface PedidoResumo {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  mensagem: string | null;
  atendidoEm: string | null;
  criadoEm: string;
}

/** "https://wa.me/5585999998888" */
export function linkDoWhatsapp(numero: string | null): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, '');
  // Sem código do país o link não abre; 55 é o padrão para número brasileiro.
  const completo = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${completo}`;
}

/** Sugere um endereço a partir do nome: "Ana Paula Costa" -> "ana-paula-costa". */
export function sugerirSlug(nome: string): string {
  return nome
    .normalize('NFD')
    // Marcas de acento viram caracteres próprios depois do NFD. Escape
    // explícito em vez do caractere literal: combining mark no código-fonte é
    // invisível no editor e some em qualquer conversão de encoding.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}
