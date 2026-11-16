/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Pacotes do monorepo usam imports ESM com ".js" apontando para arquivos ".ts".
    // ("\\." na string = ponto literal; sem isso ".cjs" também casaria.)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // pnpm guarda os pacotes em node_modules/.pnpm/<pkg>@<versão>/node_modules/<pkg>:
  // o padrão precisa liberar a transformação desses caminhos também.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|phosphor-react-native|react-native-reanimated|react-native-worklets|openapi-fetch))',
  ],
};
