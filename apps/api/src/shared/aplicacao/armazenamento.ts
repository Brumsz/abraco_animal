/**
 * Porta do armazenamento de objetos (S3 compatível). O bucket é privado: o app
 * só recebe URLs assinadas com validade curta (seção 6).
 */
export interface ArmazenamentoObjetos {
  enviar(chave: string, conteudo: Buffer, tipoConteudo: string): Promise<void>;
  /** Remove objetos; chaves inexistentes são ignoradas. */
  remover(chaves: readonly string[]): Promise<void>;
  urlAssinada(chave: string): Promise<string>;
}
