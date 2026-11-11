import { defineConfig, env } from 'prisma/config';

// Prisma 7 não carrega .env sozinho. Em dev lê o .env da raiz do monorepo;
// em CI/produção as variáveis já vêm do ambiente.
try {
  process.loadEnvFile('../../.env');
} catch {
  // sem .env: segue com as variáveis do ambiente
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
