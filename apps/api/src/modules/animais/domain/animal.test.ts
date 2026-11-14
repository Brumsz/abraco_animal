import { STATUS_ANIMAL } from '@abraco/shared';
import { describe, expect, it } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import {
  ehEquipe,
  podeVerAnimal,
  statusDaListagem,
  transicaoManual,
  transicaoParaAdotado,
  validarDadosAnimal,
  validarStatusInicial,
  type DadosAnimal,
} from './animal.js';

const dadosAnimal = (extra: Partial<DadosAnimal> = {}): DadosAnimal => ({
  nome: 'Trovão',
  tipo: 'EQUINO',
  raca: 'Crioulo',
  idadeAprox: 96,
  sexo: 'MACHO',
  porte: 'GRANDE',
  descricao: 'Dócil e brincalhão.',
  historiaResgate: 'Resgatado de uma carroça.',
  vacinado: true,
  castrado: false,
  ...extra,
});

const codigo = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return 'SEM_ERRO';
};

describe('validarDadosAnimal', () => {
  it('normaliza espaços no nome e na raça e apara os textos longos', () => {
    const r = validarDadosAnimal(
      dadosAnimal({
        nome: '  Pé   de  Pano ',
        raca: ' Mangalarga\tMarchador ',
        descricao: '  a\n\nb  ',
      }),
    );
    expect(r.nome).toBe('Pé de Pano');
    expect(r.raca).toBe('Mangalarga Marchador');
    // Quebras de linha da descrição são preservadas.
    expect(r.descricao).toBe('a\n\nb');
  });

  it('recusa campos vazios ou só com espaços', () => {
    expect(codigo(() => validarDadosAnimal(dadosAnimal({ nome: '   ' })))).toBe(
      'CAMPO_OBRIGATORIO',
    );
    expect(codigo(() => validarDadosAnimal(dadosAnimal({ historiaResgate: '' })))).toBe(
      'CAMPO_OBRIGATORIO',
    );
  });

  it('recusa textos acima do limite', () => {
    expect(codigo(() => validarDadosAnimal(dadosAnimal({ nome: 'x'.repeat(81) })))).toBe(
      'CAMPO_MUITO_LONGO',
    );
    expect(codigo(() => validarDadosAnimal(dadosAnimal({ descricao: 'x'.repeat(5001) })))).toBe(
      'CAMPO_MUITO_LONGO',
    );
    expect(codigo(() => validarDadosAnimal(dadosAnimal({ nome: 'x'.repeat(80) })))).toBe(
      'SEM_ERRO',
    );
  });

  it.each([-1, 601, 1.5, Number.NaN])('recusa idade %s', (idadeAprox) => {
    expect(codigo(() => validarDadosAnimal(dadosAnimal({ idadeAprox })))).toBe('IDADE_INVALIDA');
  });

  it.each([0, 600])('aceita idade nos limites (%s meses)', (idadeAprox) => {
    expect(validarDadosAnimal(dadosAnimal({ idadeAprox })).idadeAprox).toBe(idadeAprox);
  });
});

describe('invariantes de status', () => {
  it('um animal novo não pode nascer ADOTADO', () => {
    expect(codigo(() => validarStatusInicial('ADOTADO'))).toBe('STATUS_INICIAL_INVALIDO');
    expect(validarStatusInicial('EM_TRATAMENTO')).toBe('EM_TRATAMENTO');
  });

  it('a troca manual nunca leva a ADOTADO, de nenhum status', () => {
    for (const de of STATUS_ANIMAL) {
      if (de === 'ADOTADO') continue;
      expect(codigo(() => transicaoManual(de, 'ADOTADO'))).toBe('TRANSICAO_STATUS_INVALIDA');
    }
  });

  it('permite as trocas entre DISPONIVEL, EM_TRATAMENTO e INDISPONIVEL', () => {
    expect(transicaoManual('DISPONIVEL', 'EM_TRATAMENTO')).toBe('EM_TRATAMENTO');
    expect(transicaoManual('EM_TRATAMENTO', 'INDISPONIVEL')).toBe('INDISPONIVEL');
    expect(transicaoManual('INDISPONIVEL', 'DISPONIVEL')).toBe('DISPONIVEL');
  });

  it('permite tirar de ADOTADO (devolução à ONG)', () => {
    expect(transicaoManual('ADOTADO', 'DISPONIVEL')).toBe('DISPONIVEL');
    expect(transicaoManual('ADOTADO', 'EM_TRATAMENTO')).toBe('EM_TRATAMENTO');
  });

  it('mesmo status é idempotente (sem mudança)', () => {
    for (const s of STATUS_ANIMAL) expect(transicaoManual(s, s)).toBeNull();
  });

  it('só um animal DISPONIVEL pode ser adotado', () => {
    expect(transicaoParaAdotado('DISPONIVEL')).toBe('ADOTADO');
    for (const s of ['EM_TRATAMENTO', 'ADOTADO', 'INDISPONIVEL'] as const) {
      expect(codigo(() => transicaoParaAdotado(s))).toBe('ANIMAL_NAO_DISPONIVEL');
    }
  });
});

describe('visibilidade', () => {
  it('equipe = ADMIN e VOLUNTARIO', () => {
    expect(ehEquipe('ADMIN')).toBe(true);
    expect(ehEquipe('VOLUNTARIO')).toBe(true);
    expect(ehEquipe('USUARIO')).toBe(false);
    expect(ehEquipe(undefined)).toBe(false);
  });

  it('público não vê INDISPONIVEL no detalhe; equipe vê tudo', () => {
    expect(podeVerAnimal('INDISPONIVEL', undefined)).toBe(false);
    expect(podeVerAnimal('INDISPONIVEL', 'USUARIO')).toBe(false);
    expect(podeVerAnimal('INDISPONIVEL', 'VOLUNTARIO')).toBe(true);
    expect(podeVerAnimal('ADOTADO', undefined)).toBe(true);
    expect(podeVerAnimal('EM_TRATAMENTO', 'USUARIO')).toBe(true);
  });

  it('listagem: público sempre só DISPONIVEL, mesmo pedindo outro status', () => {
    expect(statusDaListagem(undefined, 'INDISPONIVEL')).toEqual(['DISPONIVEL']);
    expect(statusDaListagem('USUARIO', undefined)).toEqual(['DISPONIVEL']);
  });

  it('listagem: equipe vê todos ou filtra por um', () => {
    expect(statusDaListagem('ADMIN', undefined)).toBeUndefined();
    expect(statusDaListagem('ADMIN', 'ADOTADO')).toEqual(['ADOTADO']);
  });
});
