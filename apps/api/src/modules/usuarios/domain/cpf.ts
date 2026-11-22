import { cpfValido } from '@abraco/shared';

import { erroValidacao } from '../../../shared/dominio/erros.js';

/** CPF válido (dígitos verificadores conferidos). Guarda só os 11 dígitos. */
export class Cpf {
  private constructor(readonly digitos: string) {}

  static criar(entrada: string): Cpf {
    const digitos = entrada.replace(/\D/g, '');
    if (!Cpf.valido(digitos)) throw erroValidacao('CPF_INVALIDO', 'CPF inválido', 'cpf');
    return new Cpf(digitos);
  }

  static valido(digitos: string): boolean {
    return cpfValido(digitos);
  }

  /** 123.456.789-09 */
  formatado(): string {
    return this.digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  /** ***.456.789-** — único formato exibível fora da exportação LGPD. */
  mascarado(): string {
    return `***.${this.digitos.slice(3, 6)}.${this.digitos.slice(6, 9)}-**`;
  }
}
