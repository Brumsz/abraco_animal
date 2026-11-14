/**
 * Notificação do sino do app. É gravada pelo repositório que faz a alteração,
 * na MESMA transação: se a adoção foi aprovada, a notificação existe.
 *
 * Título e corpo podem aparecer na tela bloqueada (push, Etapa 10): nunca
 * colocar dados pessoais nem o motivo de uma recusa.
 */
import type { TipoNotificacao } from '@abraco/shared';

export interface ConteudoNotificacao {
  readonly tipo: TipoNotificacao;
  readonly titulo: string;
  readonly corpo: string;
}
