import type { TextStyle } from 'react-native';

/**
 * Nomes das fontes carregadas via @expo-google-fonts no app.
 * Precisam bater exatamente com as chaves passadas ao useFonts().
 */
export const fontes = {
  poppinsBold: 'Poppins_700Bold',
  poppinsSemiBold: 'Poppins_600SemiBold',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
} as const;

export type VarianteTexto = 'h1' | 'h2' | 'h3' | 'body1' | 'body2' | 'caption' | 'label';

/** Hierarquia da seção 2 (tamanhos em sp — o RN escala com a fonte do sistema). */
export const tipografia: Record<VarianteTexto, TextStyle> = {
  h1: { fontFamily: fontes.poppinsBold, fontSize: 28, lineHeight: 36 },
  h2: { fontFamily: fontes.poppinsSemiBold, fontSize: 22, lineHeight: 30 },
  h3: { fontFamily: fontes.poppinsSemiBold, fontSize: 18, lineHeight: 26 },
  body1: { fontFamily: fontes.interRegular, fontSize: 16, lineHeight: 24 },
  body2: { fontFamily: fontes.interRegular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontes.interRegular, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontes.interMedium, fontSize: 13, lineHeight: 18 },
};

/** Limite de ampliação para não quebrar layouts (ainda permite 2x o tamanho base). */
export const MULTIPLICADOR_MAXIMO_FONTE = 2;
