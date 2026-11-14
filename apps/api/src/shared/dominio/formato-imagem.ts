/**
 * Identifica o formato real de uma imagem pelos primeiros bytes ("magic bytes").
 * A extensão e o Content-Type vêm do cliente e não são confiáveis (seção 6).
 */
export type FormatoImagem = 'jpeg' | 'png' | 'webp';

const comeca = (bytes: Uint8Array, assinatura: readonly number[], deslocamento = 0) =>
  bytes.length >= deslocamento + assinatura.length &&
  assinatura.every((b, i) => bytes[deslocamento + i] === b);

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" (bytes 8–11)

export function detectarFormatoImagem(bytes: Uint8Array): FormatoImagem | null {
  if (comeca(bytes, JPEG)) return 'jpeg';
  if (comeca(bytes, PNG)) return 'png';
  if (comeca(bytes, RIFF) && comeca(bytes, WEBP, 8)) return 'webp';
  return null;
}
