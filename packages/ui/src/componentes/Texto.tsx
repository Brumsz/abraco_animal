import { Text, type TextProps, type TextStyle } from 'react-native';

import { cores } from '../tokens/cores';
import { MULTIPLICADOR_MAXIMO_FONTE, tipografia, type VarianteTexto } from '../tokens/tipografia';

export interface TextoProps extends TextProps {
  readonly variante?: VarianteTexto;
  readonly cor?: string;
  readonly alinhamento?: TextStyle['textAlign'];
}

const TITULOS: readonly VarianteTexto[] = ['h1', 'h2', 'h3'];

/**
 * Texto tipográfico do design system. Respeita o tamanho de fonte do sistema
 * (até 2x) e marca h1–h3 como cabeçalho para leitores de tela.
 */
export function Texto({
  variante = 'body1',
  cor = cores.neutro900,
  alinhamento,
  style,
  ...props
}: TextoProps) {
  return (
    <Text
      accessibilityRole={TITULOS.includes(variante) ? 'header' : 'text'}
      maxFontSizeMultiplier={MULTIPLICADOR_MAXIMO_FONTE}
      {...props}
      style={[
        tipografia[variante],
        { color: cor },
        alinhamento ? { textAlign: alinhamento } : null,
        style,
      ]}
    />
  );
}
