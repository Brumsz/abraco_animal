import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useSessao } from '@/core/sessao';
import { useChatAoVivo } from '@/features/chat/data/hooks';
import { BarraNavegacao } from '@/shared/componentes/BarraNavegacao';

/**
 * Área logada. A barra muda pelo papel (protótipo "Componentes - Navegação"):
 * usuário vê Doar no centro; o admin vê Central.
 */
export default function LayoutApp() {
  const estado = useSessao((s) => s.estado);
  const ehAdmin = useSessao((s) => s.usuario?.role === 'ADMIN');
  useChatAoVivo();

  if (estado === 'anonimo') return <Redirect href="/login" />;

  return (
    <Tabs tabBar={(props) => <BarraNavegacao {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="inicio" />
      <Tabs.Screen name="adotar" />
      <Tabs.Screen name="doar" options={ehAdmin ? { href: null } : {}} />
      <Tabs.Screen name="central" options={ehAdmin ? {} : { href: null }} />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
