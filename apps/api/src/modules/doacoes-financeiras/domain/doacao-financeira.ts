/**
 * Regras da doação via Pix.
 *
 *   PENDENTE ──pago (confirmado NO PSP)──▶ CONFIRMADA
 *      │                                     ▲
 *      └──passou do prazo──▶ EXPIRADA ───────┘ pago depois do prazo: o dinheiro
 *                                              entrou, então é aceito
 *
 * O status nunca vem do app (seção 6): só muda depois de reconsultar o PSP.
 */
import type { StatusDoacaoFinanceira } from '@abraco/shared';

import { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';

export const VALOR_MINIMO = Dinheiro.deCentavos(500);
/** Teto por Pix: protege contra erro de digitação e uso do app para lavagem. */
export const VALOR_MAXIMO = Dinheiro.deCentavos(1_000_000);

export function validarValor(texto: string): Dinheiro {
  const valor = Dinheiro.deTexto(texto);
  if (valor.menorQue(VALOR_MINIMO)) {
    throw erroValidacao('VALOR_ABAIXO_DO_MINIMO', 'O valor mínimo é R$ 5,00', 'valor');
  }
  if (VALOR_MAXIMO.menorQue(valor)) {
    throw erroValidacao(
      'VALOR_ACIMA_DO_MAXIMO',
      'O valor máximo por Pix é R$ 10.000,00. Para valores maiores, fale com a ONG.',
      'valor',
    );
  }
  return valor;
}

export interface Doador {
  /** Só para quem doa sem login. */
  readonly nomeDoador: string | null;
  readonly emailDoador: string | null;
}

/**
 * Logado: os dados vêm da conta (o app não manda nome/e-mail).
 * Sem login: nome e e-mail são opcionais (o e-mail serve só para o comprovante).
 */
export function validarDoador(
  logado: boolean,
  entrada: { nomeDoador?: string | undefined; emailDoador?: string | undefined },
): Doador {
  const nome = entrada.nomeDoador?.trim() ?? '';
  const email = entrada.emailDoador?.trim().toLowerCase() ?? '';
  if (logado && (nome || email)) {
    throw erroValidacao(
      'DADOS_DO_DOADOR_INDEVIDOS',
      'Com login, o nome e o e-mail vêm da sua conta',
      nome ? 'nomeDoador' : 'emailDoador',
    );
  }
  if (nome.length > 120)
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Nome longo demais', 'nomeDoador');
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
    throw erroValidacao('EMAIL_INVALIDO', 'E-mail inválido', 'emailDoador');
  }
  return { nomeDoador: nome || null, emailDoador: email || null };
}

/** Status que o app enxerga: PENDENTE vencido aparece como EXPIRADA. */
export function statusEfetivo(
  status: StatusDoacaoFinanceira,
  expiraEm: Date,
  agora: Date,
): StatusDoacaoFinanceira {
  return status === 'PENDENTE' && agora >= expiraEm ? 'EXPIRADA' : status;
}

export const podeConfirmar = (status: StatusDoacaoFinanceira): boolean => status !== 'CONFIRMADA';

/**
 * O PSP diz que foi pago — mas o valor também precisa bater. Valor diferente
 * não confirma: vai para análise manual (registrado no log).
 */
export function exigirValorIgual(esperado: Dinheiro, pago: Dinheiro): void {
  if (!esperado.igual(pago)) {
    throw new ErroDominio(
      'CONFLITO',
      'VALOR_PAGO_DIVERGENTE',
      'O valor pago é diferente do valor da cobrança',
    );
  }
}
