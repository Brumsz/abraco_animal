import { tempoRelativo } from './tempo';

const agora = new Date('2026-11-24T15:00:00');
const antes = (ms: number) => new Date(agora.getTime() - ms).toISOString();
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe('tempo relativo', () => {
  it.each([
    [antes(20_000), 'Agora há pouco'],
    [antes(MIN), 'Há 1 minuto'],
    [antes(45 * MIN), 'Há 45 minutos'],
    [antes(2 * HORA), 'Há 2 horas'],
    [antes(DIA + HORA), 'Ontem'],
    [antes(3 * DIA), 'Há 3 dias'],
    [new Date('2026-11-12T10:00:00').toISOString(), '12 de nov.'],
    [new Date('2025-03-02T10:00:00').toISOString(), '2 de mar. de 2025'],
  ])('%s → %s', (iso, texto) => {
    expect(tempoRelativo(iso, agora)).toBe(texto);
  });

  it('relógio do aparelho atrasado não mostra tempo negativo', () => {
    expect(tempoRelativo(new Date(agora.getTime() + HORA).toISOString(), agora)).toBe(
      'Agora há pouco',
    );
  });
});
