// Reanimated 4: mock próprio (packages/ui/jest/reanimated-mock.js), sem módulos
// nativos nem DOM — comportamento igual no Windows e no Linux (CI).
jest.mock('react-native-reanimated', () =>
  jest.requireActual<Record<string, unknown>>('@abraco/ui/jest/reanimated-mock'),
);

// expo-secure-store é nativo: nos testes usa um armazenamento em memória.
jest.mock('expo-secure-store', () => {
  const dados = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    __dados: dados,
    getItemAsync: jest.fn((chave: string) => Promise.resolve(dados.get(chave) ?? null)),
    setItemAsync: jest.fn((chave: string, valor: string) => {
      dados.set(chave, valor);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((chave: string) => {
      dados.delete(chave);
      return Promise.resolve();
    }),
  };
});

// Safe area: mock oficial da biblioteca (insets fixos).
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<{ default: unknown }>('react-native-safe-area-context/jest/mock').default,
);

// expo-crypto é nativo: nos testes usa o crypto do Node.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>('crypto').randomUUID(),
}));

// Push e Sentry são nativos: nos testes, sem aparelho e sem permissão.
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, status: 'denied' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.reject(new Error('sem aparelho'))),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), wrap: (c: unknown) => c }));
