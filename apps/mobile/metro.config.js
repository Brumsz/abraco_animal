// Metro (bundler do Expo). Usa a configuração padrão do Expo, que já entende o
// monorepo pnpm, e acrescenta um único ajuste de resolução.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const PACOTES = path.resolve(__dirname, '../../packages') + path.sep;

// Os pacotes do monorepo que também rodam no Node (@abraco/shared, @abraco/api-client)
// escrevem imports ESM com ".js" apontando para arquivos ".ts" (exigência do NodeNext).
// O TypeScript entende isso; o Metro não. Só para esses pacotes: "./x.js" → "./x".
const resolverPadrao = config.resolver.resolveRequest;
config.resolver.resolveRequest = (contexto, modulo, plataforma) => {
  const resolver = resolverPadrao ?? contexto.resolveRequest;
  if (
    modulo.startsWith('.') &&
    modulo.endsWith('.js') &&
    contexto.originModulePath.startsWith(PACOTES) &&
    !contexto.originModulePath.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    try {
      return resolver(contexto, modulo.slice(0, -3), plataforma);
    } catch {
      // Não existe a versão .ts: segue com o caminho original.
    }
  }
  return resolver(contexto, modulo, plataforma);
};

module.exports = config;
