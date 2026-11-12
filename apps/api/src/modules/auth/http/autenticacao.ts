import type { Role } from '@abraco/shared';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { ClaimsAcesso, EmissorTokens, ListaRevogacao } from '../application/portas.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo preHandler `autenticar`. */
    claims?: ClaimsAcesso;
  }
}

const naoAutenticado = () =>
  new ErroDominio('NAO_AUTENTICADO', 'TOKEN_INVALIDO', 'Sessão inválida ou expirada');

export interface Autenticacao {
  /** Exige access token válido e não revogado. */
  readonly autenticar: preHandlerAsyncHookHandler;
  /** Exige uma das roles (use depois de `autenticar`). Proteção real, não só UX. */
  exigirRole(...roles: Role[]): preHandlerAsyncHookHandler;
}

export function criarAutenticacao(tokens: EmissorTokens, revogacao: ListaRevogacao): Autenticacao {
  const autenticar: preHandlerAsyncHookHandler = async (request) => {
    const cabecalho = request.headers.authorization;
    const [esquema, token] = cabecalho?.split(' ') ?? [];
    if (esquema !== 'Bearer' || !token) throw naoAutenticado();

    const claims = tokens.verificarAcesso(token);
    if (await revogacao.estaRevogado(claims.jti, claims.sid)) throw naoAutenticado();
    request.claims = claims;
  };

  return {
    autenticar,
    exigirRole:
      (...roles) =>
      async (request) => {
        const claims = request.claims;
        if (!claims) throw naoAutenticado();
        if (!roles.includes(claims.role)) {
          throw new ErroDominio('PROIBIDO', 'ACESSO_NEGADO', 'Você não tem permissão para isso');
        }
        await Promise.resolve();
      },
  };
}

/** Lê os claims numa rota protegida (garantidos pelo preHandler). */
export function claimsDe(request: FastifyRequest): ClaimsAcesso {
  if (!request.claims) throw naoAutenticado();
  return request.claims;
}
