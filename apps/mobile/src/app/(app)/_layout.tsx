import { cores } from '@abraco/ui';
import { Redirect, Stack } from 'expo-router';

import { useSessao } from '@/core/sessao';
import { useChatAoVivo } from '@/features/chat/data/hooks';

/**
 * Área logada: as abas (grupo "(abas)") e, por cima delas, as telas cheias
 * (detalhe do animal, adoção, doar um animal…), que escondem a barra inferior.
 */
export default function LayoutApp() {
  const estado = useSessao((s) => s.estado);
  useChatAoVivo();

  if (estado === 'anonimo') return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: cores.fundo },
        animation: 'slide_from_right',
      }}
    />
  );
}
