import { afterEach, describe, expect, it } from 'vitest';

import { construirApp } from './app.js';
import { type VerificacaoProntidao } from './http/health.js';

const ok = (nome: string): VerificacaoProntidao => ({ nome, verificar: () => Promise.resolve() });
const falha = (nome: string): VerificacaoProntidao => ({
  nome,
  verificar: () => Promise.reject(new Error('conexão recusada em 10.0.0.5:5432')),
});

describe('health checks', () => {
  let app: ReturnType<typeof construirApp> | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /health/live responde 200', async () => {
    app = construirApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready responde 200 quando todas as dependências estão ok', async () => {
    app = construirApp({ verificacoesProntidao: [ok('postgres'), ok('redis')] });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', dependencias: { postgres: 'ok', redis: 'ok' } });
  });

  it('envia cabeçalhos de segurança (helmet + HSTS de 1 ano)', async () => {
    app = construirApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });

    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('rota inexistente responde 404 em problem+json', async () => {
    app = construirApp();
    const res = await app.inject({ method: 'GET', url: '/nao-existe' });

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('GET /health/ready responde 503 e não vaza o motivo da falha', async () => {
    app = construirApp({ verificacoesProntidao: [ok('postgres'), falha('redis')] });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'indisponivel',
      dependencias: { postgres: 'ok', redis: 'falha' },
    });
    expect(res.body).not.toContain('10.0.0.5');
  });
});
