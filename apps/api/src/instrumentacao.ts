/**
 * Carregado ANTES do resto da API (`node --import ./dist/instrumentacao.js`):
 * a instrumentação OpenTelemetry precisa entrar antes de fastify, pg e ioredis
 * serem importados. Sem SENTRY_DSN não faz nada.
 */
import * as Sentry from '@sentry/node';

import { configSentry, opcoesSentry } from './observabilidade/sentry.js';

const config = configSentry(process.env);
if (config) Sentry.init(opcoesSentry(config));
