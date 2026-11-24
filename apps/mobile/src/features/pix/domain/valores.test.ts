import { idadeTexto } from '@/features/animais/domain/rotulos';

import {
  centavosDoCampo,
  formatarContagem,
  formatarReais,
  paraTextoApi,
  problemaValor,
} from './valores';

describe('valores do Pix', () => {
  it('formata reais sem float', () => {
    expect(formatarReais(2500)).toBe('R$ 25,00');
    expect(formatarReais(2500, { curto: true })).toBe('R$ 25');
    expect(formatarReais(1_000_000)).toBe('R$ 10.000,00');
    expect(formatarReais(1999, { curto: true })).toBe('R$ 19,99');
  });

  it('converte para o texto da API', () => {
    expect(paraTextoApi(2500)).toBe('25.00');
    expect(paraTextoApi(505)).toBe('5.05');
  });

  it('campo "Outro" lê os dígitos pela direita', () => {
    expect(centavosDoCampo('')).toBe(0);
    expect(centavosDoCampo('R$ 0,05')).toBe(5);
    expect(centavosDoCampo('R$ 15,00')).toBe(1500);
    expect(centavosDoCampo('9999999999999')).toBe(999_999_999);
  });

  it('valida mínimo e máximo como a API', () => {
    expect(problemaValor(499)).toMatch(/mínimo/);
    expect(problemaValor(500)).toBeNull();
    expect(problemaValor(1_000_000)).toBeNull();
    expect(problemaValor(1_000_001)).toMatch(/máximo/);
  });

  it('contagem regressiva mm:ss nunca negativa', () => {
    expect(formatarContagem(1785)).toBe('29:45');
    expect(formatarContagem(-3)).toBe('00:00');
  });
});

describe('idade do animal', () => {
  it.each([
    [0, 'Menos de 1 mês'],
    [1, '1 mês'],
    [8, '8 meses'],
    [12, '1 ano'],
    [30, '2 anos e 6 meses'],
    [13, '1 ano e 1 mês'],
  ])('%i meses → %s', (meses, texto) => {
    expect(idadeTexto(meses)).toBe(texto);
  });
});
