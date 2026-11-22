import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { onboardingConcluido } from '@/core/preferencias';
import { iniciarSessao, useSessao } from '@/core/sessao';
import { SplashMarca } from '@/shared/componentes/SplashMarca';

const DURACAO_SPLASH_MS = 1500;

/** Protótipo "Splash - Início": abre o app enquanto a sessão guardada é restaurada. */
export default function TelaSplash() {
  const router = useRouter();

  useEffect(() => {
    let ativo = true;
    const espera = new Promise((resolver) => setTimeout(resolver, DURACAO_SPLASH_MS));

    void Promise.all([onboardingConcluido(), espera, iniciarSessao()]).then(([concluido]) => {
      if (!ativo) return;
      if (!concluido) router.replace('/onboarding');
      else if (useSessao.getState().estado === 'autenticado') router.replace('/inicio');
      else router.replace('/login');
    });

    return () => {
      ativo = false;
    };
  }, [router]);

  return (
    <SplashMarca
      etapa={0}
      titulo="Laços e abraços"
      subtitulo="Cada animal merece cuidado, carinho e um lar."
    />
  );
}
