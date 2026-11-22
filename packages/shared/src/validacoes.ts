/**
 * Regras de validação puras, usadas pela API (que decide) e pelo app (que avisa
 * antes de enviar). Ficam aqui para as duas pontas nunca divergirem.
 */
import { IDADE_MINIMA_CADASTRO } from './enums.js';

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

/** CPF com dígitos verificadores corretos (recebe só os 11 dígitos). */
export function cpfValido(digitos: string): boolean {
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

/** Telefone brasileiro: DDD (11–99) + 8 dígitos (fixo) ou 9 começando com 9 (celular). */
export function telefoneValido(digitos: string): boolean {
  const ddd = Number(digitos.slice(0, 2));
  const numero = digitos.slice(2);
  return ddd >= 11 && ddd <= 99 && (/^[2-5]\d{7}$/.test(numero) || /^9\d{8}$/.test(numero));
}

/**
 * Política de senha (ASVS 2.1): 8–128 caracteres, com letra e número.
 * Devolve a mensagem do problema ou `null` se a senha é aceita.
 */
export function problemaSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
    return `A senha deve ter entre ${String(SENHA_MIN)} e ${String(SENHA_MAX)} caracteres`;
  }
  if (!/\p{L}/u.test(senha) || !/\p{N}/u.test(senha)) return 'A senha deve conter letras e números';
  if (senha.trim().length === 0) return 'A senha não pode ser só espaços';
  return null;
}

/** "AAAA-MM-DD" → data UTC; `null` para formato errado ou data inexistente (2001-02-30). */
export function lerDataIso(entrada: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entrada);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const confere =
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return confere ? data : null;
}

export function idadeEmAnos(nascimento: Date, hoje: Date): number {
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const aindaNaoFezAniversario =
    hoje.getUTCMonth() < nascimento.getUTCMonth() ||
    (hoje.getUTCMonth() === nascimento.getUTCMonth() &&
      hoje.getUTCDate() < nascimento.getUTCDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

export function maiorDeIdade(nascimento: Date, hoje: Date): boolean {
  return nascimento <= hoje && idadeEmAnos(nascimento, hoje) >= IDADE_MINIMA_CADASTRO;
}
