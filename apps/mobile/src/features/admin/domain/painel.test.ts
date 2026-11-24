import {
  barrasPorMes,
  correspondeBusca,
  enderecoEmLinha,
  problemaMotivoRecusa,
  rotaPendencia,
  rotulosEm,
} from './painel';

describe('painel da equipe', () => {
  it('barras proporcionais ao maior mês', () => {
    const barras = barrasPorMes([
      { mes: '2026-10', total: 2 },
      { mes: '2026-11', total: 4 },
    ]);
    expect(barras).toEqual([
      { mes: '2026-10', rotulo: 'out.', total: 2, proporcao: 0.5 },
      { mes: '2026-11', rotulo: 'nov.', total: 4, proporcao: 1 },
    ]);
  });

  it('sem adoções no período: barras vazias, sem dividir por zero', () => {
    expect(barrasPorMes([{ mes: '2026-11', total: 0 }])[0]?.proporcao).toBe(0);
    expect(barrasPorMes([])).toEqual([]);
  });

  it('cada pendência abre o seu detalhe', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(rotaPendencia({ tipo: 'ADOCAO', id }).pathname).toBe('/admin/adocoes/[id]');
    expect(rotaPendencia({ tipo: 'DOACAO_ANIMAL', id }).pathname).toBe(
      '/admin/doacoes-animais/[id]',
    );
    expect(rotaPendencia({ tipo: 'CANDIDATURA_VOLUNTARIO', id }).params).toEqual({ id });
  });

  it('motivo da recusa: mínimo de 10 caracteres sem contar espaços nas pontas', () => {
    expect(problemaMotivoRecusa('   curto   ')).toMatch(/pelo menos 10/);
    expect(problemaMotivoRecusa('Sem espaço adequado para um cavalo.')).toBeNull();
    expect(problemaMotivoRecusa('a'.repeat(1001))).toMatch(/até 1000/);
  });

  it('busca por nome ignora acento e maiúsculas', () => {
    expect(correspondeBusca('Izabella Fortunato', 'izab')).toBe(true);
    expect(correspondeBusca('Juliana Leão', 'LEAO')).toBe(true);
    expect(correspondeBusca('Bruno da Silva', 'maria')).toBe(false);
    expect(correspondeBusca('Bruno da Silva', '  ')).toBe(true);
  });

  it('endereço do solicitante numa linha', () => {
    const base = {
      cep: '01001000',
      logradouro: 'Praça da Sé',
      numero: '1',
      complemento: null,
      bairro: 'Sé',
      cidade: 'São Paulo',
      uf: 'SP',
    };
    expect(enderecoEmLinha(base)).toBe('Praça da Sé, 1 – Sé, São Paulo/SP – CEP 01001-000');
    expect(enderecoEmLinha({ ...base, complemento: 'ap. 2' })).toContain('1 (ap. 2) –');
  });

  it('rótulos na ordem das opções', () => {
    const dias = [
      { valor: 'SEGUNDA', rotulo: 'Seg' },
      { valor: 'SEXTA', rotulo: 'Sex' },
    ] as const;
    expect(rotulosEm(['SEXTA', 'SEGUNDA'], dias)).toBe('Seg, Sex');
    expect(rotulosEm([], dias)).toBe('—');
  });
});
