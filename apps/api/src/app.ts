import { createHash } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';

import { registrarRotasHealth, type VerificacaoProntidao } from './http/health.js';
import { rotasAuth, type DependenciasRotasAuth } from './modules/auth/http/rotas.js';
import { registrarTratadorErros } from './shared/http/tratador-erros.js';

export interface OpcoesApp {
  readonly logger?: FastifyServerOptions['logger'];
  readonly verificacoesProntidao?: readonly VerificacaoProntidao[];
  /** Origens permitidas no CORS. Vazio = nenhuma (o app nativo não usa CORS). */
  readonly corsOrigens?: readonly string[];
  /** Redis para o rate limit global; sem ele, usa memória (só em testes). */
  readonly redis?: Redis;
  readonly auth?: DependenciasRotasAuth;
  /** Limite global por IP por minuto (seção 6: 100). */
  readonly limiteGlobalPorMinuto?: number;
}

/**
 * Campos que nunca podem aparecer em log (seção 6 da spec).
 * Mantido aqui para valer desde a primeira rota.
 */
export const CAMPOS_REDIGIDOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["asaas-access-token"]',
  'req.headers["idempotency-key"]',
  '*.senha',
  '*.senhaAtual',
  '*.novaSenha',
  '*.cpf',
  '*.dataNasc',
  '*.email',
  '*.accessToken',
  '*.refreshToken',
  '*.tokenRedefinicao',
  '*.codigo',
] as const;

export function construirApp(opcoes: OpcoesApp = {}): FastifyInstance {
  const app = Fastify({
    logger: opcoes.logger ?? false,
    // Não confiar em X-Forwarded-* até haver um proxy conhecido (configurado na Etapa 11).
    trustProxy: false,
    // Payloads JSON grandes não são esperados; uploads usam multipart com limite próprio.
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registrarTratadorErros(app);

  void app.register(helmet, {
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    // API só serve JSON: CSP mais restritiva possível.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });

  void app.register(cors, {
    origin: opcoes.corsOrigens && opcoes.corsOrigens.length > 0 ? [...opcoes.corsOrigens] : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
  });

  void app.register(rateLimit, {
    global: true,
    max: opcoes.limiteGlobalPorMinuto ?? 100,
    timeWindow: '1 minute',
    nameSpace: 'rl:geral:',
    // IP é dado pessoal (LGPD): a chave no Redis usa o hash, nunca o IP em claro.
    keyGenerator: (request) => createHash('sha256').update(request.ip).digest('hex').slice(0, 32),
    ...(opcoes.redis ? { redis: opcoes.redis } : {}),
    // Health checks do orquestrador não contam no limite.
    allowList: (request) => request.url.startsWith('/health/'),
  });

  // Rotas entram depois dos plugins acima para herdar os hooks deles.
  void app.register(async (instancia) => {
    registrarRotasHealth(instancia, opcoes.verificacoesProntidao ?? []);
    await Promise.resolve();
  });

  if (opcoes.auth) {
    void app.register(rotasAuth(opcoes.auth), { prefix: '/v1' });
  }

  return app;
}
