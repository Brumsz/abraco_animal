import { raio } from '@abraco/ui';
import { Image, StyleSheet } from 'react-native';

// Arte do cavalo exportada do protótipo no Paper (bloco "Logo tile", 2:3).
import ARTE from '../../../assets/imagens/logo.png';

interface LogoProps {
  /** Largura em px; a altura segue a proporção 2:3 da arte. */
  readonly largura?: number;
}

/** Logo da Abraço Animal: cavalo claro sobre o bloco laranja. */
export function Logo({ largura = 160 }: LogoProps) {
  return (
    <Image
      source={ARTE}
      accessibilityRole="image"
      accessibilityLabel="Abraço Animal"
      style={[
        styles.arte,
        { width: largura, height: largura * 1.5, borderRadius: Math.round(largura * 0.175) },
      ]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  arte: { borderRadius: raio.xl },
});
