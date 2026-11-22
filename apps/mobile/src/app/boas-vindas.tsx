import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SplashMarca } from '@/shared/componentes/SplashMarca';

/** Protótipo "Splash - Login": transição curta depois de entrar ou criar a conta. */
export default function BoasVindas() {
  const router = useRouter();
  const seguir = useCallback(() => {
    router.replace('/inicio');
  }, [router]);
  return (
    <SplashMarca
      etapa={1}
      titulo="Que bom te ver"
      subtitulo="Entre e continue transformando vidas."
      aoTerminar={seguir}
    />
  );
}
