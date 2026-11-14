import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';

import { codificarCursor } from '../../../shared/http/cursor.js';
import { aplicarLimite } from '../../../shared/http/limite.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import { REGRAS, type LimitadorTentativas } from '../../auth/infrastructure/redis-auth.js';
import type {
  AdminListarAdocoes,
  AdminObterAdocao,
  AprovarAdocao,
  ListarMinhasAdocoes,
  ObterAdocao,
  Pagina,
  RecusarAdocao,
  SolicitarAdocao,
} from '../application/casos-de-uso.js';
import type { AdocaoSaida } from '../application/apresentacao.js';
import {
  adminListagemQuery,
  adocaoAdminSaida,
  adocaoSaida,
  idParam,
  paginaAdocoesSaida,
  paginaQuery,
  recusarEntrada,
  solicitarAdocaoEntrada,
} from './esquemas.js';

export interface DependenciasRotasAdocoes {
  readonly solicitar: SolicitarAdocao;
  readonly listarMinhas: ListarMinhasAdocoes;
  readonly obter: ObterAdocao;
  readonly adminListar: AdminListarAdocoes;
  readonly adminObter: AdminObterAdocao;
  readonly aprovar: AprovarAdocao;
  readonly recusar: RecusarAdocao;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

const pagina = (p: Pagina<AdocaoSaida>) => ({
  itens: p.itens,
  proximoCursor: p.proximoCursor ? codificarCursor(p.proximoCursor) : null,
});

export function rotasAdocoes(deps: DependenciasRotasAdocoes): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return async (app) => {
    app.post(
      '/adocoes',
      {
        preHandler: autenticar,
        schema: { body: solicitarAdocaoEntrada, response: { 201: adocaoSaida } },
      },
      async (request, reply) => {
        const ator = atorDe(request);
        await aplicarLimite(deps.limitador, REGRAS.criacaoAdocaoPorUsuario, ator.id, reply);
        const { animalId, outrosAnimais, ...resto } = request.body;
        const adocao = await deps.solicitar.executar({
          ator,
          animalId,
          triagem: { ...resto, outrosAnimais: outrosAnimais ?? null },
        });
        return reply.code(201).send(adocao);
      },
    );

    app.get(
      '/me/adocoes',
      {
        preHandler: autenticar,
        schema: { querystring: paginaQuery, response: { 200: paginaAdocoesSaida } },
      },
      async (request) => {
        const { cursor, limite } = request.query;
        return pagina(
          await deps.listarMinhas.executar({
            ator: atorDe(request),
            ...(cursor ? { cursor } : {}),
            ...(limite !== undefined ? { limite } : {}),
          }),
        );
      },
    );

    app.get(
      '/adocoes/:id',
      { preHandler: autenticar, schema: { params: idParam, response: { 200: adocaoSaida } } },
      async (request) => deps.obter.executar({ ator: atorDe(request), id: request.params.id }),
    );

    await app.register(
      (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));

        admin.get(
          '/adocoes',
          { schema: { querystring: adminListagemQuery, response: { 200: paginaAdocoesSaida } } },
          async (request) => {
            const { status, animalId, de, ate, cursor, limite } = request.query;
            return pagina(
              await deps.adminListar.executar({
                ator: atorDe(request),
                ...(status ? { status } : {}),
                ...(animalId ? { animalId } : {}),
                ...(de ? { de: new Date(de) } : {}),
                ...(ate ? { ate: new Date(ate) } : {}),
                ...(cursor ? { cursor } : {}),
                ...(limite !== undefined ? { limite } : {}),
              }),
            );
          },
        );

        admin.get(
          '/adocoes/:id',
          { schema: { params: idParam, response: { 200: adocaoAdminSaida } } },
          async (request) =>
            deps.adminObter.executar({ ator: atorDe(request), id: request.params.id }),
        );

        admin.post(
          '/adocoes/:id/aprovar',
          { schema: { params: idParam, response: { 200: adocaoAdminSaida } } },
          async (request) =>
            deps.aprovar.executar({ ator: atorDe(request), id: request.params.id }),
        );

        admin.post(
          '/adocoes/:id/recusar',
          {
            schema: { params: idParam, body: recusarEntrada, response: { 200: adocaoAdminSaida } },
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
