/**
 * Formulário "Quero adotar" — visual do Paper com os campos da triagem da API
 * (decisão de 22/11). Mesmos limites da API: motivo 50–3000, outros animais até 1000.
 */
import { z } from 'zod';

export const MORADIAS = [
  { valor: 'CASA_COM_QUINTAL', rotulo: 'Casa com quintal' },
  { valor: 'CASA_SEM_QUINTAL', rotulo: 'Casa sem quintal' },
  { valor: 'APARTAMENTO', rotulo: 'Apartamento' },
  { valor: 'CHACARA', rotulo: 'Chácara ou sítio' },
  { valor: 'FAZENDA', rotulo: 'Fazenda' },
] as const;

export const MOTIVO_MIN = 50;
export const MOTIVO_MAX = 3000;

export const esquemaAdocao = z.object({
  tipoMoradia: z.enum(
    MORADIAS.map((m) => m.valor),
    { error: 'Escolha onde você mora' },
  ),
  possuiEspacoAdequado: z.boolean({ error: 'Responda sim ou não' }),
  motivo: z
    .string()
    .trim()
    .min(MOTIVO_MIN, `Conte um pouco mais: mínimo de ${String(MOTIVO_MIN)} caracteres`)
    .max(MOTIVO_MAX, `No máximo ${String(MOTIVO_MAX)} caracteres`),
  outrosAnimais: z.string().trim().max(1000, 'No máximo 1000 caracteres'),
});

export type FormAdocao = z.input<typeof esquemaAdocao>;

/** Corpo do POST /v1/adocoes. O aceite do termo vem da tela de aviso. */
export function corpoAdocao(animalId: string, f: z.output<typeof esquemaAdocao>) {
  return {
    animalId,
    tipoMoradia: f.tipoMoradia,
    possuiEspacoAdequado: f.possuiEspacoAdequado,
    motivo: f.motivo,
    outrosAnimais: f.outrosAnimais === '' ? null : f.outrosAnimais,
    aceitouTermo: true,
  };
}
