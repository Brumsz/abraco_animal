import { describe, expect, it } from 'vitest';

import { FORMATO_SLUG, sanitizarMarkdown, slugDe } from './conteudo.js';

describe('sanitizarMarkdown: remove HTML e links perigosos', () => {
  it('Markdown comum passa intacto (inclusive >, <, & e aspas no texto)', () => {
    const md = [
      '# Trovão foi adotado!',
      '',
      '> "Foi amor à primeira vista", contou a família.',
      '',
      '- Idade: 8 anos & muito dócil',
      '- Peso < 500 kg',
      '',
      '**Obrigado** a [todos](https://abracoanimal.org.br/apoie) e [fale conosco](mailto:contato@ong.org).',
    ].join('\n');
    expect(sanitizarMarkdown(md)).toBe(md);
  });

  it.each([
    ['<script>alert(1)</script>Olá', 'Olá'],
    ['<img src=x onerror=alert(1)>texto', 'texto'],
    ['<iframe src="https://golpe.example"></iframe>fim', 'fim'],
    ['<a href="javascript:alert(1)">clique</a>', 'clique'],
    // Sobra só texto solto, sem nenhuma tag: nada executa.
    ['<scr<script>ipt>alert(1)</script>', 'ipt>alert(1)'],
    ['<svg onload=alert(1)><circle/></svg>ok', 'ok'],
    ['<style>body{display:none}</style>visível', 'visível'],
  ])('remove HTML: %s', (entrada, esperado) => {
    const saida = sanitizarMarkdown(entrada);
    expect(saida).toBe(esperado);
    expect(saida).not.toMatch(/<\s*(script|img|iframe|svg|style|a)\b/i);
  });

  it.each([
    '[clique](javascript:alert(1))',
    '[clique](JavaScript:alert(1))',
    '[clique](  javascript:alert(1))',
    '[clique](java&#115;cript:alert(1))',
    '[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[clique](vbscript:msgbox(1))',
    '![img](javascript:alert(1))',
    '[clique](//golpe.example/roubo)',
  ])('neutraliza destino perigoso: %s', (md) => {
    // O destino inteiro (inclusive os parênteses internos) vira "#".
    expect(sanitizarMarkdown(md)).toMatch(/^!?\[[^\]]*\]\(#\)$/);
  });

  it('link https com parênteses no caminho continua inteiro', () => {
    const md = '[wiki](https://pt.wikipedia.org/wiki/Cavalo_(animal))';
    expect(sanitizarMarkdown(md)).toBe(md);
  });

  it('definição de referência perigosa também é neutralizada', () => {
    expect(sanitizarMarkdown('[x][1]\n\n[1]: javascript:alert(1)')).toBe('[x][1]\n\n[1]: #');
    expect(sanitizarMarkdown('[1]: https://ok.org')).toBe('[1]: https://ok.org');
  });

  it('autolink com esquema perigoso some (é tratado como tag)', () => {
    expect(sanitizarMarkdown('veja <javascript:alert(1)> isso')).not.toContain('javascript');
  });

  it('destinos permitidos: https, http, mailto, âncora e caminho relativo', () => {
    for (const url of ['https://a.org', 'http://a.org', 'mailto:a@b.org', '#topo', '/animais']) {
      expect(sanitizarMarkdown(`[x](${url})`)).toBe(`[x](${url})`);
    }
  });
});

describe('slugDe', () => {
  it.each([
    ['Cavalo Trovão é adotado!', 'cavalo-trovao-e-adotado'],
    ['  Ação de Natal 2026  ', 'acao-de-natal-2026'],
    ['!!!', 'noticia'],
    ['Pé---de---Pano', 'pe-de-pano'],
  ])('%s → %s', (titulo, slug) => {
    expect(slugDe(titulo)).toBe(slug);
    expect(FORMATO_SLUG.test(slugDe(titulo))).toBe(true);
  });

  it('corta em 80 caracteres sem terminar em hífen', () => {
    const s = slugDe(`${'palavra '.repeat(20)}fim`);
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
  });
});
