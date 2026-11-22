import { gradienteMarca } from '@abraco/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface FundoMarcaProps {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Fundo laranja do protótipo: gradiente a 145° (marcaEscura → marcaDestaque) com
 * dois círculos brancos translúcidos (8%) nos cantos — puramente decorativos.
 */
export function FundoMarca({ children, style }: FundoMarcaProps) {
  return (
    <LinearGradient
      colors={gradienteMarca}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.75, y: 1 }}
      style={[styles.fundo, style]}
    >
      <View style={[styles.circulo, styles.circuloGrande]} pointerEvents="none" />
      <View style={[styles.circulo, styles.circuloPequeno]} pointerEvents="none" />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fundo: { overflow: 'hidden' },
  circulo: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.08)' },
  circuloGrande: { width: 280, height: 280, borderRadius: 140, right: -100, top: -90 },
  circuloPequeno: { width: 200, height: 200, borderRadius: 100, left: -70, top: 250 },
});
