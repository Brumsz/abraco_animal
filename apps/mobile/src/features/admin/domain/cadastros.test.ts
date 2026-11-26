import type { AnimalDetalhe } from '@abraco/api-client';

import { corpoAnimal, esquemaAnimal, moverItem, valoresDoAnimal } from './animais';
import { inicioDoPeriodo, resumoDetalhe, rotuloAcao } from './auditoria';

const ficha = {
  id: 'a',
  nome: 'Alípio',
  tipo: 'EQUINO',
  raca: 'Mustangue',
  idadeAprox: 98,
  sexo: 'MACHO',
  porte: 'MUITO_GRANDE',
  status: 'ADOTADO',
  fotoCapa: null,
  descricao: 'Calmo.',
  historiaResgate: 'Resgatado na estrada.',
  vacinado: true,
  castrado: false,
  fotos: [],
  totalPadrinhos: 0,
} as AnimalDetalhe;

describe('cadastro de animal', () => {
  it('ficha → formulário → corpo da API (idade em meses ida e volta)', () => {
    const form = valoresDoAnimal(ficha);
    expect(form).toMatchObject({ anos: '8', meses: '2', status: 'INDISPONIVEL' });
    const corpo = corpoAnimal(esquemaAnimal.parse(form));
    expect(corpo).toMatchObject({ nome: 'Alípio', idadeAprox: 98, vacinado: true });
    expect(corpo).not.toHaveProperty('status');
    expect(corpo).not.toHaveProperty('anos');
  });

  it('filhote de meses: anos vazio, meses preenchido', () => {
    expect(valoresDoAnimal({ ...ficha, idadeAprox: 5 })).toMatchObject({ anos: '', meses: '5' });
    expect(valoresDoAnimal({ ...ficha, idadeAprox: 24 })).toMatchObject({ anos: '2', meses: '' });
  });

  it('exige idade e campos obrigatórios', () => {
    const r = esquemaAnimal.safeParse({
      ...valoresDoAnimal(ficha),
      anos: '',
      meses: '',
      nome: ' ',
    });
    expect(r.success).toBe(false);
    const campos = r.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(['anos', 'nome']));
  });

  it('move fotos uma posição, sem sair dos limites', () => {
    expect(moverItem(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moverItem(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moverItem(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moverItem(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
  });
});

describe('auditoria', () => {
  it('ação conhecida vira frase; desconhecida fica legível', () => {
    expect(rotuloAcao('ADOCAO_APROVADA')).toBe('Aprovou uma adoção');
    expect(rotuloAcao('ALGO_NOVO')).toBe('algo novo');
  });

  it('período começa no início do dia, incluindo hoje', () => {
    const agora = new Date(2026, 10, 26, 15, 30);
    expect(inicioDoPeriodo('7', agora)).toBe(new Date(2026, 10, 20).toISOString());
    expect(inicioDoPeriodo('tudo', agora)).toBeNull();
  });

  it('detalhe em uma linha curta', () => {
    expect(resumoDetalhe({ de: 'USUARIO', para: 'VOLUNTARIO' })).toBe(
      'de: USUARIO, para: VOLUNTARIO',
    );
    expect(resumoDetalhe(null)).toBeNull();
    expect(resumoDetalhe({})).toBeNull();
    expect(resumoDetalhe({ texto: 'x'.repeat(200) }, 20)).toHaveLength(20);
  });
});
