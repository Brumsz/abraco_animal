import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { cores, ToastProvider } from '@abraco/ui';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Mantém a splash nativa (fundo laranja) até as fontes carregarem.
void SplashScreen.preventAutoHideAsync();

export default function LayoutRaiz() {
  const [fontesProntas, erroFontes] = useFonts({
    Poppins_700Bold,
    Poppins_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const pronto = fontesProntas || erroFontes !== null;

  useEffect(() => {
    if (pronto) void SplashScreen.hideAsync();
  }, [pronto]);

  // Se as fontes falharem, o app segue com a fonte do sistema em vez de travar.
  if (!pronto) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: cores.creme },
              animation: 'fade',
            }}
          />
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
