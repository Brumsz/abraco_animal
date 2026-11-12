import { describe, expect, it } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { Cpf } from './cpf.js';
import { Email } from './email.js';
import { dataDeNascimento, garantirIdadeMinima, idadeEmAnos } from './idade.js';
import { validarPoliticaSenha } from './senha.js';
import { Telefone } from './telefone.js';

function codigoDoErro(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return undefined;
}

describe('Cpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita CPF válido %s', (cpf) => {
    expect(Cpf.criar(cpf).digitos).toMatch(/^\d{11}$/);
  });

  it.each([
    ['dígito verificador errado', '529.982.247-24'],
    ['sequência repetida', '111.111.111-11'],
    ['zeros', '000.000.000-00'],
    ['curto', '1234567890'],
    ['longo', '123456789012'],
    ['vazio', ''],
  ])('rejeita CPF com %s', (_, cpf) => {
    expect(codigoDoErro(() => Cpf.criar(cpf))).toBe('CPF_INVALIDO');
  });

  it('formata e mascara', () => {
    const cpf = Cpf.criar('52998224725');
    expect(cpf.formatado()).toBe('529.982.247-25');
    expect(cpf.mascarado()).toBe('***.982.247-**');
  });

  it('o erro informa o campo para o formulário', () => {
    try {
      Cpf.criar('123');
    } catch (e) {
      expect((e as ErroDominio).campo).toBe('cpf');
    }
  });
});

describe('Email', () => {
  it('normaliza para minúsculas e remove espaços', () => {
    expect(Email.criar('  Karina@Abraco.ORG ').valor).toBe('karina@abraco.org');
  });

  it.each(['karina', 'karina@', '@abraco.org', 'karina@abraco', 'ka rina@abraco.org'])(
    'rejeita %s',
    (email) => {
      expect(codigoDoErro(() => Email.criar(email))).toBe('EMAIL_INVALIDO');
    },
  );

  it('mascara para logs', () => {
    expect(Email.criar('karina@abraco.org').mascarado()).toBe('k****@abraco.org');
  });
});

describe('Telefone', () => {
  it.each(['(11) 98765-4321', '11987654321', '1132345678'])('aceita %s', (tel) => {
    expect(() => Telefone.criar(tel)).not.toThrow();
  });

  it.each([
    ['DDD inválido', '00987654321'],
    ['celular sem 9', '11887654321'],
    ['curto', '119876543'],
  ])('rejeita %s', (_, tel) => {
    expect(codigoDoErro(() => Telefone.criar(tel))).toBe('TELEFONE_INVALIDO');
  });
});

describe('política de senha', () => {
  it('aceita senha com letras e números', () => {
    expect(() => {
      validarPoliticaSenha('cavalo123');
    }).not.toThrow();
  });

  it.each([
    ['curta', 'abc123'],
    ['sem número', 'somenteletras'],
    ['sem letra', '1234567890'],
    ['longa demais', `a1${'x'.repeat(127)}`],
  ])('rejeita senha %s', (_, senha) => {
    expect(
      codigoDoErro(() => {
        validarPoliticaSenha(senha);
      }),
    ).toBe('SENHA_FRACA');
  });
});

describe('idade', () => {
  const hoje = new Date(Date.UTC(2026, 10, 11)); // 11/11/2026

  it('calcula considerando se já fez aniversário no ano', () => {
    expect(idadeEmAnos(dataDeNascimento('2008-11-11'), hoje)).toBe(18);
    expect(idadeEmAnos(dataDeNascimento('2008-11-12'), hoje)).toBe(17);
  });

  it('aceita quem faz 18 hoje e rejeita quem faz amanhã (regra D7)', () => {
    expect(() => {
      garantirIdadeMinima(dataDeNascimento('2008-11-11'), hoje);
    }).not.toThrow();
    expect(
      codigoDoErro(() => {
        garantirIdadeMinima(dataDeNascimento('2008-11-12'), hoje);
      }),
    ).toBe('IDADE_MINIMA');
  });

  it('rejeita data no futuro', () => {
    expect(
      codigoDoErro(() => {
        garantirIdadeMinima(dataDeNascimento('2030-01-01'), hoje);
      }),
    ).toBe('DATA_INVALIDA');
  });

  it.each(['2001-02-30', '2001-13-01', '11/11/2000', ''])('rejeita data inexistente %j', (d) => {
    expect(codigoDoErro(() => dataDeNascimento(d))).toBe('DATA_INVALIDA');
  });
});
