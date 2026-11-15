/**
 * Porta do armazenamento de objetos (S3 compatível). O bucket é privado: o app
 * só recebe URLs assinadas com validade curta (seção 6).
 */
export interface ArmazenamentoObjetos {
  enviar(chave: string, conteudo: Buffer, tipoConteudo: string): Promise<void>;
  /** Remove objetos; chaves inexistentes são ignoradas. */
  remover(chaves: readonly string[]): Promise<void>;
  /** Cópia dentro do bucket (sem baixar o arquivo para a API). */
  copiar(origem: string, destino: string): Promise<void>;
  urlAssinada(chave: string): Promise<string>;
}

/** Remoção que não pode derrubar a operação principal; sobra = objeto órfão no bucket. */
export async function removerSemFalhar(
  armazenamento: ArmazenamentoObjetos,
  chaves: readonly string[],
): Promise<void> {
  try {
    await armazenamento.remover(chaves);
  } catch {
    // Objetos órfãos não são visíveis (bucket privado, sem URL). Limpeza periódica: Etapa 11.
  }
}
