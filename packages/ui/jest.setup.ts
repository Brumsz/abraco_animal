// Reanimated 4: mock próprio (packages/ui/jest/reanimated-mock.js), sem módulos
// nativos nem DOM — comportamento igual no Windows e no Linux (CI).
jest.mock('react-native-reanimated', () =>
  jest.requireActual<Record<string, unknown>>('./jest/reanimated-mock.js'),
);
