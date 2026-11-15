import { SECOES_PERFIL_ONG } from '@abraco/shared';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import {
  LIMITES_INSTITUCIONAL,
  type AdminListarFaq,
  type AdminListarSecoes,
  type AtualizarFaq,
  type CriarFaq,
  type EditarSecao,
  type ListarFaq,
  type ObterPerfilOng,
  type RemoverFaq,
  type ReordenarFaq,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasInstitucional {
  readonly perfil: ObterPerfilOng;
  readonly faq: ListarFaq;
  readonly adminSecoes: AdminListarSecoes;
  readonly editarSecao: EditarSecao;
  readonly adminFaq: AdminListarFaq;
  readonly criarFaq: CriarFaq;
  readonly atualizarFaq: AtualizarFaq;
  readonly removerFaq: RemoverFaq;
  readonly reordenarFaq: ReordenarFaq;
  readonly autenticacao: Autenticacao;
}

const secaoSaida = z.object({
  secao: z.enum(SECOES_PERFIL_ONG),
  titulo: z.string(),
  conteudo: z.string(),
  publicado: z.boolean(),
  atualizadoEm: z.date(),
});

const faqSaida = z.object({
  id: z.uuid(),
  pergunta: z.string(),
  resposta: z.string(),
  ordem: z.number().int(),
  publicado: z.boolean(),
});

const faqEntrada = z.strictObject({
  pergunta: z.string().max(LIMITES_INSTITUCIONAL.pergunta * 2),
  resposta: z.string().max(LIMITES_INSTITUCIONAL.resposta * 2),
  publicado: z.boolean().optional(),
});

const idParam = z.strictObject({ id: z.uuid() });

/** Conteúdo público que muda pouco: o app (e um CDN) pode reaproveitar por 5 min. */
const CACHE_PUBLICO = 'public, max-age=300';

export function rotasInstitucional(deps: DependenciasRotasInstitucional): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return async (app) => {
    app.get(
      '/institucional/perfil',
      { schema: { response: { 200: z.array(secaoSaida) } } },
      async (_request, reply) => {
        void reply.header('cache-control', CACHE_PUBLICO);
        return deps.perfil.executar();
      },
    );

    app.get(
      '/institucional/faq',
      { schema: { response: { 200: z.array(faqSaida) } } },
      async (_request, reply) => {
        void reply.header('cache-control', CACHE_PUBLICO);
        return deps.faq.executar();
      },
    );

    await app.register(
      (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));

        admin.get(
          '/perfil-ong',
          { schema: { response: { 200: z.array(secaoSaida) } } },
          async (request) => deps.adminSecoes.executar({ ator: atorDe(request) }),
        );

        admin.put(
          '/perfil-ong/:secao',
          {
            schema: {
              params: z.strictObject({ secao: z.enum(SECOES_PERFIL_ONG) }),
              body: z.strictObject({
                titulo: z.string().max(LIMITES_INSTITUCIONAL.titulo * 2),
                conteudo: z.string().max(LIMITES_INSTITUCIONAL.conteudo * 2),
                publicado: z.boolean().optional(),
              }),
              response: { 200: secaoSaida },
            },
          },
          async (request) =>
            deps.editarSecao.executar({
              ator: atorDe(request),
              secao: request.params.secao,
              ...request.body,
            }),
        );

        admin.get('/faq', { schema: { response: { 200: z.array(faqSaida) } } }, async (request) =>
          deps.adminFaq.executar({ ator: atorDe(request) }),
        );

        admin.post(
          '/faq',
          { schema: { body: faqEntrada, response: { 201: faqSaida } } },
          async (request, reply) =>
            reply
              .code(201)
              .send(await deps.criarFaq.executar({ ator: atorDe(request), ...request.body })),
        );

        admin.put(
          '/faq/ordem',
          { schema: { body: z.strictObject({ ids: z.array(z.uuid()).min(1).max(500) }) } },
          async (request, reply) => {
            await deps.reordenarFaq.executar({ ator: atorDe(request), ids: request.body.ids });
            return reply.code(204).send();
          },
        );

        admin.put(
          '/faq/:id',
          { schema: { params: idParam, body: faqEntrada, response: { 200: faqSaida } } },
          async (request) =>
            deps.atualizarFaq.executar({
              ator: atorDe(request),
              id: request.params.id,
              ...request.body,
            }),
        );

        admin.delete('/faq/:id', { schema: { params: idParam } }, async (request, reply) => {
          await deps.removerFaq.executar({ ator: atorDe(request), id: request.params.id });
          return reply.code(204).send();
        });
        return Promise.resolve();
      },
      { prefix: '/admin' },
    );
  };
}
