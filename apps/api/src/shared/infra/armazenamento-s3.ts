import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ArmazenamentoObjetos } from '../aplicacao/armazenamento.js';
import type { Relogio } from '../aplicacao/relogio.js';

export interface ConfigS3 {
  /** Endpoint usado pela API (dentro do Docker: http://s3:8333). Vazio = AWS. */
  readonly endpoint?: string;
  /**
   * Endpoint que o APP alcança, usado só para assinar URLs. A assinatura inclui
   * o host, então não dá para trocar o endereço depois de assinar.
   */
  readonly endpointPublico?: string;
  readonly regiao: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
  readonly ttlUrlSegundos: number;
}

function cliente(config: ConfigS3, endpoint: string | undefined): S3Client {
  return new S3Client({
    region: config.regiao,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // SeaweedFS/R2 não exigem os checksums novos do SDK; só quando a operação pede.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class ArmazenamentoS3 implements ArmazenamentoObjetos {
  private readonly s3: S3Client;
  private readonly assinador: S3Client;

  constructor(
    private readonly config: ConfigS3,
    private readonly relogio: Relogio,
  ) {
    this.s3 = cliente(config, config.endpoint);
    // Assinar não faz requisição: o cliente "público" nunca abre conexão.
    this.assinador = cliente(config, config.endpointPublico ?? config.endpoint);
  }

  async enviar(chave: string, conteudo: Buffer, tipoConteudo: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: chave,
        Body: conteudo,
        ContentType: tipoConteudo,
        // Nome aleatório por foto: o conteúdo de uma chave nunca muda.
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
  }

  async remover(chaves: readonly string[]): Promise<void> {
    if (chaves.length === 0) return;
    const r = await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: { Objects: chaves.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (r.Errors && r.Errors.length > 0) {
      throw new Error(`falha ao remover ${String(r.Errors.length)} objeto(s) do bucket`);
    }
  }

  /**
   * A assinatura é feita no início da janela atual (metade do TTL). Assim, a
   * mesma foto tem a MESMA URL durante a janela e o app aproveita o cache de
   * imagem; cada URL ainda vale no máximo `ttlUrlSegundos` (1h) e no mínimo
   * metade disso.
   */
  urlAssinada(chave: string): Promise<string> {
    const janelaMs = (this.config.ttlUrlSegundos * 1000) / 2;
    const agora = this.relogio.agora().getTime();
    const inicioJanela = new Date(Math.floor(agora / janelaMs) * janelaMs);
    return getSignedUrl(
      this.assinador,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: chave }),
      { expiresIn: this.config.ttlUrlSegundos, signingDate: inicioJanela },
    );
  }

  destruir(): void {
    this.s3.destroy();
    this.assinador.destroy();
  }
}
