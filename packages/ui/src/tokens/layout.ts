import { Platform, type ViewStyle } from 'react-native';

import { cores } from './cores';

export const espaco = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const raio = { sm: 8, md: 12, lg: 16, xl: 24, pilula: 999 } as const;

/** Alvo de toque mínimo (seção 2 — acessibilidade). */
export const ALVO_TOQUE_MINIMO = 44;

/** Sombra suave equivalente a elevation 2. */
export const sombraSuave: ViewStyle = Platform.select<ViewStyle>({
  android: { elevation: 2 },
  default: {
    shadowColor: cores.sombra,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});

export const duracao = { rapida: 150, normal: 250, lenta: 400 } as const;
