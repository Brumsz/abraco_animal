/** Textos de exibição dos enums de animal (a API devolve os códigos). */
import type { AnimalResumo } from '@abraco/api-client';

export const TIPOS: Record<AnimalResumo['tipo'], { singular: string; plural: string }> = {
  EQUINO: { singular: 'Equino', plural: 'Equinos' },
  CANINO: { singular: 'Canino', plural: 'Caninos' },
  BOVINO: { singular: 'Bovino', plural: 'Bovinos' },
  OUTRO: { singular: 'Outro', plural: 'Outros' },
};

export const SEXOS: Record<AnimalResumo['sexo'], string> = { MACHO: 'Macho', FEMEA: 'Fêmea' };

export const PORTES: Record<AnimalResumo['porte'], string> = {
  PEQUENO: 'Pequeno',
  MEDIO: 'Médio',
  GRANDE: 'Grande',
  MUITO_GRANDE: 'Muito grande',
};

/** Filtros da tela Adotar (protótipo: Todos, Equinos, Caninos, Bovinos). */
export const FILTROS_TIPO = ['EQUINO', 'CANINO', 'BOVINO'] as const;

/** Idade aproximada em meses → "8 meses", "1 ano", "2 anos e 6 meses". */
export function idadeTexto(meses: number): string {
  if (meses < 1) return 'Menos de 1 mês';
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const txtMeses = `${String(resto)} ${resto === 1 ? 'mês' : 'meses'}`;
  if (anos === 0) return txtMeses;
  const txtAnos = `${String(anos)} ${anos === 1 ? 'ano' : 'anos'}`;
  return resto === 0 ? txtAnos : `${txtAnos} e ${txtMeses}`;
}
