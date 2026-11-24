import { dataCurta, horaCurta, mesmoDia, rotuloDia, tempoRelativo } from './tempo';

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

describe('datas do chat e do jornal', () => {
  const local = (texto: string) => new Date(texto).toISOString();

  it('dataCurta e horaCurta usam a hora local', () => {
    expect(dataCurta(local('2024-03-06T09:05:00'))).toBe('06/03/2024');
    expect(horaCurta(local('2026-11-24T08:07:00'))).toBe('08:07');
  });

  it('rotuloDia: Hoje, Ontem, data', () => {
    expect(rotuloDia(local('2026-11-24T00:10:00'), agora)).toBe('Hoje');
    expect(rotuloDia(local('2026-11-23T23:50:00'), agora)).toBe('Ontem');
    expect(rotuloDia(local('2026-11-02T10:00:00'), agora)).toBe('2 de nov.');
    expect(rotuloDia(local('2025-11-02T10:00:00'), agora)).toBe('2 de nov. de 2025');
  });

  it('mesmoDia compara o dia local', () => {
    expect(mesmoDia(local('2026-11-24T00:01:00'), local('2026-11-24T23:59:00'))).toBe(true);
    expect(mesmoDia(local('2026-11-23T23:59:00'), local('2026-11-24T00:01:00'))).toBe(false);
  });
});
