import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';

import {
  configSentry,
  limparEvento,
  limparSpan,
  opcoesSentry,
  redigirTexto,
  type SpanEnviado,
} from './sentry.js';

describe('Sentry: nada de dado pessoal sai da API (seção 6)', () => {
  it('redige e-mail, CPF, JWT e Bearer em textos', () => {
    expect(
      redigirTexto(
        'falhou para karina@abraco.org cpf 123.456.789-09 / 12345678909 Bearer abc.def eyJa.eyJb.c1',
      ),
    ).toBe('falhou para [REDIGIDO] cpf [REDIGIDO] / [REDIGIDO] [REDIGIDO] [REDIGIDO]');
  });

  it('limpa requisição, usuário, variáveis locais, extras e breadcrumbs do console', () => {
    const evento = {
      type: undefined,
      user: { email: 'a@b.org', ip_address: '1.2.3.4' },
      request: {
        method: 'POST',
        url: 'https://api/v1/auth/login?email=a@b.org',
        headers: { authorization: 'Bearer x' },
        data: { senha: '123' },
        cookies: { s: '1' },
        query_string: 'email=a@b.org',
      },
      message: 'erro com a@b.org',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unique constraint failed: cpf 12345678909',
            stacktrace: { frames: [{ function: 'f', vars: { senha: 'x' } }] },
          },
        ],
      },
      breadcrumbs: [
        { category: 'console', message: 'log com cpf' },
        { category: 'http', data: { url: 'https://asaas/v3?token=abc' } },
      ],
      extra: { corpo: { cpf: '1' } },
    } as unknown as ErrorEvent;

    const e = limparEvento(evento);
    expect(e.user).toBeUndefined();
    expect(e.request).toEqual({ method: 'POST', url: 'https://api/v1/auth/login' });
    expect(e.message).toBe('erro com [REDIGIDO]');
    expect(e.exception?.values?.[0]?.value).toBe('Unique constraint failed: cpf [REDIGIDO]');
    expect(e.exception?.values?.[0]?.stacktrace?.frames?.[0]).not.toHaveProperty('vars');
    expect(e.breadcrumbs).toEqual([{ category: 'http', data: { url: 'https://asaas/v3' } }]);
    expect(e.extra).toBeUndefined();
  });

  it('spans: URL sem query e textos redigidos', () => {
    const span = {
      name: 'GET /v1/admin/usuarios?q=karina@abraco.org',
      attributes: {
        'url.full': 'https://api/v1/admin/usuarios?q=karina@abraco.org',
        'url.query': 'q=karina@abraco.org',
        'db.query.text': 'select * from usuarios where email = $1',
        'http.response.status_code': 200,
      },
    } as unknown as SpanEnviado;
    const s = limparSpan(span);
    expect(s.name).toBe('GET /v1/admin/usuarios');
    expect(s.attributes).toEqual({
      'url.full': 'https://api/v1/admin/usuarios',
      'db.query.text': 'select * from usuarios where email = $1',
      'http.response.status_code': 200,
    });
  });

  it('sem SENTRY_DSN fica desligado; taxa de rastreamento entre 0 e 1', () => {
    expect(configSentry({})).toBeNull();
    expect(configSentry({ SENTRY_DSN: '  ' })).toBeNull();
    const c = configSentry({
      SENTRY_DSN: 'https://k@o.ingest.sentry.io/1',
      NODE_ENV: 'production',
      SENTRY_TRACES_SAMPLE_RATE: '7',
    });
    expect(c).toMatchObject({ ambiente: 'production', taxaRastreamento: 1 });
    expect(
      configSentry({ SENTRY_DSN: 'x', SENTRY_TRACES_SAMPLE_RATE: 'abc' })?.taxaRastreamento,
    ).toBe(0.1);
  });

  it('desliga toda a coleta automática de dados', () => {
    const o = opcoesSentry({ dsn: 'x', ambiente: 'test', taxaRastreamento: 0.1 });
    expect(o.includeLocalVariables).toBe(false);
    expect(o.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
    const integracoes = (o.integrations as (p: { name: string }[]) => { name: string }[])([
      { name: 'Http' },
      { name: 'Console' },
      { name: 'LocalVariablesAsync' },
      { name: 'Pino' },
    ]);
    expect(integracoes.map((i) => i.name)).toEqual(['Http']);
  });
});
