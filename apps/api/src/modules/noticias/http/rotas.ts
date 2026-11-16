import multipart from '@fastify/multipart';
import { UPLOAD_IMAGENS } from '@abraco/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import {
  LIMITE_PAGINA_NOTICIAS,
  LIMITES_NOTICIA,
  type AdminListarNoticias,
  type AdminObterNoticia,
  type CriarNoticia,
  type DefinirCapaNoticia,
  type EditarNoticia,
  type ListarNoticias,
  type ObterNoticia,
  type PublicarNoticia,
  type RemoverNoticia,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasNoticias {
  readonly listar: ListarNoticias;
  readonly obter: ObterNoticia;
  readonly adminListar: AdminListarNoticias;
  readonly adminObter: AdminObterNoticia;
  readonly criar: CriarNoticia;
  readonly editar: EditarNoticia;
  readonly publicar: PublicarNoticia;
  readonly capa: DefinirCapaNoticia;
  readonly remover: RemoverNoticia;
  readonly autenticacao: Autenticacao;
}

const noticiaSaida = z.object({
  id: z.uuid(),
  slug: z.string(),
  titulo: z.string(),
  resumo: z.string(),
  conteudo: z.string().optional(),
  imagem: z.url().nullable(),
  publicado: z.boolean(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
});

const paginaSaida = z.object({
  itens: z.array(noticiaSaida),
  proximoCursor: z.string().nullable(),
});
const limite = z.coerce.number().int().min(1).max(LIMITE_PAGINA_NOTICIAS.maximo).optional();
const idParam = z.strictObject({ id: z.uuid() });

const noticiaEntrada = z.strictObject({
  titulo: z.string().max(LIMITES_NOTICIA.titulo * 2),
  resumo: z.string().max(LIMITES_NOTICIA.resumo * 2),
  conteudo: z.string().max(LIMITES_NOTICIA.conteudo * 2),
  slug: z.string().max(100).optional(),
});

const pagina = (p: {
  itens: z.infer<typeof noticiaSaida>[];
  proximoCursor: { criadoEm: Date; publicId: string } | null;
}) => ({
  itens: p.itens,
  proximoCursor: p.proximoCursor ? codificarCursor(p.proximoCursor) : null,
});

async function lerCapa(request: FastifyRequest): Promise<Buffer> {
  if (!request.isMultipart()) {
    throw new ErroDominio(
      'REQUISICAO_INVALIDA',
      'REQUISICAO_INVALIDA',
      'Envie a capa como multipart/form-data',
    );
  }
  const parte = await request.file();
  if (parte?.fieldname !== 'imagem') {
    parte?.file.resume();
    throw new ErroDominio(
      'REQUISICAO_INVALIDA',
      'REQUISICAO_INVALIDA',
      'Envie a imagem no campo "imagem"',
      'imagem',
    );
  }
  return parte.toBuffer();
}

export function rotasNoticias(deps: DependenciasRotasNoticias): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return async (app) => {
    app.get(
      '/noticias',
      {
        schema: {
          querystring: z.strictObject({ cursor: cursorEsquema.optional(), limite }),
          response: { 200: paginaSaida },
        },
      },
      async (request) => {
        const { cursor, limite: n } = request.query;
        return pagina(
          await deps.listar.executar({
            ...(cursor ? { cursor } : {}),
            ...(n !== undefined ? { limite: n } : {}),
          }),
        );
      },
    );

    app.get(
      '/noticias/:slug',
      {
        schema: {
          params: z.strictObject({ slug: z.string().regex(/^[a-z0-9-]{1,100}$/) }),
          response: { 200: noticiaSaida },
        },
      },
      async (request) => deps.obter.executar({ slug: request.params.slug }),
    );

    await app.register(
      async (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));
        await admin.register(multipart, {
          limits: {
            fileSize: UPLOAD_IMAGENS.tamanhoMaximoBytes,
            files: 1,
            fields: 0,
            parts: 1,
            fieldNameSize: 50,
            headerPairs: 20,
          },
        });

        admin.get(
          '/noticias',
          {
            schema: {
              querystring: z.strictObject({
                publicado: z.enum(['true', 'false']).optional(),
                cursor: cursorEsquema.optional(),
                limite,
              }),
              response: { 200: paginaSaida },
            },
          },
          async (request) => {
            const { publicado, cursor, limite: n } = request.query;
            return pagina(
              await deps.adminListar.executar({
                ator: atorDe(request),
                ...(publicado ? { publicado: publicado === 'true' } : {}),
                ...(cursor ? { cursor } : {}),
                ...(n !== undefined ? { limite: n } : {}),
              }),
            );
          },
        );

        admin.get(
          '/noticias/:id',
          { schema: { params: idParam, response: { 200: noticiaSaida } } },
          async (request) =>
            deps.adminObter.executar({ ator: atorDe(request), id: request.params.id }),
        );

        admin.post(
          '/noticias',
          { schema: { body: noticiaEntrada, response: { 201: noticiaSaida } } },
          async (request, reply) =>
            reply
              .code(201)
              .send(await deps.criar.executar({ ator: atorDe(request), ...request.body })),
        );

        admin.put(
          '/noticias/:id',
          { schema: { params: idParam, body: noticiaEntrada, response: { 200: noticiaSaida } } },
          async (request) =>
            deps.editar.executar({ ator: atorDe(request), id: request.params.id, ...request.body }),
        );

        admin.put(
          '/noticias/:id/publicacao',
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

        admin.put(
          '/noticias/:id/imagem',
          { schema: { params: idParam, response: { 200: noticiaSaida } } },
          async (request) =>
            deps.capa.executar({
              ator: atorDe(request),
              id: request.params.id,
              arquivo: await lerCapa(request),
            }),
        );

        admin.delete(
          '/noticias/:id/imagem',
          { schema: { params: idParam, response: { 200: noticiaSaida } } },
          async (request) =>
            deps.capa.executar({ ator: atorDe(request), id: request.params.id, arquivo: null }),
        );

        admin.delete('/noticias/:id', { schema: { params: idParam } }, async (request, reply) => {
          await deps.remover.executar({ ator: atorDe(request), id: request.params.id });
          return reply.code(204).send();
        });
      },
      { prefix: '/admin' },
    );
  };
}
