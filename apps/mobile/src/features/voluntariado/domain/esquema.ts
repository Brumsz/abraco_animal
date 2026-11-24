/**
 * Formulário "Voluntariar" — visual do Paper com os campos da API (decisão de
 * 22/11: áreas de interesse no lugar de "Cargo"; o cargo é a equipe que define
 * ao aprovar). Mesmos limites da API.
 */
import {
  AREAS_INTERESSE,
  DIAS_SEMANA,
  TURNOS,
  type AreaInteresse,
  type DiaSemana,
  type Turno,
} from '@abraco/shared';
import { z } from 'zod';

export const AREAS: readonly { valor: AreaInteresse; rotulo: string }[] = [
  { valor: 'CUIDADO_ANIMAIS', rotulo: 'Cuidado dos animais' },
  { valor: 'EVENTOS', rotulo: 'Eventos' },
  { valor: 'REDES_SOCIAIS', rotulo: 'Redes sociais' },
  { valor: 'TRANSPORTE', rotulo: 'Transporte' },
  { valor: 'CAPTACAO_RECURSOS', rotulo: 'Captação de recursos' },
  { valor: 'OUTROS', rotulo: 'Outros' },
];

export const DIAS: readonly { valor: DiaSemana; rotulo: string }[] = [
  { valor: 'SEGUNDA', rotulo: 'Seg' },
  { valor: 'TERCA', rotulo: 'Ter' },
  { valor: 'QUARTA', rotulo: 'Qua' },
  { valor: 'QUINTA', rotulo: 'Qui' },
  { valor: 'SEXTA', rotulo: 'Sex' },
  { valor: 'SABADO', rotulo: 'Sáb' },
  { valor: 'DOMINGO', rotulo: 'Dom' },
];

export const TURNOS_OPCOES: readonly { valor: Turno; rotulo: string }[] = [
  { valor: 'MANHA', rotulo: 'Manhã' },
  { valor: 'TARDE', rotulo: 'Tarde' },
  { valor: 'NOITE', rotulo: 'Noite' },
];

export const MOTIVACAO_MIN = 20;
export const MOTIVACAO_MAX = 3000;

export const esquemaVoluntariado = z
  .object({
    areasInteresse: z.array(z.enum(AREAS_INTERESSE)).min(1, 'Escolha ao menos uma área'),
    areaInteresseOutros: z.string().trim().max(200, 'No máximo 200 caracteres'),
    disponibilidadeDias: z.array(z.enum(DIAS_SEMANA)).min(1, 'Escolha ao menos um dia'),
    turnos: z.array(z.enum(TURNOS)).min(1, 'Escolha ao menos um turno'),
    motivacao: z
      .string()
      .trim()
      .min(MOTIVACAO_MIN, `Conte um pouco mais: mínimo de ${String(MOTIVACAO_MIN)} caracteres`)
      .max(MOTIVACAO_MAX, `No máximo ${String(MOTIVACAO_MAX)} caracteres`),
    habilidades: z.string().trim().max(3000, 'No máximo 3000 caracteres'),
  })
  .refine((f) => !f.areasInteresse.includes('OUTROS') || f.areaInteresseOutros.length > 0, {
    message: 'Conte qual é a outra área',
    path: ['areaInteresseOutros'],
  });

export type FormVoluntariado = z.infer<typeof esquemaVoluntariado>;

/** Liga/desliga um valor numa escolha múltipla, mantendo a ordem das opções. */
export function alternar<T>(lista: readonly T[], valor: T, ordem: readonly { valor: T }[]): T[] {
  const marcados = new Set(lista);
  if (marcados.has(valor)) marcados.delete(valor);
  else marcados.add(valor);
  return ordem.map((o) => o.valor).filter((v) => marcados.has(v));
}

/** Corpo do POST /v1/voluntariado/candidaturas. */
export function corpoCandidatura(f: FormVoluntariado) {
  const outros = f.areasInteresse.includes('OUTROS') ? f.areaInteresseOutros.trim() : '';
  const habilidades = f.habilidades.trim();
  return {
    areasInteresse: f.areasInteresse,
    areaInteresseOutros: outros.length > 0 ? outros : null,
    disponibilidadeDias: f.disponibilidadeDias,
    turnos: f.turnos,
    motivacao: f.motivacao.trim(),
    habilidades: habilidades.length > 0 ? habilidades : null,
  };
}
