import type { DestinatarioEmail } from './emails-adocao.js';

/** E-mails do fluxo de doação de animal (fila BullMQ). */
export interface EmailsDoacaoAnimal {
  /** Confirmação: "recebemos sua oferta". */
  doacaoEnviada(d: DestinatarioEmail & { animal: string }): Promise<void>;
  /** A ONG aceitou e vai combinar a retirada. */
  doacaoAprovada(d: DestinatarioEmail & { animal: string }): Promise<void>;
  doacaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }): Promise<void>;
  /** O animal chegou à ONG. */
  doacaoConcluida(d: DestinatarioEmail & { animal: string }): Promise<void>;
}
