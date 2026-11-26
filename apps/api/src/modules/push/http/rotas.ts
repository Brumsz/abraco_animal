/**
 * /v1/me/dispositivos-push — o app registra o token deste aparelho (ou o remove
 * quando a pessoa desliga as notificações). Sempre do usuário do token.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type { RegistrarAparelho, RemoverAparelho } from '../application/casos-de-uso.js';

export interface DependenciasRotasPush {
  readonly registrar: RegistrarAparelho;
  readonly remover: RemoverAparelho;
  readonly autenticacao: Autenticacao;
}

const deviceId = z.string().max(128);

export function rotasPush(deps: DependenciasRotasPush): FastifyPluginAsyncZod {
  return (app) => {
    app.addHook('preHandler', deps.autenticacao.autenticar);

    app.post(
      '/me/dispositivos-push',
      {
        schema: {
          body: z.strictObject({ deviceId, expoToken: z.string().max(256) }),
        },
      },
      async (request, reply) => {
        await deps.registrar.executar({ ator: atorDe(request), ...request.body });
        return reply.code(204).send();
      },
    );

    app.delete(
      '/me/dispositivos-push/:deviceId',
      { schema: { params: z.strictObject({ deviceId }) } },
      async (request, reply) => {
        await deps.remover.executar({ ator: atorDe(request), deviceId: request.params.deviceId });
        return reply.code(204).send();
      },
    );

    return Promise.resolve();
  };
}
