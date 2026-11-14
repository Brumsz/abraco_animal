import { STATUS_ADOCAO, TIPOS_MORADIA } from '@abraco/shared';
import { z } from 'zod';

import { cursorEsquema } from '../../../shared/http/cursor.js';
import { animalResumoSaida } from '../../animais/http/esquemas.js';
import { LIMITE_PAGINA_ADOCOES } from '../application/casos-de-uso.js';
import { LIMITES_ADOCAO } from '../domain/adocao.js';

/** Formato e teto de tamanho; as regras (mínimos, termo) ficam no domínio. */
export const solicitarAdocaoEntrada = z.strictObject({
  animalId: z.uuid(),
  tipoMoradia: z.enum(TIPOS_MORADIA),
  possuiEspacoAdequado: z.boolean(),
  outrosAnimais: z
    .string()
    .max(LIMITES_ADOCAO.outrosAnimaisMax * 2)
    .nullish(),
  motivo: z.string().max(LIMITES_ADOCAO.motivoMax * 2),
  aceitouTermo: z.boolean(),
});

export const recusarEntrada = z.strictObject({
  motivoRecusa: z.string().max(LIMITES_ADOCAO.motivoRecusaMax * 2),
});

export const idParam = z.strictObject({ id: z.uuid() });

const limite = z.coerce.number().int().min(1).max(LIMITE_PAGINA_ADOCOES.maximo).optional();

export const paginaQuery = z.strictObject({ cursor: cursorEsquema.optional(), limite });

export const adminListagemQuery = z
  .strictObject({
    status: z.enum(STATUS_ADOCAO).optional(),
    animalId: z.uuid().optional(),
    de: z.iso.datetime({ offset: true }).optional(),
    ate: z.iso.datetime({ offset: true }).optional(),
    cursor: cursorEsquema.optional(),
    limite,
  })
  .refine((q) => !q.de || !q.ate || Date.parse(q.de) < Date.parse(q.ate), {
    message: '"de" deve ser anterior a "ate"',
    path: ['ate'],
  });

// ── Saídas ───────────────────────────────────────────────────────────────

export const adocaoSaida = z.object({
  id: z.uuid(),
  status: z.enum(STATUS_ADOCAO),
  animal: animalResumoSaida,
  tipoMoradia: z.enum(TIPOS_MORADIA),
  possuiEspacoAdequado: z.boolean(),
  outrosAnimais: z.string().nullable(),
  motivo: z.string(),
  termoAceitoEm: z.date(),
  analisadoEm: z.date().nullable(),
  motivoRecusa: z.string().nullable(),
  recusaAutomatica: z.boolean(),
  criadoEm: z.date(),
  timeline: z.array(
    z.object({
      etapa: z.enum(['ENVIADA', 'EM_ANALISE', 'APROVADA', 'RECUSADA']),
      em: z.date().nullable(),
    }),
  ),
});

export const adocaoAdminSaida = adocaoSaida.extend({
  solicitante: z
    .object({
      id: z.uuid(),
      nome: z.string(),
      email: z.string(),
      telefone: z.string(),
      endereco: z.object({
        cep: z.string(),
        logradouro: z.string(),
        numero: z.string(),
        complemento: z.string().nullable(),
        bairro: z.string(),
        cidade: z.string(),
        uf: z.string(),
      }),
    })
    .nullable(),
  analisadoPor: z.string().nullable(),
});

export const paginaAdocoesSaida = z.object({
  itens: z.array(adocaoSaida),
  proximoCursor: z.string().nullable(),
});
