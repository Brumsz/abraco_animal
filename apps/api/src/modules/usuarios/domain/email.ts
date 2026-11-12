import { erroValidacao } from '../../../shared/dominio/erros.js';

// Validação pragmática (RFC 5322 completa aceita formatos que nenhum provedor usa).
const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Email {
  private constructor(readonly valor: string) {}

  static criar(entrada: string): Email {
    const valor = entrada.trim().toLowerCase();
    if (valor.length > 254 || !FORMATO.test(valor)) {
      throw erroValidacao('EMAIL_INVALIDO', 'E-mail inválido', 'email');
    }
    return new Email(valor);
  }

  /** k****@abraco.org — para logs (a spec proíbe e-mail completo em log). */
  mascarado(): string {
    const [local = '', dominio = ''] = this.valor.split('@');
    return `${local.slice(0, 1)}****@${dominio}`;
  }
}
