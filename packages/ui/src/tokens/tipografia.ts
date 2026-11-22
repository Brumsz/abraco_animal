import type { TextStyle } from 'react-native';

/**
 * Nomes das fontes carregadas via @expo-google-fonts no app.
 * Precisam bater exatamente com as chaves passadas ao useFonts().
 * Protótipo: Plus Jakarta Sans nos títulos e botões, Inter no corpo.
 */
export const fontes = {
  displayExtra: 'PlusJakartaSans_800ExtraBold',
  displayBold: 'PlusJakartaSans_700Bold',
  displaySemiBold: 'PlusJakartaSans_600SemiBold',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
} as const;

export type VarianteTexto = 'titulo' | 'h1' | 'h2' | 'h3' | 'body1' | 'body2' | 'caption' | 'label';

/** Escala do protótipo (tamanhos em sp — o RN escala com a fonte do sistema). */
export const tipografia: Record<VarianteTexto, TextStyle> = {
  /** Título de tela ("Adotar", "Doar com Pix"). */
  titulo: { fontFamily: fontes.displayExtra, fontSize: 32, lineHeight: 40, letterSpacing: -0.64 },
  /** Título de cartão/folha ("Bem-vindo de volta"). */
  h1: { fontFamily: fontes.displayBold, fontSize: 26, lineHeight: 34, letterSpacing: -0.26 },
  h2: { fontFamily: fontes.displayBold, fontSize: 20, lineHeight: 28 },
  /** Nome em cartões ("Alípio"). */
  h3: { fontFamily: fontes.displayBold, fontSize: 17, lineHeight: 24 },
  body1: { fontFamily: fontes.interRegular, fontSize: 15, lineHeight: 22 },
  body2: { fontFamily: fontes.interRegular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontes.interRegular, fontSize: 12, lineHeight: 16 },
  /** Rótulo de campo e textos de ação ("Esqueceu a senha?"). */
  label: { fontFamily: fontes.interSemiBold, fontSize: 13, lineHeight: 18 },
};

/** Limite de ampliação para não quebrar layouts (ainda permite 2x o tamanho base). */
export const MULTIPLICADOR_MAXIMO_FONTE = 2;
