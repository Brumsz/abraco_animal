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
    if (!/^\d{11}$/.test(digitos)) return false;
    // Sequências repetidas (000…, 111…) passam no cálculo mas não são CPFs reais.
    if (/^(\d)\1{10}$/.test(digitos)) return false;
    const numeros = Array.from(digitos, Number);
    const dv = (quantidade: number) => {
      let soma = 0;
      for (let i = 0; i < quantidade; i++) soma += (numeros[i] ?? 0) * (quantidade + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return dv(9) === numeros[9] && dv(10) === numeros[10];
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
