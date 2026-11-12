/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Reanimated 4 / Worklets: usa as implementações web no lugar dos módulos nativos.
  resolver: require.resolve('react-native-reanimated/jest/resolver'),
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // pnpm guarda os pacotes em node_modules/.pnpm/<pkg>@<versão>/node_modules/<pkg>:
  // o padrão precisa liberar a transformação desses caminhos também.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|phosphor-react-native|react-native-reanimated|react-native-worklets))',
  ],
};
