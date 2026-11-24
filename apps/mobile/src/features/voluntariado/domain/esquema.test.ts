import { alternar, AREAS, corpoCandidatura, esquemaVoluntariado } from './esquema';

const base = {
  areasInteresse: ['EVENTOS' as const],
  areaInteresseOutros: '',
  disponibilidadeDias: ['SABADO' as const],
  turnos: ['MANHA' as const],
  motivacao: 'Amo cavalos e quero ajudar nos fins de semana.',
  habilidades: '',
};

describe('esquema do voluntariado', () => {
  it('aceita o mínimo e exige ao menos uma escolha em cada grupo', () => {
    expect(esquemaVoluntariado.safeParse(base).success).toBe(true);
    const r = esquemaVoluntariado.safeParse({ ...base, areasInteresse: [], turnos: [] });
    expect(r.success).toBe(false);
    const campos = r.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(['areasInteresse', 'turnos']));
  });

  it('"Outros" pede o texto; motivação curta é recusada', () => {
    const outros = esquemaVoluntariado.safeParse({
      ...base,
      areasInteresse: ['OUTROS'],
    });
    expect(outros.error?.issues[0]?.path).toEqual(['areaInteresseOutros']);
    expect(esquemaVoluntariado.safeParse({ ...base, motivacao: 'curta' }).success).toBe(false);
  });

  it('alternar mantém a ordem das opções', () => {
    expect(alternar(['OUTROS'], 'EVENTOS', AREAS)).toEqual(['EVENTOS', 'OUTROS']);
    expect(alternar(['EVENTOS', 'OUTROS'], 'EVENTOS', AREAS)).toEqual(['OUTROS']);
  });

  it('corpo: textos vazios viram null; "outros" só com a área OUTROS', () => {
    expect(corpoCandidatura({ ...base, areaInteresseOutros: 'Fotografia' })).toMatchObject({
      areaInteresseOutros: null,
      habilidades: null,
    });
    expect(
      corpoCandidatura({ ...base, areasInteresse: ['OUTROS'], areaInteresseOutros: ' Foto ' }),
    ).toMatchObject({ areaInteresseOutros: 'Foto' });
  });
});
