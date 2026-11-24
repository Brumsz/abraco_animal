import { dadosDoacao, esquemaDoacaoAnimal } from '@/features/doacoes-animais/domain/esquema';

import { corpoAdocao, esquemaAdocao } from './esquema';

const MOTIVO = 'Tenho um sítio com pasto e baia, e cuido de dois cavalos há dez anos.';

describe('formulário de adoção', () => {
  it('exige moradia, espaço e um motivo com 50+ caracteres', () => {
    const r = esquemaAdocao.safeParse({ motivo: 'curto', outrosAnimais: '' });
    expect(r.success).toBe(false);
    const campos = r.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(
      expect.arrayContaining(['tipoMoradia', 'possuiEspacoAdequado', 'motivo']),
    );
  });

  it('monta o corpo da API com o termo aceito e "outros animais" vazio como null', () => {
    const f = esquemaAdocao.parse({
      tipoMoradia: 'CHACARA',
      possuiEspacoAdequado: true,
      motivo: `  ${MOTIVO}  `,
      outrosAnimais: ' ',
    });
    expect(corpoAdocao('id-1', f)).toEqual({
      animalId: 'id-1',
      tipoMoradia: 'CHACARA',
      possuiEspacoAdequado: true,
      motivo: MOTIVO,
      outrosAnimais: null,
      aceitouTermo: true,
    });
  });
});

describe('doar um animal', () => {
  const base = {
    nomeAnimal: 'Trovão',
    tipo: 'EQUINO',
    raca: 'Mangalarga',
    anos: '2',
    meses: '6',
    sexo: 'MACHO',
    porte: 'GRANDE',
    descricao: 'Manso e saudável.',
    motivoDoacao: 'Vou me mudar para a cidade.',
    enderecoRetirada: 'Estrada do Sítio, km 4, Ibiúna',
    fotos: [{ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }],
  } as const;

  it('converte anos e meses na idade em meses e separa as fotos', () => {
    const { dados, fotos } = dadosDoacao(esquemaDoacaoAnimal.parse(base));
    expect(dados.idadeAprox).toBe(30);
    expect(dados).not.toHaveProperty('anos');
    expect(fotos).toHaveLength(1);
  });

  it('exige ao menos uma foto, a idade e um motivo de 20+ caracteres', () => {
    const r = esquemaDoacaoAnimal.safeParse({
      ...base,
      fotos: [],
      anos: '',
      meses: '',
      motivoDoacao: 'mudança',
    });
    const campos = r.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(['fotos', 'motivoDoacao']));
    // A idade é conferida depois dos campos (refine do objeto).
    const semIdade = esquemaDoacaoAnimal.safeParse({ ...base, anos: '', meses: '' });
    expect(semIdade.error?.issues[0]?.path).toEqual(['anos']);
  });

  it('meses vão de 0 a 11', () => {
    expect(esquemaDoacaoAnimal.safeParse({ ...base, meses: '12' }).success).toBe(false);
  });
});
