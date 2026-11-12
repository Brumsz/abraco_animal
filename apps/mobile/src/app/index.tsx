import { cores } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { onboardingConcluido } from '@/core/preferencias';
import { Logo } from '@/shared/componentes/Logo';

const DURACAO_SPLASH_MS = 1500;

/** Splash: logo com fade-in sobre fundo laranja, depois decide o destino. */
export default function TelaSplash() {
  const router = useRouter();
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    let ativo = true;
    const espera = new Promise((resolver) => setTimeout(resolver, DURACAO_SPLASH_MS));

    void Promise.all([onboardingConcluido(), espera]).then(([concluido]) => {
      if (!ativo) return;
      // Sem sessão ainda (Etapa 3): após o onboarding o destino é o login.
      router.replace(concluido ? '/login' : '/onboarding');
    });

    return () => {
      ativo = false;
    };
  }, [router]);

  return (
    <View style={styles.tela}>
      <StatusBar style="dark" />
      <Animated.View
        entering={reduzirMovimento ? undefined : FadeIn.duration(800)}
        style={styles.centro}
      >
        <Logo tema="claro" tamanho="grande" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    backgroundColor: cores.laranjaPrimario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centro: { alignItems: 'center' },
});
