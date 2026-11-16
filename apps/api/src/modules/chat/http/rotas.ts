import { STATUS_CONVERSA } from '@abraco/shared';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { aplicarLimite } from '../../../shared/http/limite.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type { LimitadorTentativas } from '../../auth/infrastructure/redis-auth.js';
import {
  LIMITE_PAGINA_CHAT,
  LIMITES_CHAT,
  type AbrirConversa,
  type AdminListarConversas,
  type AssumirConversa,
  type CursorConversas,
  type EncerrarConversa,
  type EnviarMensagem,
  type ListarMensagens,
  type ListarMinhasConversas,
  type MarcarMensagensLidas,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasChat {
  readonly abrir: AbrirConversa;
  readonly minhas: ListarMinhasConversas;
  readonly mensagens: ListarMensagens;
  readonly enviar: EnviarMensagem;
  readonly lidas: MarcarMensagensLidas;
  readonly adminListar: AdminListarConversas;
  readonly assumir: AssumirConversa;
  readonly encerrar: EncerrarConversa;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

const REGRAS = {
  abrir: { nome: 'chat-abrir', maximo: 5, janelaSegundos: 3600 },
  mensagem: { nome: 'chat-mensagem', maximo: 30, janelaSegundos: 60 },
} as const;

/** Cursor do chat: base64url de [data, uuid] (mesmo formato dos outros cursores). */
const cursorChat = z
  .string()
  .max(200)
  .transform((valor, ctx): CursorConversas => {
    try {
      const [data, publicId] = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as [
        string,
        string,
      ];
      const r = z.tuple([z.iso.datetime(), z.uuid()]).parse([data, publicId]);
      return { data: new Date(r[0]), publicId: r[1] };
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Cursor inválido' });
      return z.NEVER;
    }
  });

const codificar = (c: CursorConversas | null) =>
  c ? Buffer.from(JSON.stringify([c.data.toISOString(), c.publicId])).toString('base64url') : null;

const mensagemSaida = z.object({
  id: z.uuid(),
  conteudo: z.string(),
  autorEhEquipe: z.boolean(),
  lida: z.boolean(),
  lidaEm: z.date().nullable(),
  criadoEm: z.date(),
});

const conversaSaida = z.object({
  id: z.uuid(),
  assunto: z.string().nullable(),
  status: z.enum(STATUS_CONVERSA),
  atendente: z.string().nullable(),
  ultimaMensagem: mensagemSaida.nullable(),
  naoLidas: z.number().int(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  usuario: z.object({ id: z.uuid(), nome: z.string() }).optional(),
});

const idParam = z.strictObject({ id: z.uuid() });

export function rotasChat(deps: DependenciasRotasChat): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return async (app) => {
    await app.register((escopo) => {
      const r = escopo.withTypeProvider<ZodTypeProvider>();
      r.addHook('preHandler', autenticar);

      r.get(
        '/conversas',
        { schema: { response: { 200: z.array(conversaSaida) } } },
        async (request) => deps.minhas.executar({ ator: atorDe(request) }),
      );

      r.post(
        '/conversas',
        {
          schema: {
            body: z.strictObject({
              assunto: z
                .string()
                .max(LIMITES_CHAT.assunto * 2)
                .nullish(),
              mensagem: z.string().max(LIMITES_CHAT.mensagem * 2),
            }),
            response: { 201: conversaSaida },
          },
        },
        async (request, reply) => {
          const ator = atorDe(request);
          await aplicarLimite(deps.limitador, REGRAS.abrir, ator.id, reply);
          const c = await deps.abrir.executar({
            ator,
            mensagem: request.body.mensagem,
            assunto: request.body.assunto ?? null,
          });
          return reply.code(201).send(c);
        },
      );

      r.get(
        '/conversas/:id/mensagens',
        {
          schema: {
            params: idParam,
            querystring: z.strictObject({
              cursor: cursorChat.optional(),
              limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_CHAT.maximo).optional(),
            }),
            response: {
              200: z.object({
                itens: z.array(mensagemSaida),
                proximoCursor: z.string().nullable(),
              }),
            },
          },
        },
        async (request) => {
          const { cursor, limite } = request.query;
          const p = await deps.mensagens.executar({
            ator: atorDe(request),
            id: request.params.id,
            ...(cursor ? { cursor } : {}),
            ...(limite !== undefined ? { limite } : {}),
          });
          return { itens: p.itens, proximoCursor: codificar(p.proximoCursor) };
        },
      );

      r.post(
        '/conversas/:id/mensagens',
        {
          schema: {
            params: idParam,
            body: z.strictObject({ conteudo: z.string().max(LIMITES_CHAT.mensagem * 2) }),
            response: { 201: mensagemSaida },
          },
        },
        async (request, reply) => {
          const ator = atorDe(request);
          await aplicarLimite(deps.limitador, REGRAS.mensagem, ator.id, reply);
          const m = await deps.enviar.executar({
            ator,
            id: request.params.id,
            conteudo: request.body.conteudo,
          });
          return reply.code(201).send(m);
        },
      );

      r.post(
        '/conversas/:id/lidas',
        { schema: { params: idParam, body: z.strictObject({ ateMensagemId: z.uuid() }) } },
        async (request, reply) => {
          await deps.lidas.executar({
            ator: atorDe(request),
            id: request.params.id,
            ateMensagemId: request.body.ateMensagemId,
          });
          return reply.code(204).send();
        },
      );
      return Promise.resolve();
    });

    await app.register(
      (escopo) => {
        const admin = escopo.withTypeProvider<ZodTypeProvider>();
        admin.addHook('preHandler', autenticar);
        admin.addHook('preHandler', exigirRole('ADMIN'));

        admin.get(
          '/conversas',
          {
            schema: {
              querystring: z.strictObject({
                status: z.enum(STATUS_CONVERSA).optional(),
                cursor: cursorChat.optional(),
                limite: z.coerce.number().int().min(1).max(50).optional(),
              }),
              response: {
                200: z.object({
                  itens: z.array(conversaSaida),
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
            return { itens: p.itens, proximoCursor: codificar(p.proximoCursor) };
          },
        );

        for (const [acao, uc] of [
          ['assumir', deps.assumir],
          ['encerrar', deps.encerrar],
        ] as const) {
          admin.post(
            `/conversas/:id/${acao}`,
            { schema: { params: idParam } },
            async (request, reply) => {
              await uc.executar({ ator: atorDe(request), id: request.params.id });
              return reply.code(204).send();
            },
          );
        }
        return Promise.resolve();
      },
      { prefix: '/admin' },
    );
  };
}
