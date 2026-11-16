import { createHash } from 'node:crypto';

import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
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
import { rotasAdocoes, type DependenciasRotasAdocoes } from './modules/adocoes/http/rotas.js';
import { rotasAnimais, type DependenciasRotasAnimais } from './modules/animais/http/rotas.js';
import { rotasAuth, type DependenciasRotasAuth } from './modules/auth/http/rotas.js';
import {
  rotasDoacoesAnimais,
  type DependenciasRotasDoacoesAnimais,
} from './modules/doacoes-animais/http/rotas.js';
import { rotasPix, type DependenciasRotasPix } from './modules/doacoes-financeiras/http/rotas.js';
import { rotasChat, type DependenciasRotasChat } from './modules/chat/http/rotas.js';
import { rotasAdmin, type DependenciasRotasAdmin } from './modules/admin/http/rotas.js';
import { rotaWebsocketChat, type DependenciasWebsocket } from './modules/chat/http/websocket.js';
import { rotasFeed, type DependenciasRotasFeed } from './modules/feed/http/rotas.js';
import { rotasNoticias, type DependenciasRotasNoticias } from './modules/noticias/http/rotas.js';
import {
  rotasApadrinhamentos,
  type DependenciasRotasApadrinhamentos,
} from './modules/apadrinhamentos/http/rotas.js';
import {
  rotasInstitucional,
  type DependenciasRotasInstitucional,
} from './modules/institucional/http/rotas.js';
import {
  rotasVoluntariado,
  type DependenciasRotasVoluntariado,
} from './modules/voluntariado/http/rotas.js';
import {
  rotasNotificacoes,
  type DependenciasRotasNotificacoes,
} from './modules/notificacoes/http/rotas.js';
import { registrarTratadorErros } from './shared/http/tratador-erros.js';

export interface OpcoesApp {
  readonly logger?: FastifyServerOptions['logger'];
  readonly verificacoesProntidao?: readonly VerificacaoProntidao[];
  /** Origens permitidas no CORS. Vazio = nenhuma (o app nativo não usa CORS). */
  readonly corsOrigens?: readonly string[];
  /** Redis para o rate limit global; sem ele, usa memória (só em testes). */
  readonly redis?: Redis;
  readonly auth?: DependenciasRotasAuth;
  readonly animais?: DependenciasRotasAnimais;
  readonly adocoes?: DependenciasRotasAdocoes;
  readonly doacoesAnimais?: DependenciasRotasDoacoesAnimais;
  readonly pix?: DependenciasRotasPix;
  readonly apadrinhamentos?: DependenciasRotasApadrinhamentos;
  readonly voluntariado?: DependenciasRotasVoluntariado;
  readonly institucional?: DependenciasRotasInstitucional;
  readonly feed?: DependenciasRotasFeed;
  readonly admin?: DependenciasRotasAdmin;
  readonly noticias?: DependenciasRotasNoticias;
  readonly chat?: { rotas: DependenciasRotasChat; websocket: DependenciasWebsocket };
  readonly notificacoes?: DependenciasRotasNotificacoes;
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
    // `ip` pode faltar sem socket de rede (ex.: upgrade de WebSocket injetado em teste).
    keyGenerator: (request) =>
      createHash('sha256')
        .update((request.ip as string | undefined) ?? 'sem-ip')
        .digest('hex')
        .slice(0, 32),
    ...(opcoes.redis ? { redis: opcoes.redis } : {}),
    // Health checks do orquestrador e webhooks do PSP (autenticados por token e
    // deduplicados) não contam no limite por IP: rajadas do Asaas não podem virar 429.
    allowList: (request) =>
      request.url.startsWith('/health/') || request.url.startsWith('/v1/webhooks/'),
  });

  // Rotas entram depois dos plugins acima para herdar os hooks deles.
  void app.register(async (instancia) => {
    registrarRotasHealth(instancia, opcoes.verificacoesProntidao ?? []);
    await Promise.resolve();
  });

  if (opcoes.auth) {
    void app.register(rotasAuth(opcoes.auth), { prefix: '/v1' });
  }
  if (opcoes.animais) {
    void app.register(rotasAnimais(opcoes.animais), { prefix: '/v1' });
  }
  if (opcoes.adocoes) {
    void app.register(rotasAdocoes(opcoes.adocoes), { prefix: '/v1' });
  }
  if (opcoes.doacoesAnimais) {
    void app.register(rotasDoacoesAnimais(opcoes.doacoesAnimais), { prefix: '/v1' });
  }
  if (opcoes.pix) {
    void app.register(rotasPix(opcoes.pix), { prefix: '/v1' });
  }
  if (opcoes.apadrinhamentos) {
    void app.register(rotasApadrinhamentos(opcoes.apadrinhamentos), { prefix: '/v1' });
  }
  if (opcoes.voluntariado) {
    void app.register(rotasVoluntariado(opcoes.voluntariado), { prefix: '/v1' });
  }
  if (opcoes.institucional) {
    void app.register(rotasInstitucional(opcoes.institucional), { prefix: '/v1' });
  }
  if (opcoes.admin) {
    void app.register(rotasAdmin(opcoes.admin), { prefix: '/v1/admin' });
  }
  if (opcoes.feed) {
    void app.register(rotasFeed(opcoes.feed), { prefix: '/v1' });
  }
  if (opcoes.noticias) {
    void app.register(rotasNoticias(opcoes.noticias), { prefix: '/v1' });
  }
  if (opcoes.chat) {
    // Na raiz: o plugin decora a instância principal (inclusive app.injectWS dos testes).
    void app.register(websocket, { options: { maxPayload: 4096 } });
    void app.register(rotasChat(opcoes.chat.rotas), { prefix: '/v1' });
    void app.register(rotaWebsocketChat(opcoes.chat.websocket), { prefix: '/v1' });
  }
  if (opcoes.notificacoes) {
    void app.register(rotasNotificacoes(opcoes.notificacoes), { prefix: '/v1' });
  }

  return app;
}
