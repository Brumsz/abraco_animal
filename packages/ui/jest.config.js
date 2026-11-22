/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // O 1º render de cada arquivo inclui a transformação dos módulos: no runner do
  // GitHub chegou a passar de 5 s (padrão). Teste preso de verdade continua falhando.
  testTimeout: 20_000,
  // pnpm guarda os pacotes em node_modules/.pnpm/<pkg>@<versão>/node_modules/<pkg>:
  // o padrão precisa liberar a transformação desses caminhos também.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|phosphor-react-native|react-native-reanimated|react-native-worklets))',
  ],
};
