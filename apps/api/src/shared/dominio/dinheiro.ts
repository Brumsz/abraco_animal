/**
 * Valor em reais guardado em CENTAVOS inteiros: 0,1 + 0,2 em ponto flutuante
 * não é 0,3, e dinheiro não pode ter esse tipo de erro.
 */
import { erroValidacao } from './erros.js';

const FORMATO = /^(\d{1,8})\.(\d{2})$/;

export class Dinheiro {
  private constructor(readonly centavos: number) {}

  static deCentavos(centavos: number): Dinheiro {
    if (!Number.isSafeInteger(centavos) || centavos < 0) {
      throw erroValidacao('VALOR_INVALIDO', 'Valor inválido', 'valor');
    }
    return new Dinheiro(centavos);
  }

  /** "50.00" → R$ 50,00. Exatamente duas casas, sem sinal, sem separador de milhar. */
  static deTexto(texto: string): Dinheiro {
    const m = FORMATO.exec(texto);
    if (!m) throw erroValidacao('VALOR_INVALIDO', 'Use o formato 50.00', 'valor');
    return new Dinheiro(Number(m[1]) * 100 + Number(m[2]));
  }

  /** Valor numérico vindo de um PSP (ex.: 50 ou 50.5): arredonda para o centavo. */
  static deReais(reais: number): Dinheiro {
    if (!Number.isFinite(reais) || reais < 0) {
      throw erroValidacao('VALOR_INVALIDO', 'Valor inválido', 'valor');
    }
    return new Dinheiro(Math.round(reais * 100));
  }

  /** "50.00" (formato de transporte e do Decimal do banco). */
  paraTexto(): string {
    const reais = Math.trunc(this.centavos / 100);
    const centavos = String(this.centavos % 100).padStart(2, '0');
    return `${String(reais)}.${centavos}`;
  }

  /** Para APIs que esperam número em reais (o Asaas). */
  paraReais(): number {
    return this.centavos / 100;
  }

  /** "R$ 1.234,56" para e-mails. */
  formatado(): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      this.paraReais(),
    );
  }

  igual(outro: Dinheiro): boolean {
    return this.centavos === outro.centavos;
  }

  menorQue(outro: Dinheiro): boolean {
    return this.centavos < outro.centavos;
  }
}
