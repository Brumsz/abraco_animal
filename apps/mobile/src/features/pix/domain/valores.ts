/**
 * Valores do Pix. Tudo em CENTAVOS inteiros (nunca float para dinheiro); a API
 * recebe o texto "25.00" e decide com as mesmas regras (mínimo R$ 5, máximo R$ 10.000).
 */
export const VALORES_SUGERIDOS_CENTAVOS = [1000, 2500, 5000, 10000] as const;
export const VALOR_MINIMO_CENTAVOS = 500;
export const VALOR_MAXIMO_CENTAVOS = 1_000_000;

/** 2500 → "R$ 25,00"; com `curto`, "R$ 25" quando não há centavos (chips). */
export function formatarReais(centavos: number, { curto = false } = {}): string {
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (curto && cents === 0) return `R$ ${milhar}`;
  return `R$ ${milhar},${String(cents).padStart(2, '0')}`;
}

/** Corpo da API: 2500 → "25.00". */
export function paraTextoApi(centavos: number): string {
  return `${String(Math.floor(centavos / 100))}.${String(centavos % 100).padStart(2, '0')}`;
}

/**
 * Campo "Outro" com máscara de dinheiro: os dígitos digitados entram pela direita
 * ("5" → 5 centavos, "500" → R$ 5,00). Devolve centavos (0 se vazio).
 */
export function centavosDoCampo(texto: string): number {
  const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
  return digitos ? Number(digitos) : 0;
}

/** Mensagem de validação do valor, ou null se estiver dentro das regras. */
export function problemaValor(centavos: number): string | null {
  if (centavos < VALOR_MINIMO_CENTAVOS) return 'O valor mínimo é R$ 5,00';
  if (centavos > VALOR_MAXIMO_CENTAVOS) return 'O valor máximo por Pix é R$ 10.000,00';
  return null;
}

/** Segundos restantes → "29:45" (nunca negativo). */
export function formatarContagem(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Valor da API ("25.00") → centavos (2500), sem passar por float. */
export function centavosDaApi(texto: string): number {
  const [reais = '0', cents = '0'] = texto.split('.');
  return Number(reais) * 100 + Number(cents.padEnd(2, '0').slice(0, 2));
}
