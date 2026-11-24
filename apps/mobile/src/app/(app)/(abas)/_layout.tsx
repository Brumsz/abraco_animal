import { Tabs } from 'expo-router/js-tabs';

import { useSessao } from '@/core/sessao';
import { BarraNavegacao } from '@/shared/componentes/BarraNavegacao';

/**
 * Abas da área logada. A barra muda pelo papel (protótipo "Componentes - Navegação"):
 * usuário vê Doar no centro; o admin vê Central.
 */
export default function LayoutAbas() {
  const ehAdmin = useSessao((s) => s.usuario?.role === 'ADMIN');

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
