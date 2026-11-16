import { ROLES } from '@abraco/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type {
  AdminListarUsuarios,
  AlterarAtivoUsuario,
  AlterarRoleUsuario,
  ConsultarAuditoria,
  CursorPainel,
  ObterDashboard,
} from '../application/casos-de-uso.js';

export interface DependenciasRotasAdmin {
  readonly dashboard: ObterDashboard;
  readonly listarUsuarios: AdminListarUsuarios;
  readonly alterarAtivo: AlterarAtivoUsuario;
  readonly alterarRole: AlterarRoleUsuario;
  readonly auditoria: ConsultarAuditoria;
  readonly autenticacao: Autenticacao;
}

const limite = z.coerce.number().int().min(1).max(50).optional();
const idParam = z.strictObject({ id: z.uuid() });
const codificar = (c: CursorPainel | null) => (c ? codificarCursor(c) : null);

const dashboardSaida = z.object({
  adocoesPendentes: z.number().int(),
  doacoesAnimaisPendentes: z.number().int(),
  animaisDisponiveis: z.number().int(),
  doacoesFinanceirasMes: z.object({ quantidade: z.number().int(), total: z.string() }),
  adocoesPorMes: z.array(z.object({ mes: z.string(), total: z.number().int() })),
  ultimasPendencias: z.array(
    z.object({
      tipo: z.enum(['ADOCAO', 'DOACAO_ANIMAL', 'CANDIDATURA_VOLUNTARIO']),
      id: z.uuid(),
      titulo: z.string(),
      criadoEm: z.date(),
    }),
  ),
});

const usuarioSaida = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string(),
  role: z.enum(ROLES),
  ativo: z.boolean(),
  cidade: z.string(),
  uf: z.string(),
  criadoEm: z.date(),
});

const auditoriaSaida = z.object({
  id: z.uuid(),
  admin: z.object({ id: z.uuid(), nome: z.string() }),
  acao: z.string(),
  entidade: z.string(),
  entidadeId: z.string(),
  detalhe: z.unknown(),
  criadoEm: z.date(),
});

export function rotasAdmin(deps: DependenciasRotasAdmin): FastifyPluginAsyncZod {
  const { autenticar, exigirRole } = deps.autenticacao;

  return (app) => {
    // Escopo inteiro: só ADMIN (e cada caso de uso confere de novo).
    app.addHook('preHandler', autenticar);
    app.addHook('preHandler', exigirRole('ADMIN'));

    app.get('/dashboard', { schema: { response: { 200: dashboardSaida } } }, async (request) =>
      deps.dashboard.executar({ ator: atorDe(request) }),
    );

    app.get(
      '/usuarios',
      {
        schema: {
          querystring: z.strictObject({
            role: z.enum(ROLES).optional(),
            q: z.string().max(80).optional(),
            cursor: cursorEsquema.optional(),
            limite,
          }),
          response: {
            200: z.object({ itens: z.array(usuarioSaida), proximoCursor: z.string().nullable() }),
          },
        },
      },
      async (request) => {
        const { role, q, cursor, limite: n } = request.query;
        const p = await deps.listarUsuarios.executar({
          ator: atorDe(request),
          ...(role ? { role } : {}),
          ...(q !== undefined ? { q } : {}),
          ...(cursor ? { cursor } : {}),
          ...(n !== undefined ? { limite: n } : {}),
        });
        return { itens: p.itens, proximoCursor: codificar(p.proximoCursor) };
      },
    );

    app.patch(
      '/usuarios/:id/ativo',
      { schema: { params: idParam, body: z.strictObject({ ativo: z.boolean() }) } },
      async (request, reply) => {
        await deps.alterarAtivo.executar({
          ator: atorDe(request),
          id: request.params.id,
          ativo: request.body.ativo,
        });
        return reply.code(204).send();
      },
    );

    app.patch(
      '/usuarios/:id/role',
      // ADMIN fora da lista: promoção a administrador não existe no app.
      {
        schema: {
          params: idParam,
          body: z.strictObject({ role: z.enum(['USUARIO', 'VOLUNTARIO']) }),
        },
      },
      async (request, reply) => {
        await deps.alterarRole.executar({
          ator: atorDe(request),
          id: request.params.id,
          role: request.body.role,
        });
        return reply.code(204).send();
      },
    );

    app.get(
      '/auditoria',
      {
        schema: {
          querystring: z
            .strictObject({
              adminId: z.uuid().optional(),
              entidade: z.string().max(40).optional(),
              acao: z.string().max(60).optional(),
              de: z.iso.datetime({ offset: true }).optional(),
              ate: z.iso.datetime({ offset: true }).optional(),
              cursor: cursorEsquema.optional(),
              limite,
            })
            .refine((q) => !q.de || !q.ate || Date.parse(q.de) < Date.parse(q.ate), {
              message: '"de" deve ser anterior a "ate"',
              path: ['ate'],
            }),
          response: {
            200: z.object({ itens: z.array(auditoriaSaida), proximoCursor: z.string().nullable() }),
          },
        },
      },
      async (request) => {
        const { adminId, entidade, acao, de, ate, cursor, limite: n } = request.query;
        const p = await deps.auditoria.executar({
          ator: atorDe(request),
          ...(adminId ? { adminId } : {}),
          ...(entidade ? { entidade } : {}),
          ...(acao ? { acao } : {}),
          ...(de ? { de: new Date(de) } : {}),
          ...(ate ? { ate: new Date(ate) } : {}),
          ...(cursor ? { cursor } : {}),
          ...(n !== undefined ? { limite: n } : {}),
        });
        return { itens: p.itens, proximoCursor: codificar(p.proximoCursor) };
      },
    );

    return Promise.resolve();
  };
}
