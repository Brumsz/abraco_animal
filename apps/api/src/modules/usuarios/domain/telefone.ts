import { telefoneValido } from '@abraco/shared';

import { erroValidacao } from '../../../shared/dominio/erros.js';

/** Telefone brasileiro (regra em @abraco/shared). */
export class Telefone {
  private constructor(readonly digitos: string) {}

  static criar(entrada: string): Telefone {
    const digitos = entrada.replace(/\D/g, '');
    if (!telefoneValido(digitos))
      throw erroValidacao('TELEFONE_INVALIDO', 'Telefone inválido', 'telefone');
    return new Telefone(digitos);
  }
}
