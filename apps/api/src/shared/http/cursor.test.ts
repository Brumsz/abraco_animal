import { describe, expect, it } from 'vitest';

import { codificarCursor, cursorEsquema } from './cursor.js';

const posicao = {
  criadoEm: new Date('2026-11-14T12:34:56.789Z'),
  publicId: '7d0f6a1e-2b4c-4d5e-8f90-123456789abc',
};

describe('cursor de paginação', () => {
  it('ida e volta preserva a posição (com milissegundos)', () => {
    expect(cursorEsquema.parse(codificarCursor(posicao))).toEqual(posicao);
  });

  it('é seguro para URL (base64url, sem + / =)', () => {
    expect(codificarCursor(posicao)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['lixo', 'nao-e-um-cursor'],
    ['JSON que não é tupla', Buffer.from('{"a":1}').toString('base64url')],
    [
      'id interno no lugar do uuid',
      Buffer.from('["2026-11-14T12:00:00.000Z",42]').toString('base64url'),
    ],
    [
      'data inválida',
      Buffer.from('["ontem","7d0f6a1e-2b4c-4d5e-8f90-123456789abc"]').toString('base64url'),
    ],
  ])('recusa %s', (_nome, valor) => {
    expect(cursorEsquema.safeParse(valor).success).toBe(false);
  });
});
