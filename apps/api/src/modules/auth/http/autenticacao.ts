import type { Role } from '@abraco/shared';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
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
  /**
   * Rotas públicas que mudam conforme quem pede (ex.: listagem de animais).
   * Sem Authorization = anônimo; com token inválido = 401 (nunca rebaixa em
   * silêncio, o que esconderia um app com sessão quebrada).
   */
  readonly autenticarOpcional: preHandlerAsyncHookHandler;
  /** Exige uma das roles (use depois de `autenticar`). Proteção real, não só UX. */
  readonly exigirRole: (...roles: Role[]) => preHandlerAsyncHookHandler;
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

  const autenticarOpcional: preHandlerAsyncHookHandler = async function (request, reply) {
    if (request.headers.authorization === undefined) return;
    await autenticar.call(this, request, reply);
  };

  return {
    autenticar,
    autenticarOpcional,
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

/** Quem está chamando, no formato dos casos de uso. */
export function atorDe(request: FastifyRequest): Ator {
  const claims = claimsDe(request);
  return { id: claims.sub, role: claims.role };
}
