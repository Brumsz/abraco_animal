import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validarDadosAnimal } from '../modules/animais/domain/animal.js';
import { ANIMAIS_EXEMPLO, POSTS_EXEMPLO } from './dados-exemplo.js';
import { PASTA_SEMENTE } from './infra-script.js';

describe('dados de exemplo', () => {
  it('todos os animais passam pela validação do domínio', () => {
    for (const a of ANIMAIS_EXEMPLO) {
      expect(() => validarDadosAnimal(a.dados)).not.toThrow();
    }
  });

  it('cobre os filtros da tela Adotar (equinos, caninos e bovinos)', () => {
    const tipos = new Set(ANIMAIS_EXEMPLO.map((a) => a.dados.tipo));
    expect([...tipos].sort()).toEqual(['BOVINO', 'CANINO', 'EQUINO']);
  });

  it('todas as fotos citadas existem na pasta semente', () => {
    const fotos = [...ANIMAIS_EXEMPLO.map((a) => a.foto), ...POSTS_EXEMPLO.flatMap((p) => p.fotos)];
    for (const f of fotos) expect(existsSync(join(PASTA_SEMENTE, f))).toBe(true);
  });
});
