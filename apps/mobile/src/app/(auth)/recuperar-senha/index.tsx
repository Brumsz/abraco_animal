import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SplashMarca } from '@/shared/componentes/SplashMarca';

/** Protótipo "Splash - Recuperar senha": transição curta antes do passo do e-mail. */
export default function SplashRecuperacao() {
  const router = useRouter();
  const seguir = useCallback(() => {
    router.replace('/recuperar-senha/email');
  }, [router]);
  return (
    <SplashMarca
      etapa={2}
      titulo="Vamos recuperar"
      subtitulo="Em poucos passos você volta a acessar sua conta."
      aoTerminar={seguir}
    />
  );
}
