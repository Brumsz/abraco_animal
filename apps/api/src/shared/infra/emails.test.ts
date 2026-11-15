import { describe, expect, it } from 'vitest';

import { montarEmail } from './emails.js';

const base = { para: 'maria@teste.org', nome: 'Maria Souza' };

describe('templates de e-mail', () => {
  it.each([
    ['adocaoRecebida', 'Recebemos sua solicitação para adotar Trovão'],
    ['adocaoAprovada', 'Sua adoção de Trovão foi aprovada! 🎉'],
    ['adocaoEncerrada', 'Trovão encontrou um lar'],
    ['doacaoEnviada', 'Recebemos sua oferta de doação de Trovão'],
    ['doacaoAprovada', 'A ONG aceitou receber Trovão'],
    ['doacaoConcluida', 'Trovão chegou à ONG!'],
  ] as const)('%s: assunto, saudação pelo primeiro nome e nome do animal', (tipo, assunto) => {
    const e = montarEmail({ tipo, ...base, animal: 'Trovão' });
    expect(e.assunto).toBe(assunto);
    expect(e.html).toContain('Olá, Maria!');
    expect(e.html).toContain('<strong>Trovão</strong>');
    expect(e.texto).toContain('Trovão');
  });

  it.each(['adocaoRecusada', 'doacaoRecusada'] as const)('%s leva o motivo no corpo', (tipo) => {
    const e = montarEmail({
      tipo,
      ...base,
      animal: 'Trovão',
      motivo: 'Espaço insuficiente para o porte.',
    });
    expect(e.html).toContain('Espaço insuficiente para o porte.');
    expect(e.texto).toContain('Motivo: Espaço insuficiente');
  });

  it('escapa HTML vindo de texto livre (nome do animal, motivo, nome do usuário)', () => {
    const e = montarEmail({
      tipo: 'adocaoRecusada',
      para: 'x@teste.org',
      nome: '<img src=x onerror=alert(1)>',
      animal: '<script>alert(1)</script>',
      motivo: '"><a href="https://golpe.example">clique</a>',
    });
    expect(e.html).not.toMatch(/<script|<img|<a href/);
    expect(e.html).toContain('&#60;script&#62;');
  });
});
