/**
 * Paleta da Abraço Animal — tokens do protótipo no Paper (arquivo "Quick shell").
 * Os nomes seguem os tokens do Paper: bg-app → fundo, ink-strong → tinta, brand → marca…
 *
 * Contraste (WCAG AA ≥ 4,5:1 para texto normal):
 *  - texto branco sobre `marca` (#D9480F) dá 4,3:1 (reprovado para texto de 16 px) →
 *    o fundo dos botões usa `marcaEscura` (5,7:1), que também é token do protótipo;
 *  - links/texto laranja sobre o fundo usam `marcaEscura` (5,4:1);
 *  - `tintaSuave` (#78716C) sobre o fundo dá 4,5:1 e sobre branco 4,8:1;
 *  - `marca` fica para ícones, bordas de foco e detalhes (≥ 3:1, WCAG 1.4.11).
 */
export const cores = {
  // Superfícies
  fundo: '#FBF8F4',
  superficie: '#FFFFFF',
  fundoSuave: '#F3EEE8',
  // Texto
  tinta: '#1C1917',
  tintaCorpo: '#44403C',
  tintaSuave: '#78716C',
  // Linhas
  linha: '#E9E3DC',
  linhaForte: '#D6CEC5',
  // Marca
  marca: '#D9480F',
  marcaEscura: '#B93A0A',
  marcaPressionada: '#9A3008',
  marcaDestaque: '#F97316',
  marcaClara: '#FFF1E8',
  marcaClaraForte: '#FFDCC7',
  // Estados
  sucessoFundo: '#DCFCE7',
  sucessoTexto: '#166534',
  avisoFundo: '#FEF3C7',
  avisoTexto: '#92400E',
  infoFundo: '#DBEAFE',
  infoTexto: '#1E40AF',
  erro: '#DC2626',
  erroFundo: '#FEE2E2',
  erroTexto: '#991B1B',
  branco: '#FFFFFF',
  sombra: '#1C1917',
} as const;

export type Cor = keyof typeof cores;

/** Pares fundo/texto dos badges de status — todos ≥ 4,5:1. */
export const coresStatus = {
  PENDENTE: { fundo: cores.avisoFundo, texto: cores.avisoTexto },
  APROVADA: { fundo: cores.sucessoFundo, texto: cores.sucessoTexto },
  RECUSADA: { fundo: cores.erroFundo, texto: cores.erroTexto },
  EM_TRATAMENTO: { fundo: cores.infoFundo, texto: cores.infoTexto },
  NEUTRO: { fundo: cores.fundoSuave, texto: cores.tintaCorpo },
  DESTAQUE: { fundo: cores.marcaClara, texto: cores.marcaEscura },
} as const;

export type StatusBadge = keyof typeof coresStatus;

/** Gradiente dos cabeçalhos laranja (Login, Splash): 145° de marcaEscura a marcaDestaque. */
export const gradienteMarca = [cores.marcaEscura, cores.marcaDestaque] as const;
