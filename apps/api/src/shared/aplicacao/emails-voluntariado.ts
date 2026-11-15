import type { DestinatarioEmail } from './emails-adocao.js';

/** E-mails da candidatura de voluntariado (fila BullMQ). */
export interface EmailsVoluntariado {
  candidaturaRecebida(d: DestinatarioEmail): Promise<void>;
  voluntarioAprovado(d: DestinatarioEmail & { cargo: string | null }): Promise<void>;
  voluntarioRecusado(d: DestinatarioEmail & { motivo: string }): Promise<void>;
}
