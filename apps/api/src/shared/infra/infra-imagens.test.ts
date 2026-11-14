/** Infra de imagens sem Docker: sharp real e assinatura de URL (não faz requisição). */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ErroDominio } from '../dominio/erros.js';
import { ArmazenamentoS3, type ConfigS3 } from './armazenamento-s3.js';
import { ProcessadorImagensSharp } from './processador-imagens-sharp.js';

const imagem = (largura: number, altura: number) =>
  sharp({ create: { width: largura, height: altura, channels: 3, background: '#F97316' } });

/** JPEG com EXIF de câmera de celular: GPS, modelo e orientação "girar 90°". */
async function jpegComExif(): Promise<Buffer> {
  return imagem(400, 200)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'Celular', Model: 'Modelo X' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' },
    })
    .toBuffer();
}

describe('ProcessadorImagensSharp', () => {
  const processador = new ProcessadorImagensSharp();

  it('o arquivo de teste realmente tem EXIF (garante que o teste abaixo vale)', async () => {
    const meta = await sharp(await jpegComExif()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.orientation).toBe(6);
  });

  it('remove EXIF/GPS, aplica a orientação e converte para WebP', async () => {
    const r = await processador.processar(await jpegComExif());
    const meta = await sharp(r.conteudo).metadata();

    expect(r).toMatchObject({ tipoConteudo: 'image/webp', extensao: 'webp' });
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    // Orientação 6 (90°) aplicada: 400x200 vira 200x400.
    expect([meta.width, meta.height]).toEqual([200, 400]);
  });

  it('reduz para no máximo 1600 px no maior lado, mantendo a proporção', async () => {
    const r = await processador.processar(await imagem(3200, 1000).png().toBuffer());
    const meta = await sharp(r.conteudo).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 500]);
  });

  it('não amplia imagens pequenas', async () => {
    const r = await processador.processar(await imagem(300, 200).webp().toBuffer());
    const meta = await sharp(r.conteudo).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  it('recusa JPEG truncado', async () => {
    const jpeg = await imagem(800, 600).jpeg().toBuffer();
    await expect(processador.processar(jpeg.subarray(0, 200))).rejects.toMatchObject({
      codigo: 'IMAGEM_INVALIDA',
    });
  });

  it('recusa imagem acima do limite de pixels (bomba de descompressão)', async () => {
    const pequeno = new ProcessadorImagensSharp({
      ladoMaximo: 1600,
      qualidade: 80,
      limitePixels: 1000,
    });
    const erro = await pequeno
      .processar(await imagem(100, 100).png().toBuffer())
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
  });
});

describe('ArmazenamentoS3.urlAssinada', () => {
  const config: ConfigS3 = {
    endpoint: 'http://s3:8333',
    endpointPublico: 'http://192.168.0.10:8333',
    regiao: 'us-east-1',
    bucket: 'abraco-imagens',
    accessKeyId: 'chave',
    secretAccessKey: 'segredo',
    forcePathStyle: true,
    ttlUrlSegundos: 3600,
  };
  const em = (iso: string) => ({ agora: () => new Date(iso) });
  const assinar = (iso: string) =>
    new ArmazenamentoS3(config, em(iso)).urlAssinada('animais/a/b.webp');

  it('assina com o endpoint público e validade de 1h', async () => {
    const url = new URL(await assinar('2026-11-14T12:10:00Z'));
    expect(url.host).toBe('192.168.0.10:8333');
    expect(url.pathname).toBe('/abraco-imagens/animais/a/b.webp');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mesma URL dentro da janela de 30 min (cache de imagem do app funciona)', async () => {
    expect(await assinar('2026-11-14T12:01:00Z')).toBe(await assinar('2026-11-14T12:29:59Z'));
  });

  it('URL nova na janela seguinte; ainda válida por ao menos 30 min', async () => {
    const a = await assinar('2026-11-14T12:29:59Z');
    const b = new URL(await assinar('2026-11-14T12:30:00Z'));
    expect(b.toString()).not.toBe(a);
    expect(b.searchParams.get('X-Amz-Date')).toBe('20261114T123000Z');
  });

  it('sem endpoint público, assina com o endpoint normal', async () => {
    const semPublico: ConfigS3 = { ...config };
    delete (semPublico as { endpointPublico?: string }).endpointPublico;
    const url = new URL(
      await new ArmazenamentoS3(semPublico, em('2026-11-14T12:00:00Z')).urlAssinada('x.webp'),
    );
    expect(url.host).toBe('s3:8333');
  });
});
