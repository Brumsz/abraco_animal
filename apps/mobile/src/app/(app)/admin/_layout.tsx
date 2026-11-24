import { cores } from '@abraco/ui';
import { Redirect, Stack } from 'expo-router';

import { useSessao } from '@/core/sessao';

/**
 * Telas da equipe (/admin/*). Quem não é ADMIN volta para o Início: proteção de
 * navegação apenas — a API confere o papel em cada rota de /v1/admin.
 */
export default function LayoutAdmin() {
  const ehAdmin = useSessao((s) => s.usuario?.role === 'ADMIN');
  if (!ehAdmin) return <Redirect href="/inicio" />;
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
