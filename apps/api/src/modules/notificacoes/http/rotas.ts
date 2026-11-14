import { TIPOS_NOTIFICACAO } from '@abraco/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import {
  LIMITE_PAGINA_NOTIFICACOES,
  type ContarNaoLidas,
  type ListarNotificacoes,
  type MarcarNotificacaoLida,
  type MarcarTodasLidas,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasNotificacoes {
  readonly listar: ListarNotificacoes;
  readonly contar: ContarNaoLidas;
  readonly marcarLida: MarcarNotificacaoLida;
  readonly marcarTodas: MarcarTodasLidas;
  readonly autenticacao: Autenticacao;
}

const notificacaoSaida = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_NOTIFICACAO),
  titulo: z.string(),
  corpo: z.string(),
  entidadeId: z.uuid().nullable(),
  lidaEm: z.date().nullable(),
  criadoEm: z.date(),
});

export function rotasNotificacoes(deps: DependenciasRotasNotificacoes): FastifyPluginAsyncZod {
  return (app) => {
    app.addHook('preHandler', deps.autenticacao.autenticar);

    app.get(
      '/notificacoes',
      {
        schema: {
          querystring: z.strictObject({
            cursor: cursorEsquema.optional(),
            limite: z.coerce
              .number()
              .int()
              .min(1)
              .max(LIMITE_PAGINA_NOTIFICACOES.maximo)
              .optional(),
          }),
          response: {
            200: z.object({
              itens: z.array(notificacaoSaida),
              proximoCursor: z.string().nullable(),
            }),
          },
        },
      },
      async (request) => {
        const { cursor, limite } = request.query;
        const p = await deps.listar.executar({
          ator: atorDe(request),
          ...(cursor ? { cursor } : {}),
          ...(limite !== undefined ? { limite } : {}),
        });
        return {
          itens: p.itens,
          proximoCursor: p.proximoCursor ? codificarCursor(p.proximoCursor) : null,
        };
      },
    );

    app.get(
      '/notificacoes/nao-lidas',
      { schema: { response: { 200: z.object({ total: z.number().int() }) } } },
      async (request) => deps.contar.executar({ ator: atorDe(request) }),
    );

    app.post(
      '/notificacoes/:id/lida',
      { schema: { params: z.strictObject({ id: z.uuid() }) } },
      async (request, reply) => {
        await deps.marcarLida.executar({ ator: atorDe(request), id: request.params.id });
        return reply.code(204).send();
      },
    );

    app.post('/notificacoes/lidas', async (request, reply) => {
      await deps.marcarTodas.executar({ ator: atorDe(request) });
      return reply.code(204).send();
    });

    return Promise.resolve();
  };
}
