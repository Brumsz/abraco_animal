import * as SecureStore from 'expo-secure-store';

/**
 * Preferências locais do app. Usa expo-secure-store (a spec proíbe AsyncStorage
 * para tokens; aqui mantemos um único mecanismo de armazenamento).
 */
const CHAVE_ONBOARDING = 'onboarding_concluido';

export async function onboardingConcluido(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CHAVE_ONBOARDING)) === '1';
  } catch {
    // Falha de leitura não pode travar o app: mostra o onboarding de novo.
    return false;
  }
}

export async function marcarOnboardingConcluido(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CHAVE_ONBOARDING, '1');
  } catch {
    // Não é crítico: no pior caso o onboarding aparece novamente.
  }
}
