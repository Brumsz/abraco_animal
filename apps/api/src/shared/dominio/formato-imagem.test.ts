import { describe, expect, it } from 'vitest';

import { detectarFormatoImagem } from './formato-imagem.js';

const bytes = (...b: number[]) => Uint8Array.from(b);
const ascii = (s: string) => Uint8Array.from(Buffer.from(s, 'latin1'));

describe('detectarFormatoImagem (magic bytes)', () => {
  it('reconhece JPEG, PNG e WebP', () => {
    expect(detectarFormatoImagem(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('jpeg');
    expect(detectarFormatoImagem(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'png',
    );
    expect(detectarFormatoImagem(ascii('RIFF\x10\x00\x00\x00WEBPVP8 '))).toBe('webp');
  });

  it('recusa executável do Windows mesmo que venha como .jpg', () => {
    expect(detectarFormatoImagem(ascii('MZ\x90\x00\x03\x00\x00\x00'))).toBeNull();
  });

  it('recusa ELF, PDF, SVG, GIF e RIFF que não é WebP (ex.: WAV)', () => {
    expect(detectarFormatoImagem(ascii('\x7fELF\x02\x01'))).toBeNull();
    expect(detectarFormatoImagem(ascii('%PDF-1.7'))).toBeNull();
    expect(detectarFormatoImagem(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectarFormatoImagem(ascii('GIF89a'))).toBeNull();
    expect(detectarFormatoImagem(ascii('RIFF\x10\x00\x00\x00WAVEfmt '))).toBeNull();
  });

  it('recusa arquivos curtos demais para conter a assinatura', () => {
    expect(detectarFormatoImagem(bytes())).toBeNull();
    expect(detectarFormatoImagem(bytes(0xff, 0xd8))).toBeNull();
    expect(detectarFormatoImagem(ascii('RIFF\x00\x00'))).toBeNull();
  });
});
