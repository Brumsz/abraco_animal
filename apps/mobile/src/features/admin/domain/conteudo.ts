/**
 * Formulários de conteúdo — mesmos limites da API: notícia (título 160, resumo 300,
 * texto 50 000), legenda do post (2200), seção do perfil (título 120, texto 20 000)
 * e FAQ (pergunta 200, resposta 5000).
 */
import type { SecaoPerfilOng } from '@abraco/shared';
import type { StatusBadge } from '@abraco/ui';
import { z } from 'zod';

const texto = (rotulo: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Escreva ${rotulo}`)
    .max(max, `No máximo ${String(max)} caracteres`);

export const LIMITES_CONTEUDO = {
  titulo: 160,
  resumo: 300,
  conteudo: 50_000,
  legenda: 2200,
  tituloSecao: 120,
  conteudoSecao: 20_000,
  pergunta: 200,
  resposta: 5000,
} as const;

const L = LIMITES_CONTEUDO;

export const esquemaNoticia = z.object({
  titulo: texto('o título', L.titulo),
  resumo: texto('o resumo', L.resumo),
  conteudo: texto('o texto da notícia', L.conteudo),
});
export type FormNoticia = z.input<typeof esquemaNoticia>;

export const esquemaSecao = z.object({
  titulo: texto('o título', L.tituloSecao),
  conteudo: texto('o texto', L.conteudoSecao),
  publicado: z.boolean(),
});
export type FormSecao = z.input<typeof esquemaSecao>;

export const esquemaFaq = z.object({
  pergunta: texto('a pergunta', L.pergunta),
  resposta: texto('a resposta', L.resposta),
  publicado: z.boolean(),
});
export type FormFaq = z.input<typeof esquemaFaq>;

export function problemaLegenda(legenda: string): string | null {
  const n = legenda.trim().length;
  if (n === 0) return 'Escreva uma legenda';
  return n > L.legenda ? `No máximo ${String(L.legenda)} caracteres` : null;
}

export const PUBLICACAO: Record<'sim' | 'nao', { texto: string; badge: StatusBadge }> = {
  sim: { texto: 'Publicado', badge: 'APROVADA' },
  nao: { texto: 'Rascunho', badge: 'NEUTRO' },
};
export const publicacao = (publicado: boolean) => PUBLICACAO[publicado ? 'sim' : 'nao'];

export const SECOES: readonly { valor: SecaoPerfilOng; rotulo: string }[] = [
  { valor: 'SOBRE_NOS', rotulo: 'Sobre nós' },
  { valor: 'FUNDACAO', rotulo: 'Fundação' },
  { valor: 'FUNDADORES', rotulo: 'Fundadores' },
];

/** Seção ainda não escrita: o formulário começa com o nome da aba e despublicado. */
export function valoresDaSecao(
  secao: SecaoPerfilOng,
  existentes: readonly {
    secao: SecaoPerfilOng;
    titulo: string;
    conteudo: string;
    publicado: boolean;
  }[],
): FormSecao {
  const s = existentes.find((x) => x.secao === secao);
  if (s) return { titulo: s.titulo, conteudo: s.conteudo, publicado: s.publicado };
  return {
    titulo: SECOES.find((x) => x.valor === secao)?.rotulo ?? '',
    conteudo: '',
    publicado: false,
  };
}
