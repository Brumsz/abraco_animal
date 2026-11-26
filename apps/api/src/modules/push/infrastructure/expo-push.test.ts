import { describe, expect, it } from 'vitest';

import { EnviadorExpo, lerTickets } from './expo-push.js';

const mensagem = {
  to: 'ExponentPushToken[abcdefghij12]',
  title: 'Adoção aprovada!',
  body: 'Seu pedido foi aprovado.',
  data: { notificacaoId: 'n1', tipo: 'ADOCAO_APROVADA', entidadeId: null },
};

describe('Expo Push', () => {
  it('lê os tickets: ok, aparelho que não existe mais e erro genérico', () => {
    expect(
      lerTickets(
        {
          data: [
            { status: 'ok', id: 'x' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'error', details: { error: 'MessageRateExceeded' } },
          ],
        },
        3,
      ),
    ).toEqual([
      { ok: true },
      { ok: false, aparelhoInvalido: true },
      { ok: false, aparelhoInvalido: false },
    ]);
  });

  it('resposta fora do formato: tudo falha, nenhum token é apagado', () => {
    expect(lerTickets({ errors: [{ code: 'X' }] }, 2)).toEqual([
      { ok: false, aparelhoInvalido: false },
      { ok: false, aparelhoInvalido: false },
    ]);
  });

  it('manda o token de acesso só quando configurado e falha com status de erro', async () => {
    const pedidos: RequestInit[] = [];
    const http = ((_url: string, init: RequestInit) => {
      pedidos.push(init);
      return Promise.resolve(new Response(JSON.stringify({ data: [{ status: 'ok' }] })));
    }) as typeof fetch;
    await new EnviadorExpo('segredo', http).enviar([mensagem]);
    await new EnviadorExpo(undefined, http).enviar([mensagem]);
    expect((pedidos[0]?.headers as Record<string, string>)['authorization']).toBe('Bearer segredo');
    expect(pedidos[1]?.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(pedidos[0]?.body as string)).toEqual([
      { ...mensagem, sound: 'default', channelId: 'padrao', priority: 'high' },
    ]);

    const fora = (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch;
    await expect(new EnviadorExpo(undefined, fora).enviar([mensagem])).rejects.toThrow('503');
  });
});
