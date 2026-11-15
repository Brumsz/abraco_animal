import { describe, expect, it } from 'vitest';

import { Dinheiro } from './dinheiro.js';

describe('Dinheiro (value object)', () => {
  it('lê e escreve o formato de transporte "50.00" em centavos inteiros', () => {
    expect(Dinheiro.deTexto('50.00').centavos).toBe(5000);
    expect(Dinheiro.deTexto('0.07').centavos).toBe(7);
    expect(Dinheiro.deTexto('12345678.99').paraTexto()).toBe('12345678.99');
    expect(Dinheiro.deCentavos(5).paraTexto()).toBe('0.05');
  });

  it.each([
    '50',
    '50.0',
    '50,00',
    '-5.00',
    '1.000.00',
    ' 5.00',
    '5.001',
    'abc',
    '',
    '123456789.00',
  ])('recusa "%s"', (texto) => {
    expect(() => Dinheiro.deTexto(texto)).toThrow();
  });

  it('valor do PSP em reais: arredonda para o centavo, sem erro de ponto flutuante', () => {
    expect(Dinheiro.deReais(0.1 + 0.2).centavos).toBe(30);
    expect(Dinheiro.deReais(50).igual(Dinheiro.deTexto('50.00'))).toBe(true);
    expect(Dinheiro.deReais(19.99).paraReais()).toBe(19.99);
    expect(() => Dinheiro.deReais(Number.NaN)).toThrow();
    expect(() => Dinheiro.deReais(-1)).toThrow();
  });

  it('comparações e formatação em reais', () => {
    expect(Dinheiro.deTexto('4.99').menorQue(Dinheiro.deTexto('5.00'))).toBe(true);
    expect(Dinheiro.deTexto('5.00').menorQue(Dinheiro.deTexto('5.00'))).toBe(false);
    expect(Dinheiro.deTexto('1234.50').formatado().replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });

  it('centavos inválidos', () => {
    expect(() => Dinheiro.deCentavos(1.5)).toThrow();
    expect(() => Dinheiro.deCentavos(-1)).toThrow();
  });
});
