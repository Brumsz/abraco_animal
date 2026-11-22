import { problemaSenha, SENHA_MAX, SENHA_MIN } from '@abraco/shared';

import { erroValidacao } from '../../../shared/dominio/erros.js';

export { SENHA_MAX, SENHA_MIN };

/** Política de senha (ASVS 2.1; regra em @abraco/shared, a mesma do app). */
export function validarPoliticaSenha(senha: string, campo = 'senha'): void {
  const problema = problemaSenha(senha);
  if (problema) throw erroValidacao('SENHA_FRACA', problema, campo);
}
