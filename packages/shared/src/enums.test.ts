import { describe, expect, it } from 'vitest';

import { STATUS_ANIMAL, STATUS_APADRINHAVEIS, TIPOS_ANIMAL } from './enums.js';

describe('enums compartilhados', () => {
  it('TipoAnimal inclui OUTRO (seção 3)', () => {
    expect(TIPOS_ANIMAL).toContain('OUTRO');
  });

  it('apenas animais DISPONIVEL são apadrinháveis (decisão D6)', () => {
    expect(STATUS_APADRINHAVEIS).toEqual(['DISPONIVEL']);
    expect(STATUS_APADRINHAVEIS).not.toContain('EM_TRATAMENTO');
    for (const status of STATUS_APADRINHAVEIS) expect(STATUS_ANIMAL).toContain(status);
  });
});
