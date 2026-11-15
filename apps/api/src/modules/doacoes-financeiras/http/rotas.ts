import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { STATUS_DOACAO_FINANCEIRA } from '@abraco/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { codificarCursor, cursorEsquema } from '../../../shared/http/cursor.js';
import { aplicarLimite } from '../../../shared/http/limite.js';
import { atorDe, type Autenticacao } from '../../auth/http/autenticacao.js';
import type { LimitadorTentativas, RegraLimite } from '../../auth/infrastructure/redis-auth.js';
import {
  LIMITE_PAGINA_PIX,
  type ConsultarStatusPix,
  type GerarPix,
  type ListarMinhasDoacoesFinanceiras,
  type ProcessarWebhookPix,
} from '../application/casos-de-uso.js';
import type { RepositorioDoacoesFinanceiras } from '../application/portas.js';
import type { GatewaySimulado } from '../infrastructure/gateway-simulado.js';

export const REGRAS_PIX = {
  // Seção 6: criação de doação, 10/hora por usuário (sem login: por IP).
  criacao: { nome: 'criacao-pix', maximo: 10, janelaSegundos: 3600 },
  // "Já paguei" repetido: cada toque reconsulta o PSP.
  consulta: { nome: 'consulta-pix', maximo: 20, janelaSegundos: 60 },
} as const satisfies Record<string, RegraLimite>;

export interface DependenciasRotasPix {
  readonly gerar: GerarPix;
  readonly consultar: ConsultarStatusPix;
  readonly listarMinhas: ListarMinhasDoacoesFinanceiras;
  readonly webhook: ProcessarWebhookPix;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
  readonly tokenWebhook: string;
  /** Presente SÓ com o PSP simulado fora de produção: habilita POST /dev/pix/{id}/pagar. */
  readonly simulador?: {
    readonly gateway: GatewaySimulado;
    readonly doacoes: RepositorioDoacoesFinanceiras;
  };
}

const doacaoSaida = z.object({
  id: z.uuid(),
  valor: z.string(),
  status: z.enum(STATUS_DOACAO_FINANCEIRA),
  anonima: z.boolean(),
  pixCopiaCola: z.string(),
  expiresAt: z.date(),
  paidAt: z.date().nullable(),
  criadoEm: z.date(),
});

const statusSaida = z.object({
  id: z.uuid(),
  status: z.enum(STATUS_DOACAO_FINANCEIRA),
  paidAt: z.date().nullable(),
});

/** Comparação em tempo constante (o hash iguala os tamanhos para o timingSafeEqual). */
export function tokensIguais(recebido: string | undefined, esperado: string): boolean {
  if (recebido === undefined) return false;
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

const tokenInvalido = () =>
  new ErroDominio('NAO_AUTENTICADO', 'WEBHOOK_NAO_AUTORIZADO', 'Webhook não autorizado');

export function rotasPix(deps: DependenciasRotasPix): FastifyPluginAsyncZod {
  const { autenticar, autenticarOpcional } = deps.autenticacao;

  return (app) => {
    app.post(
      '/doacoes-financeiras',
      {
        preHandler: autenticarOpcional,
        schema: {
          // Objeto NÃO estrito: a requisição tem vários outros headers.
          headers: z.object({
            'idempotency-key': z.uuid('Envie um UUID no header Idempotency-Key'),
          }),
          // Estrito: o app não escolhe status, pspTxId, valor pago…
          body: z.strictObject({
            valor: z.string().regex(/^\d{1,8}\.\d{2}$/, 'Use o formato 50.00'),
            anonima: z.boolean().default(false),
            nomeDoador: z.string().max(240).optional(),
            emailDoador: z.string().max(254).optional(),
          }),
          response: { 201: doacaoSaida },
        },
      },
      async (request, reply) => {
        const ator = request.claims ? atorDe(request) : undefined;
        await aplicarLimite(
          deps.limitador,
          REGRAS_PIX.criacao,
          ator ? `u:${ator.id}` : `ip:${request.ip}`,
          reply,
        );
        const { valor, anonima, nomeDoador, emailDoador } = request.body;
        const doacao = await deps.gerar.executar({
          ...(ator ? { ator } : {}),
          idempotencyKey: request.headers['idempotency-key'],
          valor,
          anonima,
          ...(nomeDoador !== undefined ? { nomeDoador } : {}),
          ...(emailDoador !== undefined ? { emailDoador } : {}),
        });
        return reply.code(201).send(doacao);
      },
    );

    app.get(
      '/doacoes-financeiras/:id/status',
      { schema: { params: z.strictObject({ id: z.uuid() }), response: { 200: statusSaida } } },
      async (request, reply) => {
        await aplicarLimite(
          deps.limitador,
          REGRAS_PIX.consulta,
          `${request.params.id}:${request.ip}`,
          reply,
        );
        return deps.consultar.executar({ id: request.params.id });
      },
    );

    app.get(
      '/me/doacoes-financeiras',
      {
        preHandler: autenticar,
        schema: {
          querystring: z.strictObject({
            cursor: cursorEsquema.optional(),
            limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_PIX.maximo).optional(),
          }),
          response: {
            200: z.object({ itens: z.array(doacaoSaida), proximoCursor: z.string().nullable() }),
          },
        },
      },
      async (request) => {
        const { cursor, limite } = request.query;
        const p = await deps.listarMinhas.executar({
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

    /**
     * Webhook do Asaas. O esquema NÃO é estrito (o Asaas manda dezenas de
     * campos): só o id do evento e o id da cobrança são lidos, e a cobrança é
     * sempre reconsultada no PSP.
     */
    app.post(
      '/webhooks/asaas',
      {
        schema: {
          body: z.looseObject({
            id: z.string().min(1).max(200),
            event: z.string().min(1).max(100),
            payment: z.looseObject({ id: z.string().min(1).max(100) }).optional(),
          }),
        },
      },
      async (request, reply) => {
        const token = request.headers['asaas-access-token'];
        if (!tokensIguais(typeof token === 'string' ? token : undefined, deps.tokenWebhook)) {
          throw tokenInvalido();
        }
        const resultado = await deps.webhook.executar({
          eventoId: request.body.id,
          tipo: request.body.event,
          pspTxId: request.body.payment?.id,
        });
        request.log.info({ evento: request.body.event, resultado }, 'webhook asaas');
        // 200 também para duplicados e ignorados: senão o Asaas reenvia sem parar.
        return reply.code(200).send({ recebido: true });
      },
    );

    const simulador = deps.simulador;
    if (simulador) {
      // Só existe com o PSP simulado (nunca em produção): "o doador pagou o Pix".
      app.post(
        '/dev/pix/:id/pagar',
        { schema: { params: z.strictObject({ id: z.uuid() }) } },
        async (request, reply) => {
          const doacao = await simulador.doacoes.buscar(request.params.id);
          if (!doacao || !simulador.gateway.simularPagamento(doacao.pspTxId)) {
            throw new ErroDominio(
              'NAO_ENCONTRADO',
              'COBRANCA_SIMULADA_NAO_ENCONTRADA',
              'Cobrança simulada não encontrada (a API reiniciou?) ou cancelada',
            );
          }
          // Mesmo caminho de um webhook real do Asaas.
          const resultado = await deps.webhook.executar({
            eventoId: `simulado_${randomUUID()}`,
            tipo: 'PAYMENT_RECEIVED',
            pspTxId: doacao.pspTxId,
          });
          return reply.code(200).send({ resultado });
        },
      );
    }

    return Promise.resolve();
  };
}
