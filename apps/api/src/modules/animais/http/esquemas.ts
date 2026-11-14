import { PORTES, SEXOS, STATUS_ANIMAL, TIPOS_ANIMAL } from '@abraco/shared';
import { z } from 'zod';

import { cursorEsquema } from '../../../shared/http/cursor.js';
import { LIMITE_PAGINA } from '../application/consultar-animais.js';
import { LIMITES_ANIMAL } from '../domain/animal.js';

/** Formato e tamanho; regras (status inicial, normalização) ficam no domínio. */
const dadosAnimal = {
  nome: z.string().max(LIMITES_ANIMAL.nome * 2),
  tipo: z.enum(TIPOS_ANIMAL),
  raca: z.string().max(LIMITES_ANIMAL.raca * 2),
  idadeAprox: z.number().int().min(0).max(LIMITES_ANIMAL.idadeMaximaMeses),
  sexo: z.enum(SEXOS),
  porte: z.enum(PORTES),
  descricao: z.string().max(LIMITES_ANIMAL.descricao * 2),
  historiaResgate: z.string().max(LIMITES_ANIMAL.historiaResgate * 2),
  vacinado: z.boolean().default(false),
  castrado: z.boolean().default(false),
};

export const criarAnimalEntrada = z.strictObject({
  ...dadosAnimal,
  status: z.enum(STATUS_ANIMAL).optional(),
});

/** Edição não troca status: isso é o PATCH /status, com as regras de transição. */
export const atualizarAnimalEntrada = z.strictObject(dadosAnimal);

export const alterarStatusEntrada = z.strictObject({ status: z.enum(STATUS_ANIMAL) });

export const reordenarFotosEntrada = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(50),
});

export const idParam = z.strictObject({ id: z.uuid() });
export const fotoParam = z.strictObject({ id: z.uuid(), fotoId: z.uuid() });

export const listagemQuery = z.strictObject({
  q: z.string().max(80).optional(),
  tipo: z.enum(TIPOS_ANIMAL).optional(),
  porte: z.enum(PORTES).optional(),
  sexo: z.enum(SEXOS).optional(),
  status: z.enum(STATUS_ANIMAL).optional(),
  cursor: cursorEsquema.optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA.maximo).optional(),
});

// ── Saídas: só o que está aqui chega ao app ─────────────────────────────

export const fotoSaida = z.object({ id: z.uuid(), url: z.url(), ordem: z.number().int() });

const animalBase = {
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(TIPOS_ANIMAL),
  raca: z.string(),
  idadeAprox: z.number().int(),
  sexo: z.enum(SEXOS),
  porte: z.enum(PORTES),
  status: z.enum(STATUS_ANIMAL),
  fotoCapa: fotoSaida.nullable(),
};

export const animalResumoSaida = z.object(animalBase);

export const animalDetalheSaida = z.object({
  ...animalBase,
  descricao: z.string(),
  historiaResgate: z.string(),
  vacinado: z.boolean(),
  castrado: z.boolean(),
  fotos: z.array(fotoSaida),
  totalPadrinhos: z.number().int(),
});

export const paginaAnimaisSaida = z.object({
  itens: z.array(animalResumoSaida),
  proximoCursor: z.string().nullable(),
});
