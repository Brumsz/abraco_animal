/**
 * Preparação de imagens enviadas por usuários — reutilizada por fotos de
 * animais, doações de animais e posts.
 */
import { ErroDominio } from '../dominio/erros.js';
import { detectarFormatoImagem } from '../dominio/formato-imagem.js';

export interface ImagemProcessada {
  readonly conteudo: Buffer;
  readonly tipoConteudo: string;
  readonly extensao: string;
}

/**
 * Redimensiona, corrige a orientação e reencoda a imagem SEM metadados (EXIF
 * pode conter a localização GPS de onde a foto foi tirada). Lança
 * `IMAGEM_INVALIDA` quando o conteúdo não decodifica.
 */
export interface ProcessadorImagens {
  processar(conteudo: Buffer): Promise<ImagemProcessada>;
}

export const imagemInvalida = (mensagem = 'Arquivo não é uma imagem JPEG, PNG ou WebP válida') =>
  new ErroDominio('VALIDACAO', 'IMAGEM_INVALIDA', mensagem, 'fotos');

/**
 * Confere os magic bytes de TODOS os arquivos antes de processar qualquer um:
 * um envio com um arquivo falso é recusado inteiro, sem gastar CPU nem S3.
 */
export async function prepararImagens(
  arquivos: readonly Buffer[],
  processador: ProcessadorImagens,
): Promise<ImagemProcessada[]> {
  if (arquivos.some((a) => detectarFormatoImagem(a) === null)) throw imagemInvalida();
  const processadas: ImagemProcessada[] = [];
  // Em série: o sharp já usa várias threads por imagem e o pico de memória fica menor.
  for (const arquivo of arquivos) processadas.push(await processador.processar(arquivo));
  return processadas;
}
