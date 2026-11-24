/**
 * Fotos escolhidas na galeria → arquivos do multipart. A API confere de novo o
 * formato (magic bytes) e o tamanho; aqui só evitamos um envio que já sabemos que falha.
 */
import type { UsuarioPerfil } from '@abraco/api-client';
import { UPLOAD_IMAGENS } from '@abraco/shared';

import type { FotoEscolhida } from './esquema';

export interface ItemGaleria {
  readonly uri: string;
  readonly fileName?: string | null;
  readonly mimeType?: string;
  readonly fileSize?: number;
}

export function fotosDaGaleria(
  itens: readonly ItemGaleria[],
  jaEscolhidas: number,
  maximo: number,
): { fotos: FotoEscolhida[]; grandes: number; excedentes: number } {
  const cabem = Math.max(0, maximo - jaEscolhidas);
  const pequenas = itens.filter(
    (i) => i.fileSize === undefined || i.fileSize <= UPLOAD_IMAGENS.tamanhoMaximoBytes,
  );
  const fotos = pequenas.slice(0, cabem).map((i, n) => ({
    uri: i.uri,
    name: i.fileName ?? `foto-${String(jaEscolhidas + n + 1)}.jpg`,
    type: i.mimeType ?? 'image/jpeg',
  }));
  return {
    fotos,
    grandes: itens.length - pequenas.length,
    excedentes: Math.max(0, pequenas.length - cabem),
  };
}

/** Endereço do cadastro numa linha, para sugerir o local de retirada. */
export function enderecoEmTexto(endereco: UsuarioPerfil['endereco'] | null | undefined): string {
  if (!endereco) return '';
  const rua = [endereco.logradouro, endereco.numero, endereco.complemento]
    .filter(Boolean)
    .join(', ');
  return `${rua} - ${endereco.bairro}, ${endereco.cidade}/${endereco.uf}`;
}
