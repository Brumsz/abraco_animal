import { CaretLeftIcon } from 'phosphor-react-native';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO } from '../tokens/layout';

export interface BotaoVoltarProps {
  readonly onPress: () => void;
  /** claro: sobre o cabeçalho laranja (translúcido); padrao: sobre o fundo creme. */
  readonly tema?: 'padrao' | 'claro';
  readonly style?: StyleProp<ViewStyle>;
}

/** Botão circular de 40 px do protótipo (alvo de toque de 44 com hitSlop). */
export function BotaoVoltar({ onPress, tema = 'padrao', style }: BotaoVoltarProps) {
  const claro = tema === 'claro';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      onPress={onPress}
      hitSlop={(ALVO_TOQUE_MINIMO - 40) / 2}
      style={({ pressed }) => [
        styles.base,
        claro ? styles.claro : styles.padrao,
        { opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <CaretLeftIcon size={20} color={claro ? cores.branco : cores.tinta} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padrao: { backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.linha },
  claro: { backgroundColor: 'rgba(255,255,255,0.22)' },
});
