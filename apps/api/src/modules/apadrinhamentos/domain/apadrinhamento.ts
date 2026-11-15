/** Regras do apadrinhamento (seção 4 e decisão D6). */
import { STATUS_APADRINHAVEIS, type StatusAnimal } from '@abraco/shared';

import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { acessoNegado, type Ator } from '../../../shared/dominio/permissoes.js';

export const MENSAGEM_MAX = 500;

/** Mensagem opcional que aparece no perfil do animal (pública). */
export function validarMensagem(texto: string | null | undefined): string | null {
  const limpo = texto?.trim() ?? '';
  if (limpo.length > MENSAGEM_MAX) {
    throw erroValidacao(
      'MENSAGEM_LONGA',
      `A mensagem pode ter até ${String(MENSAGEM_MAX)} caracteres`,
      'mensagemPadrinho',
    );
  }
  return limpo.length > 0 ? limpo : null;
}

/** D6: só animais DISPONIVEL (animais em tratamento podem ter restrições específicas). */
export function exigirApadrinhavel(status: StatusAnimal): void {
  if (!STATUS_APADRINHAVEIS.includes(status)) {
    throw new ErroDominio(
      'REGRA_NEGOCIO',
      'ANIMAL_NAO_APADRINHAVEL',
      'Este animal não pode ser apadrinhado no momento',
    );
  }
}

/** Só o próprio padrinho encerra o apadrinhamento. */
export function exigirPadrinho(ator: Ator, padrinhoId: string | null): void {
  if (padrinhoId === null || padrinhoId !== ator.id) throw acessoNegado();
}

/** A lista pública de padrinhos mostra só o primeiro nome (minimização, LGPD). */
export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? '';
