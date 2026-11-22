import { describe, expect, it } from 'vitest';

import {
  cpfValido,
  idadeEmAnos,
  lerDataIso,
  maiorDeIdade,
  problemaSenha,
  telefoneValido,
} from './validacoes.js';

describe('validações compartilhadas (API e app)', () => {
  it('CPF: confere os dígitos e recusa sequências repetidas', () => {
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('5299822472')).toBe(false);
  });

  it('telefone: DDD válido + fixo (8) ou celular (9 começando com 9)', () => {
    expect(telefoneValido('11987654321')).toBe(true);
    expect(telefoneValido('1134567890')).toBe(true);
    expect(telefoneValido('11887654321')).toBe(false);
    expect(telefoneValido('0934567890')).toBe(false);
  });

  it('senha: 8–128, com letra e número', () => {
    expect(problemaSenha('cavalos2026')).toBeNull();
    expect(problemaSenha('curta1')).toMatch(/entre 8 e 128/);
    expect(problemaSenha('somenteletras')).toBe('A senha deve conter letras e números');
  });

  it('data ISO: recusa datas inexistentes', () => {
    expect(lerDataIso('1990-03-15')?.toISOString()).toBe('1990-03-15T00:00:00.000Z');
    expect(lerDataIso('2001-02-30')).toBeNull();
    expect(lerDataIso('15/03/1990')).toBeNull();
  });

  it('idade mínima de 18, contando o dia do aniversário', () => {
    const hoje = new Date('2026-11-22T12:00:00Z');
    expect(idadeEmAnos(new Date('2008-11-22T00:00:00Z'), hoje)).toBe(18);
    expect(maiorDeIdade(new Date('2008-11-22T00:00:00Z'), hoje)).toBe(true);
    expect(maiorDeIdade(new Date('2008-11-23T00:00:00Z'), hoje)).toBe(false);
    expect(maiorDeIdade(new Date('2030-01-01T00:00:00Z'), hoje)).toBe(false);
  });
});
