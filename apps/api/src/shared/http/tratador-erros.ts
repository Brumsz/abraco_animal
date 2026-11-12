import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

import { ErroDominio, type TipoErro } from '../dominio/erros.js';

const STATUS: Record<TipoErro, number> = {
  VALIDACAO: 422,
  NAO_AUTENTICADO: 401,
  PROIBIDO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  REGRA_NEGOCIO: 422,
  LIMITE_EXCEDIDO: 429,
};

const TITULOS: Record<number, string> = {
  400: 'Requisição inválida',
  401: 'Não autenticado',
  403: 'Acesso negado',
  404: 'Não encontrado',
  409: 'Conflito',
  413: 'Conteúdo grande demais',
  422: 'Dados inválidos',
  429: 'Muitas tentativas',
  500: 'Erro interno',
};

const tipoUri = (codigo: string) => `https://abracoanimal.org.br/erros/${codigo.toLowerCase()}`;

/**
 * Converte qualquer erro em application/problem+json (RFC 9457).
 * Erros inesperados viram 500 genérico: detalhes só no log.
 */
export function registrarTratadorErros(app: FastifyInstance): void {
  app.setErrorHandler((erro: FastifyError | ErroDominio, request, reply) => {
    void reply.type('application/problem+json');

    if (erro instanceof ErroDominio) {
      const status = STATUS[erro.tipo];
      return reply.code(status).send({
        type: tipoUri(erro.codigo),
        title: TITULOS[status],
        status,
        detail: erro.message,
        codigo: erro.codigo,
        ...(erro.campo ? { erros: [{ campo: erro.campo, mensagem: erro.message }] } : {}),
      });
    }

    if (hasZodFastifySchemaValidationErrors(erro)) {
      return reply.code(400).send({
        type: tipoUri('REQUISICAO_INVALIDA'),
        title: TITULOS[400],
        status: 400,
        detail: 'Verifique os campos enviados',
        codigo: 'REQUISICAO_INVALIDA',
        erros: erro.validation.map((v) => ({
          campo: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          mensagem: v.message ?? 'inválido',
        })),
      });
    }

    const status =
      erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 500 ? erro.statusCode : 500;
    if (status === 500) request.log.error({ err: erro }, 'erro não tratado');

    const codigo =
      status === 429 ? 'LIMITE_EXCEDIDO' : status === 500 ? 'ERRO_INTERNO' : 'REQUISICAO_INVALIDA';
    return reply.code(status).send({
      type: tipoUri(codigo),
      title: TITULOS[status] ?? 'Erro',
      status,
      // Mensagens de erros 4xx do Fastify são seguras; 500 nunca expõe detalhes.
      detail: status === 500 ? 'Ocorreu um erro inesperado. Tente novamente.' : erro.message,
      codigo,
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply
      .code(404)
      .type('application/problem+json')
      .send({
        type: tipoUri('ROTA_NAO_ENCONTRADA'),
        title: TITULOS[404],
        status: 404,
        codigo: 'ROTA_NAO_ENCONTRADA',
      }),
  );
}
