import { describe, expect, it } from 'vitest';

import {
  STATUS_ANIMAL,
  STATUS_APADRINHAVEIS,
  STATUS_VISIVEIS_PUBLICO,
  TIPOS_ANIMAL,
  UPLOAD_IMAGENS,
} from './enums.js';

describe('enums compartilhados', () => {
  it('TipoAnimal inclui OUTRO (seção 3)', () => {
    expect(TIPOS_ANIMAL).toContain('OUTRO');
  });

  it('apenas animais DISPONIVEL são apadrinháveis (decisão D6)', () => {
    expect(STATUS_APADRINHAVEIS).toEqual(['DISPONIVEL']);
    expect(STATUS_APADRINHAVEIS).not.toContain('EM_TRATAMENTO');
    for (const status of STATUS_APADRINHAVEIS) expect(STATUS_ANIMAL).toContain(status);
  });

  it('INDISPONIVEL nunca é visível ao público', () => {
    expect(STATUS_VISIVEIS_PUBLICO).not.toContain('INDISPONIVEL');
  });

  it('limites de upload da seção 6: 5 MB e 10 arquivos', () => {
    expect(UPLOAD_IMAGENS).toEqual({
      tamanhoMaximoBytes: 5 * 1024 * 1024,
      arquivosPorEnvio: 10,
      fotosPorAnimal: 10,
    });
  });
});
