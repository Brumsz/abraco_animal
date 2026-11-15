import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { aplicarLimite } from '../../../shared/http/limite.js';
import { animalResumoSaida } from '../../animais/http/esquemas.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type { LimitadorTentativas } from '../../auth/infrastructure/redis-auth.js';
import { MENSAGEM_MAX } from '../domain/apadrinhamento.js';
import type {
  Apadrinhar,
  EncerrarApadrinhamento,
  ListarMeusApadrinhamentos,
  ListarPadrinhos,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasApadrinhamentos {
  readonly apadrinhar: Apadrinhar;
  readonly listarMeus: ListarMeusApadrinhamentos;
  readonly encerrar: EncerrarApadrinhamento;
  readonly listarPadrinhos: ListarPadrinhos;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

const REGRA = { nome: 'apadrinhar', maximo: 20, janelaSegundos: 3600 } as const;

const idParam = z.strictObject({ id: z.uuid() });

const apadrinhamentoSaida = z.object({
  id: z.uuid(),
  animal: animalResumoSaida,
  ativo: z.boolean(),
  mensagemPadrinho: z.string().nullable(),
  criadoEm: z.date(),
});

export function rotasApadrinhamentos(
  deps: DependenciasRotasApadrinhamentos,
): FastifyPluginAsyncZod {
  const { autenticar, autenticarOpcional } = deps.autenticacao;

  return (app) => {
    app.post(
      '/apadrinhamentos',
      {
        preHandler: autenticar,
        schema: {
          body: z.strictObject({
            animalId: z.uuid(),
            mensagemPadrinho: z
              .string()
              .max(MENSAGEM_MAX * 2)
              .nullish(),
          }),
          response: { 201: apadrinhamentoSaida },
        },
      },
      async (request, reply) => {
        const ator = atorDe(request);
        await aplicarLimite(deps.limitador, REGRA, ator.id, reply);
        const r = await deps.apadrinhar.executar({
          ator,
          animalId: request.body.animalId,
          mensagemPadrinho: request.body.mensagemPadrinho ?? null,
        });
        return reply.code(201).send(r);
      },
    );

    app.get(
      '/me/apadrinhamentos',
      { preHandler: autenticar, schema: { response: { 200: z.array(apadrinhamentoSaida) } } },
      async (request) => deps.listarMeus.executar({ ator: atorDe(request) }),
    );

    app.delete(
      '/apadrinhamentos/:id',
      { preHandler: autenticar, schema: { params: idParam } },
      async (request, reply) => {
        await deps.encerrar.executar({ ator: atorDe(request), id: request.params.id });
        return reply.code(204).send();
      },
    );

    app.get(
      '/animais/:id/padrinhos',
      {
        preHandler: autenticarOpcional,
        schema: {
          params: idParam,
          response: {
            200: z.array(
              z.object({
                nome: z.string(),
                fotoUrl: z.url().nullable(),
                mensagemPadrinho: z.string().nullable(),
              }),
            ),
          },
        },
      },
      async (request) => {
        const role = request.claims?.role;
        return deps.listarPadrinhos.executar({
          animalId: request.params.id,
          ...(role ? { role } : {}),
        });
      },
    );

    return Promise.resolve();
  };
}
