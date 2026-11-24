import { lerMarkdown, lerTrechos, urlSegura } from './markdown';

describe('markdown das notícias', () => {
  it('títulos, parágrafos (linhas juntas), listas e citações', () => {
    const blocos = lerMarkdown(
      [
        '# Trovão foi adotado',
        '',
        'Depois de dois anos',
        'na ONG.',
        '',
        '- vacinado',
        '- castrado',
        '',
        '1. visita',
        '2. termo',
        '',
        '> Um novo lar!',
      ].join('\n'),
    );
    expect(blocos.map((b) => b.tipo)).toEqual(['titulo', 'paragrafo', 'lista', 'lista', 'citacao']);
    expect(blocos[1]).toEqual({
      tipo: 'paragrafo',
      trechos: [{ tipo: 'texto', texto: 'Depois de dois anos na ONG.' }],
    });
    expect(blocos[2]).toMatchObject({
      ordenada: false,
      itens: [[{ texto: 'vacinado' }], [{ texto: 'castrado' }]],
    });
    expect(blocos[3]).toMatchObject({ ordenada: true });
  });

  it('negrito, itálico e links', () => {
    expect(lerTrechos('Ajude **hoje** e _sempre_: [doe](https://ong.org)')).toEqual([
      { tipo: 'texto', texto: 'Ajude ' },
      { tipo: 'negrito', texto: 'hoje' },
      { tipo: 'texto', texto: ' e ' },
      { tipo: 'italico', texto: 'sempre' },
      { tipo: 'texto', texto: ': ' },
      { tipo: 'link', texto: 'doe', url: 'https://ong.org' },
    ]);
  });

  it('link perigoso não abre; imagem vira o texto alternativo', () => {
    expect(lerTrechos('[x](javascript:alert)')).toEqual([{ tipo: 'link', texto: 'x', url: null }]);
    expect(lerTrechos('![Cavalo no pasto](https://x/y.jpg)')).toEqual([
      { tipo: 'texto', texto: 'Cavalo no pasto' },
    ]);
    expect(urlSegura('mailto:ong@x.org')).toBe('mailto:ong@x.org');
    expect(urlSegura('/interno')).toBeNull();
  });

  it('HTML que escapasse vira texto comum (nunca é interpretado)', () => {
    expect(lerMarkdown('<b>oi</b>')).toEqual([
      { tipo: 'paragrafo', trechos: [{ tipo: 'texto', texto: '<b>oi</b>' }] },
    ]);
  });
});
