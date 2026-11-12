import { erroValidacao } from '../../../shared/dominio/erros.js';

/** Telefone brasileiro: DDD (11–99) + 8 dígitos (fixo) ou 9 começando com 9 (celular). */
export class Telefone {
  private constructor(readonly digitos: string) {}

  static criar(entrada: string): Telefone {
    const digitos = entrada.replace(/\D/g, '');
    const ddd = Number(digitos.slice(0, 2));
    const numero = digitos.slice(2);
    const valido =
      ddd >= 11 && ddd <= 99 && (/^[2-5]\d{7}$/.test(numero) || /^9\d{8}$/.test(numero));
    if (!valido) throw erroValidacao('TELEFONE_INVALIDO', 'Telefone inválido', 'telefone');
    return new Telefone(digitos);
  }
}
