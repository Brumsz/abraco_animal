import { useEffect } from 'react';
import { type DimensionValue, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cores } from '../tokens/cores';
import { raio as raios } from '../tokens/layout';

export interface SkeletonLoaderProps {
  readonly largura?: DimensionValue;
  readonly altura?: DimensionValue;
  readonly raio?: number;
}

/**
 * Bloco pulsante de carregamento. É decorativo: a tela que o usa deve anunciar
 * "Carregando" para leitores de tela (ex.: accessibilityLabel no container).
 */
export function SkeletonLoader({
  largura = '100%',
  altura = 16,
  raio = raios.sm,
}: SkeletonLoaderProps) {
  const reduzirMovimento = useReducedMotion();
  const opacidade = useSharedValue(1);

  useEffect(() => {
    if (reduzirMovimento) return;
    opacidade.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
    return () => {
      cancelAnimation(opacidade);
    };
  }, [reduzirMovimento, opacidade]);

  const estilo = useAnimatedStyle(() => ({ opacity: opacidade.get() }));

  return (
    <Animated.View
      style={[styles.bloco, { width: largura, height: altura, borderRadius: raio }, estilo]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID="skeleton"
    />
  );
}

const styles = StyleSheet.create({
  bloco: { backgroundColor: cores.neutro200 },
});
