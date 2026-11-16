import multipart from '@fastify/multipart';
import { UPLOAD_IMAGENS } from '@abraco/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { fotoSaida } from '../../animais/http/esquemas.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import {
  LEGENDA_MAX,
  LIMITE_PAGINA_POSTS,
  type AdminListarPosts,
  type CriarPost,
  type Curtir,
  type EditarPost,
  type ListarPosts,
  type ObterPost,
  type PublicarPost,
  type RemoverPost,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasFeed {
  readonly listar: ListarPosts;
  readonly obter: ObterPost;
  readonly curtir: Curtir;
  readonly adminListar: AdminListarPosts;
  readonly criar: CriarPost;
  readonly editar: EditarPost;
  readonly publicar: PublicarPost;
  readonly remover: RemoverPost;
  readonly autenticacao: Autenticacao;
}

const postSaida = z.object({
  id: z.uuid(),
  legenda: z.string(),
  imagens: z.array(fotoSaida),
  totalCurtidas: z.number().int(),
  curtidoPorMim: z.boolean(),
  publicado: z.boolean().optional(),
  criadoEm: z.date(),
});

const paginaSaida = z.object({ itens: z.array(postSaida), proximoCursor: z.string().nullable() });
const paginaQuery = z.strictObject({
  cursor: cursorEsquema.optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_POSTS.maximo).optional(),
});
const idParam = z.strictObject({ id: z.uuid() });

const invalida = (mensagem: string, campo?: string) =>
  new ErroDominio('REQUISICAO_INVALIDA', 'REQUISICAO_INVALIDA', mensagem, campo);

/** multipart: `legenda` (texto) + `imagens` (arquivos). */
async function lerPost(request: FastifyRequest) {
  if (!request.isMultipart()) throw invalida('Envie o post como multipart/form-data');
  let legenda: string | undefined;
  const arquivos: Buffer[] = [];
  for await (const parte of request.parts()) {
    if (parte.type === 'file') {
      if (parte.fieldname !== 'imagens') {
        parte.file.resume();
        throw invalida('Envie as imagens no campo "imagens"', 'imagens');
      }
      arquivos.push(await parte.toBuffer());
    } else {
      if (parte.fieldname !== 'legenda' || legenda !== undefined) {
        throw invalida('Campo de formulário inesperado', parte.fieldname);
      }
      legenda = String(parte.value);
    }
  }
  if (legenda === undefined) throw invalida('O campo "legenda" é obrigatório', 'legenda');
  return { legenda, arquivos };
}

const pagina = (p: {
  itens: z.infer<typeof postSaida>[];
  proximoCursor: { criadoEm: Date; publicId: string } | null;
}) => ({
  itens: p.itens,
  proximoCursor: p.proximoCursor ? codificarCursor(p.proximoCursor) : null,
});

export function rotasFeed(deps: DependenciasRotasFeed): FastifyPluginAsyncZod {
  const { autenticar, autenticarOpcional, exigirRole } = deps.autenticacao;

  return async (app) => {
    app.get(
      '/posts',
      {
        preHandler: autenticarOpcional,
        schema: { querystring: paginaQuery, response: { 200: paginaSaida } },
      },
      async (request) => {
        const { cursor, limite } = request.query;
        return pagina(
          await deps.listar.executar({
            ...(request.claims ? { ator: atorDe(request) } : {}),
            ...(cursor ? { cursor } : {}),
            ...(limite !== undefined ? { limite } : {}),
          }),
        );
      },
    );

    app.get(
      '/posts/:id',
      { preHandler: autenticarOpcional, schema: { params: idParam, response: { 200: postSaida } } },
      async (request) =>
        deps.obter.executar({
          ...(request.claims ? { ator: atorDe(request) } : {}),
          id: request.params.id,
        }),
    );

    for (const [metodo, curtir] of [
      ['POST', true],
      ['DELETE', false],
    ] as const) {
      app.route({
        method: metodo,
        url: '/posts/:id/curtida',
        preHandler: autenticar,
        schema: { params: idParam },
        handler: async (request, reply) => {
          await deps.curtir.executar({ ator: atorDe(request), id: request.params.id, curtir });
          return reply.code(204).send();
        },
      });
    }

    await app.register(
      async (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));
        await admin.register(multipart, {
          limits: {
            fileSize: UPLOAD_IMAGENS.tamanhoMaximoBytes,
            files: UPLOAD_IMAGENS.arquivosPorEnvio,
            fields: 1,
            fieldSize: LEGENDA_MAX * 4,
            parts: UPLOAD_IMAGENS.arquivosPorEnvio + 1,
            fieldNameSize: 50,
            headerPairs: 20,
          },
        });

        admin.get(
          '/posts',
          { schema: { querystring: paginaQuery, response: { 200: paginaSaida } } },
          async (request) => {
            const { cursor, limite } = request.query;
            return pagina(
              await deps.adminListar.executar({
                ator: atorDe(request),
                ...(cursor ? { cursor } : {}),
                ...(limite !== undefined ? { limite } : {}),
              }),
            );
          },
        );

        admin.post(
          '/posts',
          { schema: { response: { 201: postSaida } } },
          async (request, reply) => {
            const { legenda, arquivos } = await lerPost(request);
            return reply
              .code(201)
              .send(await deps.criar.executar({ ator: atorDe(request), legenda, arquivos }));
          },
        );

        admin.patch(
          '/posts/:id',
          {
            schema: {
              params: idParam,
              body: z.strictObject({ legenda: z.string().max(LEGENDA_MAX * 2) }),
              response: { 200: postSaida },
            },
          },
          async (request) =>
            deps.editar.executar({
              ator: atorDe(request),
              id: request.params.id,
              legenda: request.body.legenda,
            }),
        );

        admin.put(
          '/posts/:id/publicacao',
          { schema: { params: idParam, body: z.strictObject({ publicado: z.boolean() }) } },
          async (request, reply) => {
            await deps.publicar.executar({
              ator: atorDe(request),
              id: request.params.id,
              publicado: request.body.publicado,
            });
            return reply.code(204).send();
          },
        );

        admin.delete('/posts/:id', { schema: { params: idParam } }, async (request, reply) => {
          await deps.remover.executar({ ator: atorDe(request), id: request.params.id });
          return reply.code(204).send();
        });
      },
      { prefix: '/admin' },
    );
  };
}
