import { erroValidacao } from '../../../shared/dominio/erros.js';

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

/**
 * Política de senha (ASVS 2.1): 8–128 caracteres, com letra e número.
 * Sem regras de composição exóticas — comprimento importa mais.
 */
export function validarPoliticaSenha(senha: string, campo = 'senha'): void {
  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
    throw erroValidacao(
      'SENHA_FRACA',
      `A senha deve ter entre ${SENHA_MIN} e ${SENHA_MAX} caracteres`,
      campo,
    );
  }
  if (!/\p{L}/u.test(senha) || !/\p{N}/u.test(senha)) {
    throw erroValidacao('SENHA_FRACA', 'A senha deve conter letras e números', campo);
  }
  if (senha.trim().length === 0) {
    throw erroValidacao('SENHA_FRACA', 'A senha não pode ser só espaços', campo);
  }
}
