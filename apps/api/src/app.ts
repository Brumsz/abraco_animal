import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registrarRotasHealth, type VerificacaoProntidao } from './http/health.js';

export interface OpcoesApp {
  readonly logger?: FastifyServerOptions['logger'];
  readonly verificacoesProntidao?: readonly VerificacaoProntidao[];
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
  });

  registrarRotasHealth(app, opcoes.verificacoesProntidao ?? []);

  return app;
}
