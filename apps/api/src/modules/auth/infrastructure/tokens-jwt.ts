import { randomUUID } from 'node:crypto';

import { ROLES, type Role } from '@abraco/shared';
import { createSigner, createVerifier } from 'fast-jwt';

import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { ClaimsAcesso, EmissorTokens } from '../application/portas.js';

export interface ConfigJwt {
  readonly chavePrivadaPem: string;
  readonly chavePublicaPem: string;
  readonly emissor: string;
  readonly audiencia: string;
  readonly ttlSegundos: number;
}

const tokenInvalido = () =>
  new ErroDominio('NAO_AUTENTICADO', 'TOKEN_INVALIDO', 'Sessão inválida ou expirada');

/**
 * Access tokens EdDSA (Ed25519) com fast-jwt — o mesmo motor do @fastify/jwt,
 * usado direto para manter o adaptador independente do Fastify.
 *
 * Verificação (seção 6): algoritmo fixo em EdDSA (alg "none" e HS* recusados),
 * iss/aud conferidos, sub/sid/jti/role/iat/exp obrigatórios.
 */
export class TokensJwt implements EmissorTokens {
  readonly ttlAcessoSegundos: number;
  private readonly assinar: (payload: Record<string, unknown>) => string;
  private readonly verificar: (token: string) => unknown;

  constructor(
    config: ConfigJwt,
    private readonly relogio: Relogio,
  ) {
    this.ttlAcessoSegundos = config.ttlSegundos;

    // iat/exp vão explícitos no payload, calculados com o relógio injetável
    // (o fast-jwt preserva os valores enviados; NÃO usar noTimestamp, que remove o iat).
    this.assinar = createSigner({
      key: config.chavePrivadaPem,
      algorithm: 'EdDSA',
      iss: config.emissor,
      aud: config.audiencia,
    });

    this.verificar = createVerifier({
      key: config.chavePublicaPem,
      algorithms: ['EdDSA'],
      allowedIss: config.emissor,
      allowedAud: config.audiencia,
      requiredClaims: ['sub', 'sid', 'jti', 'role', 'iat', 'exp', 'iss', 'aud'],
      cache: false,
    });
  }

  emitirAcesso(dados: { sub: string; role: Role; sid: string }) {
    const jti = randomUUID();
    const iat = Math.floor(this.relogio.agora().getTime() / 1000);
    const exp = iat + this.ttlAcessoSegundos;
    const token = this.assinar({ sub: dados.sub, role: dados.role, sid: dados.sid, jti, iat, exp });
    return { token, jti, expiraEm: new Date(exp * 1000) };
  }

  verificarAcesso(token: string): ClaimsAcesso {
    let claims: unknown;
    try {
      claims = this.verificar(token);
    } catch {
      throw tokenInvalido();
    }
    if (typeof claims !== 'object' || claims === null) throw tokenInvalido();

    const { sub, role, sid, jti, exp, iat } = claims as Record<string, unknown>;
    const valido =
      typeof sub === 'string' &&
      typeof sid === 'string' &&
      typeof jti === 'string' &&
      typeof exp === 'number' &&
      typeof iat === 'number' &&
      typeof role === 'string' &&
      (ROLES as readonly string[]).includes(role);
    if (!valido) throw tokenInvalido();

    // O fast-jwt confere exp com o relógio do sistema; conferimos também com o injetado.
    if (exp <= Math.floor(this.relogio.agora().getTime() / 1000)) throw tokenInvalido();

    return { sub, role: role as Role, sid, jti, exp, iat };
  }
}
