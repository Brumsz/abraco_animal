/** E-mails do fluxo de adoção (enfileirados no BullMQ, enviados por um worker). */
export interface DestinatarioEmail {
  readonly para: string;
  readonly nome: string;
}

export interface EmailsAdocao {
  /** Confirmação: "recebemos sua solicitação". */
  adocaoRecebida(d: DestinatarioEmail & { animal: string }): Promise<void>;
  adocaoAprovada(d: DestinatarioEmail & { animal: string }): Promise<void>;
  adocaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }): Promise<void>;
  /** O animal foi adotado por outra pessoa e a solicitação foi encerrada. */
  adocaoEncerrada(d: DestinatarioEmail & { animal: string }): Promise<void>;
}
