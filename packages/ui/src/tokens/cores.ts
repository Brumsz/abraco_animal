/**
 * Paleta oficial da Abraço Animal (seção 2 da spec) + tokens de acessibilidade.
 *
 * Contraste (WCAG AA ≥ 4,5:1 para texto normal) — decisão da revisão de design:
 *  - texto branco sobre laranjaPrimario dá 2,8:1 (reprovado) → botões usam marromTexto (5,6:1);
 *  - texto/links laranja sobre fundo claro usam laranjaTexto #C2410C (5,2:1 / 4,8:1 no creme);
 *  - texto secundário sobre creme usa neutro600 (neutro500 dá 4,45:1);
 *  - fundo do botão destrutivo usa erroForte (branco 4,8:1).
 */
export const cores = {
  laranjaPrimario: '#F97316',
  laranjaEscuro: '#EA6A0A',
  laranjaSuave: '#FED7AA',
  laranjaClaro: '#FFF7ED',
  laranjaTexto: '#C2410C',
  creme: '#FAF5EB',
  marromTexto: '#431407',
  neutro900: '#111827',
  neutro600: '#4B5563',
  neutro500: '#6B7280',
  neutro200: '#E5E7EB',
  neutro100: '#F3F4F6',
  branco: '#FFFFFF',
  erro: '#EF4444',
  erroForte: '#DC2626',
  sucesso: '#22C55E',
  aviso: '#F59E0B',
  sombra: '#431407',
} as const;

export type Cor = keyof typeof cores;

/** Pares fundo/texto dos badges de status — todos ≥ 4,5:1. */
export const coresStatus = {
  PENDENTE: { fundo: '#FEF3C7', texto: '#92400E' },
  APROVADA: { fundo: '#DCFCE7', texto: '#166534' },
  RECUSADA: { fundo: '#FEE2E2', texto: '#991B1B' },
  EM_TRATAMENTO: { fundo: '#DBEAFE', texto: '#1E40AF' },
  NEUTRO: { fundo: cores.neutro100, texto: cores.neutro600 },
  DESTAQUE: { fundo: cores.laranjaSuave, texto: cores.marromTexto },
} as const;

export type StatusBadge = keyof typeof coresStatus;

/** Gradiente suave usado em headers de seção e banners. */
export const gradienteLaranja = [cores.laranjaPrimario, '#FB923C', cores.laranjaSuave] as const;
