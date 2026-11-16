/**
 * Armazenamento seguro (Keychain no iOS, Keystore no Android) — seção 6:
 * tokens só aqui, nunca no AsyncStorage.
 *
 * Só o REFRESH token é persistido. O access token (15 min) fica apenas na
 * memória: um app parado não deixa token de acesso válido no aparelho.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVES = { refresh: 'sessao_refresh', deviceId: 'sessao_device_id' } as const;

// Não vai para backups nem sincroniza com outro aparelho (iCloud): o refresh
// token está vinculado ao deviceId deste aparelho.
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function lerRefresh(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CHAVES.refresh, OPCOES);
  } catch {
    return null;
  }
}

export async function salvarRefresh(token: string): Promise<void> {
  await SecureStore.setItemAsync(CHAVES.refresh, token, OPCOES);
}

export async function apagarRefresh(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CHAVES.refresh, OPCOES);
  } catch {
    // Já não existia.
  }
}

/** Identificador estável deste aparelho (vincula a sessão ao aparelho, seção 6). */
export async function obterDeviceId(): Promise<string> {
  const atual = await SecureStore.getItemAsync(CHAVES.deviceId, OPCOES).catch(() => null);
  if (atual) return atual;
  const novo = Crypto.randomUUID();
  await SecureStore.setItemAsync(CHAVES.deviceId, novo, OPCOES);
  return novo;
}

/** Chave de idempotência (ex.: Pix): uma por intenção de doação. */
export const novaChaveIdempotencia = (): string => Crypto.randomUUID();
