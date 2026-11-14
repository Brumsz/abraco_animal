import sharp from 'sharp';

import {
  imagemInvalida,
  type ImagemProcessada,
  type ProcessadorImagens,
} from '../aplicacao/imagens.js';

export interface OpcoesProcessador {
  /** Maior lado da imagem final, em pixels. */
  readonly ladoMaximo: number;
  readonly qualidade: number;
  /**
   * Teto de pixels da ENTRADA. Protege contra "bombas de descompressão": um PNG
   * de poucos KB que, aberto, ocuparia gigabytes de memória.
   */
  readonly limitePixels: number;
}

const PADRAO: OpcoesProcessador = { ladoMaximo: 1600, qualidade: 80, limitePixels: 40_000_000 };

/**
 * Reencoda tudo como WebP. O sharp NÃO copia metadados para a saída (só com
 * `keepMetadata`), então EXIF/GPS/XMP/ICC são descartados; a orientação do
 * EXIF é aplicada antes, para a foto não ficar deitada.
 */
export class ProcessadorImagensSharp implements ProcessadorImagens {
  constructor(private readonly opcoes: OpcoesProcessador = PADRAO) {}

  async processar(conteudo: Buffer): Promise<ImagemProcessada> {
    try {
      const saida = await sharp(conteudo, {
        limitInputPixels: this.opcoes.limitePixels,
        // Arquivo truncado ou corrompido é recusado, não "meio decodificado".
        failOn: 'error',
        // Só o primeiro quadro de uma imagem animada.
        animated: false,
      })
        .autoOrient()
        .resize({
          width: this.opcoes.ladoMaximo,
          height: this.opcoes.ladoMaximo,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: this.opcoes.qualidade })
        .toBuffer();
      return { conteudo: saida, tipoConteudo: 'image/webp', extensao: 'webp' };
    } catch {
      throw imagemInvalida();
    }
  }
}
