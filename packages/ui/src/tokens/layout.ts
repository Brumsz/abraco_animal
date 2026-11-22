import { Platform, type ViewStyle } from 'react-native';

import { cores } from './cores';

export const espaco = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Raios do protótipo: campos 14, botões 16, cartões 20, folhas 28/32. */
export const raio = {
  xs: 8,
  sm: 10,
  md: 14,
  botao: 16,
  lg: 20,
  xl: 28,
  folha: 32,
  pilula: 999,
} as const;

/** Alvo de toque mínimo (seção 2 — acessibilidade). */
export const ALVO_TOQUE_MINIMO = 44;

/** Sombra suave dos cartões (protótipo: #1C1917 a ~8%). */
export const sombraSuave: ViewStyle = Platform.select<ViewStyle>({
  android: { elevation: 2 },
  default: {
    shadowColor: cores.sombra,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});

/** Sombra do botão principal (protótipo: laranja a 28%, 0 8 24). */
export const sombraMarca: ViewStyle = Platform.select<ViewStyle>({
  android: { elevation: 6, shadowColor: cores.marca },
  default: {
    shadowColor: cores.marca,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
});

export const duracao = { rapida: 150, normal: 250, lenta: 400 } as const;
