/**
 * Quem executa um caso de uso. Seção 5: a role é validada no caso de uso, não
 * só no guard da rota — um caso de uso chamado por outro caminho (fila, script,
 * outra rota) continua protegido.
 */
import type { Role } from '@abraco/shared';

import { ErroDominio } from './erros.js';

export interface Ator {
  /** publicId do usuário (claim `sub`). */
  readonly id: string;
  readonly role: Role;
}

export const acessoNegado = () =>
  new ErroDominio('PROIBIDO', 'ACESSO_NEGADO', 'Você não tem permissão para isso');

export function exigirRole(ator: Ator, ...roles: readonly Role[]): void {
  if (!roles.includes(ator.role)) throw acessoNegado();
}

export const exigirAdmin = (ator: Ator): void => {
  exigirRole(ator, 'ADMIN');
};
