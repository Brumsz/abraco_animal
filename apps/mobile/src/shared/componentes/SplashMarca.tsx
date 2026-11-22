import { cores, espaco, Texto } from '@abraco/ui';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { FundoMarca } from './FundoMarca';
import { Logo } from './Logo';

interface SplashMarcaProps {
  readonly titulo: string;
  readonly subtitulo: string;
  /** Posição nos três pontinhos do protótipo (0 = abertura, 1 = login, 2 = recuperação). */
  readonly etapa?: 0 | 1 | 2;
  /** Chamado após `duracaoMs`; quem usa decide para onde ir. */
  readonly aoTerminar?: () => void;
  readonly duracaoMs?: number;
}

/** Telas "Splash" do protótipo: fundo laranja, logo grande, frase e pontinhos. */
export function SplashMarca({
  titulo,
  subtitulo,
  etapa = 0,
  aoTerminar,
  duracaoMs = 1200,
}: SplashMarcaProps) {
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    if (!aoTerminar) return;
    const t = setTimeout(aoTerminar, duracaoMs);
    return () => {
      clearTimeout(t);
    };
  }, [aoTerminar, duracaoMs]);

  return (
    <FundoMarca style={styles.tela}>
      <StatusBar style="light" />
      <Animated.View
        entering={reduzirMovimento ? undefined : FadeIn.duration(600)}
        style={styles.centro}
      >
        <Logo largura={220} />
        <Animated.View
          entering={reduzirMovimento ? undefined : FadeInDown.delay(200).duration(500)}
          style={styles.textos}
        >
          <Texto
            variante="titulo"
            cor={cores.branco}
            style={styles.centralizado}
            accessibilityRole="header"
          >
            {titulo}
          </Texto>
          <Texto variante="body1" cor={cores.branco} style={styles.centralizado}>
            {subtitulo}
          </Texto>
        </Animated.View>
      </Animated.View>
      <View style={styles.pontos} importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.ponto, i === etapa ? styles.pontoAtivo : null]} />
        ))}
      </View>
    </FundoMarca>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centro: { alignItems: 'center', gap: espaco.xxl, paddingHorizontal: espaco.xl },
  textos: { alignItems: 'center', gap: espaco.sm },
  centralizado: { textAlign: 'center' },
  pontos: { position: 'absolute', bottom: 72, flexDirection: 'row', gap: espaco.sm },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  pontoAtivo: { width: 24, backgroundColor: cores.branco },
});
