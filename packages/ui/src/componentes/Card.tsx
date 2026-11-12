import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { cores } from '../tokens/cores';
import { espaco, raio, sombraSuave } from '../tokens/layout';

export interface CardProps {
  readonly children: ReactNode;
  readonly aoPressionar?: () => void;
  /** Obrigatório quando o card é tocável: o leitor de tela anuncia este texto. */
  readonly rotuloAcessivel?: string;
  /** false remove o padding interno (ex.: card com foto de borda a borda). */
  readonly comPadding?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function Card({
  children,
  aoPressionar,
  rotuloAcessivel,
  comPadding = true,
  style,
  testID,
}: CardProps) {
  const estilo = [styles.card, comPadding ? styles.padding : null, style];

  if (!aoPressionar) {
    return (
      <View style={estilo} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotuloAcessivel}
      onPress={aoPressionar}
      testID={testID}
      style={({ pressed }) => [...estilo, pressed ? styles.pressionado : null]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: cores.branco,
    borderRadius: raio.lg,
    overflow: 'hidden',
    ...sombraSuave,
  },
  padding: { padding: espaco.lg },
  pressionado: { opacity: 0.9 },
});
