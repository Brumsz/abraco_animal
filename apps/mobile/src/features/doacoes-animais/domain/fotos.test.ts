import { enderecoEmTexto, fotosDaGaleria } from './fotos';

const MB = 1024 * 1024;

describe('fotos da galeria', () => {
  it('converte para o formato do multipart com nome e tipo padrão', () => {
    const r = fotosDaGaleria([{ uri: 'file:///a', fileSize: MB }], 0, 10);
    expect(r.fotos).toEqual([{ uri: 'file:///a', name: 'foto-1.jpg', type: 'image/jpeg' }]);
  });

  it('recusa fotos acima de 5 MB e respeita o limite de 10', () => {
    const itens = [
      { uri: 'a', fileSize: 6 * MB },
      { uri: 'b', fileName: 'b.png', mimeType: 'image/png' },
      { uri: 'c' },
      { uri: 'd' },
    ];
    const r = fotosDaGaleria(itens, 8, 10);
    expect(r.fotos.map((f) => f.uri)).toEqual(['b', 'c']);
    expect(r.grandes).toBe(1);
    expect(r.excedentes).toBe(1);
    expect(r.fotos[0]).toMatchObject({ name: 'b.png', type: 'image/png' });
  });
});

describe('endereço de retirada sugerido', () => {
  it('monta a linha a partir do cadastro (sem complemento vazio)', () => {
    expect(
      enderecoEmTexto({
        cep: '01001000',
        logradouro: 'Praça da Sé',
        numero: '1',
        complemento: null,
        bairro: 'Sé',
        cidade: 'São Paulo',
        uf: 'SP',
      }),
    ).toBe('Praça da Sé, 1 - Sé, São Paulo/SP');
    expect(enderecoEmTexto(null)).toBe('');
  });
});
