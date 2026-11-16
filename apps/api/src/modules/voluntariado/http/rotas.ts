import { AREAS_INTERESSE, DIAS_SEMANA, STATUS_VOLUNTARIO, TURNOS } from '@abraco/shared';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { aplicarLimite } from '../../../shared/http/limite.js';
import { LIMITES_ADOCAO } from '../../adocoes/domain/adocao.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type { LimitadorTentativas } from '../../auth/infrastructure/redis-auth.js';
import { LIMITES_CANDIDATURA } from '../domain/candidatura.js';
import {
  LIMITE_PAGINA_CANDIDATURAS,
  type AdminListarCandidaturas,
  type AdminObterCandidatura,
  type AprovarCandidatura,
  type Candidatar,
  type ObterMinhaCandidatura,
  type RecusarCandidatura,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasVoluntariado {
  readonly candidatar: Candidatar;
  readonly minha: ObterMinhaCandidatura;
  readonly adminListar: AdminListarCandidaturas;
  readonly adminObter: AdminObterCandidatura;
  readonly aprovar: AprovarCandidatura;
  readonly recusar: RecusarCandidatura;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

const REGRA = { nome: 'candidatura', maximo: 5, janelaSegundos: 3600 } as const;

const candidaturaSaida = z.object({
  id: z.uuid(),
  status: z.enum(STATUS_VOLUNTARIO),
  areasInteresse: z.array(z.enum(AREAS_INTERESSE)),
  areaInteresseOutros: z.string().nullable(),
  disponibilidadeDias: z.array(z.enum(DIAS_SEMANA)),
  turnos: z.array(z.enum(TURNOS)),
  motivacao: z.string(),
  habilidades: z.string().nullable(),
  cargo: z.string().nullable(),
  motivoRecusa: z.string().nullable(),
  analisadoEm: z.date().nullable(),
  criadoEm: z.date(),
});

const candidaturaAdminSaida = candidaturaSaida.extend({
  candidato: z.object({
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
  }),
});

const idParam = z.strictObject({ id: z.uuid() });

export function rotasVoluntariado(deps: DependenciasRotasVoluntariado): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return async (app) => {
    app.post(
      '/voluntariado/candidaturas',
      {
        preHandler: autenticar,
        schema: {
          body: z.strictObject({
            areasInteresse: z.array(z.enum(AREAS_INTERESSE)).max(AREAS_INTERESSE.length * 2),
            areaInteresseOutros: z
              .string()
              .max(LIMITES_CANDIDATURA.outrosMax * 2)
              .nullish(),
            disponibilidadeDias: z.array(z.enum(DIAS_SEMANA)).max(DIAS_SEMANA.length * 2),
            turnos: z.array(z.enum(TURNOS)).max(TURNOS.length * 2),
            motivacao: z.string().max(LIMITES_CANDIDATURA.motivacaoMax * 2),
            habilidades: z
              .string()
              .max(LIMITES_CANDIDATURA.habilidadesMax * 2)
              .nullish(),
          }),
          response: { 201: candidaturaSaida },
        },
      },
      async (request, reply) => {
        const ator = atorDe(request);
        await aplicarLimite(deps.limitador, REGRA, ator.id, reply);
        return reply.code(201).send(await deps.candidatar.executar({ ator, dados: request.body }));
      },
    );

    app.get(
      '/me/voluntariado',
      { preHandler: autenticar, schema: { response: { 200: candidaturaSaida } } },
      async (request) => deps.minha.executar({ ator: atorDe(request) }),
    );

    await app.register(
      (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));

        admin.get(
          '/voluntarios',
          {
            schema: {
              querystring: z.strictObject({
                status: z.enum(STATUS_VOLUNTARIO).optional(),
                cursor: cursorEsquema.optional(),
                limite: z.coerce
                  .number()
                  .int()
                  .min(1)
                  .max(LIMITE_PAGINA_CANDIDATURAS.maximo)
                  .optional(),
              }),
              response: {
                200: z.object({
                  itens: z.array(candidaturaAdminSaida),
                  proximoCursor: z.string().nullable(),
                }),
              },
            },
          },
          async (request) => {
            const { status, cursor, limite } = request.query;
            const p = await deps.adminListar.executar({
              ator: atorDe(request),
              ...(status ? { status } : {}),
              ...(cursor ? { cursor } : {}),
              ...(limite !== undefined ? { limite } : {}),
            });
            return {
              itens: p.itens,
              proximoCursor: p.proximoCursor ? codificarCursor(p.proximoCursor) : null,
            };
          },
        );

        admin.get(
          '/voluntarios/:id',
          { schema: { params: idParam, response: { 200: candidaturaAdminSaida } } },
          async (request) =>
            deps.adminObter.executar({ ator: atorDe(request), id: request.params.id }),
        );

        admin.post(
          '/voluntarios/:id/aprovar',
          {
            schema: {
              params: idParam,
              body: z
                .strictObject({
                  cargo: z
                    .string()
                    .max(LIMITES_CANDIDATURA.cargoMax * 2)
                    .nullish(),
                })
                .optional(),
              response: { 200: candidaturaAdminSaida },
            },
          },
          async (request) =>
            deps.aprovar.executar({
              ator: atorDe(request),
              id: request.params.id,
              cargo: request.body?.cargo ?? null,
            }),
        );

        admin.post(
          '/voluntarios/:id/recusar',
          {
            schema: {
              params: idParam,
              body: z.strictObject({
                motivoRecusa: z.string().max(LIMITES_ADOCAO.motivoRecusaMax * 2),
              }),
              response: { 200: candidaturaAdminSaida },
            },
          },
          async (request) =>
            deps.recusar.executar({
              ator: atorDe(request),
              id: request.params.id,
              motivo: request.body.motivoRecusa,
            }),
        );
        return Promise.resolve();
      },
      { prefix: '/admin' },
    );
  };
}
