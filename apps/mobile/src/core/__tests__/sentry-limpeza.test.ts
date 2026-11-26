import { limparEventoApp, redigir } from '../sentry-limpeza';

describe('Sentry do app: nada de dado pessoal', () => {
  it('redige e-mail, CPF, JWT, Bearer e token de push', () => {
    expect(
      redigir('karina@abraco.org 123.456.789-09 eyJa.eyJb.c Bearer xyz ExponentPushToken[abc]'),
    ).toBe('[REDIGIDO] [REDIGIDO] [REDIGIDO] [REDIGIDO] [REDIGIDO]');
  });

  it('limpa usuário, extras, requisição e breadcrumbs do console', () => {
    const e = limparEventoApp({
      user: { email: 'a@b.org' },
      extra: { cpf: '1' },
      message: 'falhou para a@b.org',
      request: { url: 'https://api/v1/x?email=a@b.org', method: 'GET', headers: { a: '1' } },
      exception: { values: [{ value: 'cpf 12345678909' }] },
      breadcrumbs: [
        { category: 'console', message: 'log' },
        { category: 'fetch', data: { url: 'https://api/v1/me?x=1' } },
      ],
    });
    expect(e).toEqual({
      message: 'falhou para [REDIGIDO]',
      request: { method: 'GET', url: 'https://api/v1/x' },
      exception: { values: [{ value: 'cpf [REDIGIDO]' }] },
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://api/v1/me' } }],
    });
  });
});
