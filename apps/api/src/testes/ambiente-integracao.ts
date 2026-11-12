/**
 * Sobe Postgres 16 e Redis 7 reais (Testcontainers), aplica as migrações do
 * Prisma e monta o app completo — só o envio de e-mail é substituído por uma
 * caixa em memória para o teste ler o código de recuperação.
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import { construirApp } from '../app.js';
import { comporAuth, verificacoesProntidao, type ConfigComposicao } from '../composicao.js';
import type { FilaEmails } from '../modules/auth/application/portas.js';
import type { Relogio } from '../shared/aplicacao/relogio.js';
import { criarPrisma, type Prisma } from '../shared/infra/prisma.js';
import { criarRedis } from '../shared/infra/redis.js';

const RAIZ_API = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export class CaixaEmails implements FilaEmails {
  readonly codigos: { para: string; codigo: string }[] = [];
  readonly alteracoes: string[] = [];
  codigoRecuperacao(d: { para: string; codigo: string }) {
    this.codigos.push({ para: d.para, codigo: d.codigo });
    return Promise.resolve();
  }
  senhaAlterada(d: { para: string }) {
    this.alteracoes.push(d.para);
    return Promise.resolve();
  }
  ultimoCodigo(para: string): string {
    const item = this.codigos.filter((c) => c.para === para).at(-1);
    if (!item) throw new Error(`nenhum código enviado para ${para}`);
    return item.codigo;
  }
}

const chave32 = (byte: number) => Buffer.alloc(32, byte).toString('base64');

export function gerarParJwt() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publica: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export interface AmbienteIntegracao {
  readonly app: FastifyInstance;
  readonly prisma: Prisma;
  readonly redis: Redis;
  readonly emails: CaixaEmails;
  readonly config: ConfigComposicao;
  readonly chaves: ReturnType<typeof gerarParJwt>;
  /** Monta um app novo sobre o mesmo banco (ex.: com outro relógio). */
  criarApp(opcoes?: { relogio?: Relogio }): Promise<FastifyInstance>;
  encerrar(): Promise<void>;
}

export async function iniciarAmbiente(): Promise<AmbienteIntegracao> {
  const [pg, rd]: [StartedPostgreSqlContainer, StartedRedisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16.15-alpine').start(),
    new RedisContainer('redis:7.4.12-alpine').start(),
  ]);

  const databaseUrl = `${pg.getConnectionUri()}?schema=public`;
  // Migrações reais (as mesmas do deploy), incluindo o índice parcial manual.
  execFileSync(
    process.execPath,
    [resolve(RAIZ_API, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    },
  );

  const prisma = criarPrisma(databaseUrl);
  const redis = criarRedis(rd.getConnectionUrl());
  const emails = new CaixaEmails();
  const chaves = gerarParJwt();

  const config: ConfigComposicao = {
    JWT_PRIVATE_KEY_B64: chaves.privada,
    JWT_PUBLIC_KEY_B64: chaves.publica,
    JWT_ISSUER: 'https://api.teste.abracoanimal.org.br',
    JWT_AUDIENCE: 'abraco-animal-app',
    ACCESS_TOKEN_TTL_SEGUNDOS: 900,
    REFRESH_TOKEN_TTL_DIAS: 30,
    DADOS_CRYPTO_KEY_B64: chave32(1),
    DADOS_CRYPTO_KEY_VERSAO: 1,
    CPF_HMAC_KEY_B64: chave32(2),
    CODIGOS_HMAC_KEY_B64: chave32(3),
  };

  const infra = { prisma, redis, emails };

  const criarApp = async (opcoes: { relogio?: Relogio } = {}) => {
    const auth = await comporAuth(config, { ...infra, ...opcoes });
    const app = construirApp({
      verificacoesProntidao: verificacoesProntidao(infra),
      redis,
      auth: auth.rotas,
    });
    return app;
  };

  const app = await criarApp();
  await app.ready();

  return {
    app,
    prisma,
    redis,
    emails,
    config,
    chaves,
    criarApp,
    async encerrar() {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
      await Promise.all([pg.stop(), rd.stop()]);
    },
  };
}
