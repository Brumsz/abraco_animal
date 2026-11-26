import {
  esquemaFaq,
  esquemaNoticia,
  problemaLegenda,
  publicacao,
  valoresDaSecao,
} from './conteudo';

describe('conteúdo da equipe', () => {
  it('notícia: título, resumo e texto obrigatórios, sem espaços nas pontas', () => {
    const r = esquemaNoticia.safeParse({
      titulo: '  Trovão foi adotado  ',
      resumo: ' ',
      conteudo: 'x',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['resumo']);
    const ok = esquemaNoticia.parse({ titulo: '  Trovão  ', resumo: 'r', conteudo: 'c' });
    expect(ok.titulo).toBe('Trovão');
  });

  it('FAQ: limite da pergunta', () => {
    expect(
      esquemaFaq.safeParse({ pergunta: 'x'.repeat(201), resposta: 'r', publicado: true }).success,
    ).toBe(false);
  });

  it('legenda do post', () => {
    expect(problemaLegenda('   ')).toBe('Escreva uma legenda');
    expect(problemaLegenda('x'.repeat(2201))).toMatch(/2200/);
    expect(problemaLegenda('Feira de adoção sábado!')).toBeNull();
  });

  it('seção nova começa com o nome da aba e despublicada', () => {
    expect(valoresDaSecao('FUNDACAO', [])).toEqual({
      titulo: 'Fundação',
      conteudo: '',
      publicado: false,
    });
    const existente = {
      secao: 'SOBRE_NOS' as const,
      titulo: 'Quem somos',
      conteudo: 'Texto',
      publicado: true,
    };
    expect(valoresDaSecao('SOBRE_NOS', [existente])).toEqual({
      titulo: 'Quem somos',
      conteudo: 'Texto',
      publicado: true,
    });
  });

  it('rótulo de publicação', () => {
    expect(publicacao(true).texto).toBe('Publicado');
    expect(publicacao(false).badge).toBe('NEUTRO');
  });
});
