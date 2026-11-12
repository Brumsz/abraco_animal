import { setUpTests } from 'react-native-reanimated';

setUpTests();

// expo-secure-store é nativo: nos testes usa um armazenamento em memória.
jest.mock('expo-secure-store', () => {
  const dados = new Map<string, string>();
  return {
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
