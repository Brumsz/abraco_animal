import { createHash } from 'node:crypto';

import type { Redis } from 'ioredis';

import type { CofreRedefinicao, ListaRevogacao } from '../application/portas.js';

/** jti/sid revogados, com TTL = validade restante do access token. */
export class RevogacaoRedis implements ListaRevogacao {
  constructor(private readonly redis: Redis) {}

  async revogarJti(jti: string, ttlSegundos: number): Promise<void> {
    await this.redis.set(`auth:revogado:jti:${jti}`, '1', 'EX', Math.max(1, ttlSegundos));
  }

  async revogarSid(sid: string, ttlSegundos: number): Promise<void> {
    await this.redis.set(`auth:revogado:sid:${sid}`, '1', 'EX', Math.max(1, ttlSegundos));
  }

  async estaRevogado(jti: string, sid: string): Promise<boolean> {
    const total = await this.redis.exists(`auth:revogado:jti:${jti}`, `auth:revogado:sid:${sid}`);
    return total > 0;
  }
}

export class CofreRedefinicaoRedis implements CofreRedefinicao {
  constructor(private readonly redis: Redis) {}

  async guardar(tokenHash: string, usuarioId: number, ttlSegundos: number): Promise<void> {
    await this.redis.set(`auth:redefinicao:${tokenHash}`, String(usuarioId), 'EX', ttlSegundos);
  }

  async consumir(tokenHash: string): Promise<number | null> {
    // GETDEL é atômico: o token não pode ser usado duas vezes.
    const valor = await this.redis.getdel(`auth:redefinicao:${tokenHash}`);
    return valor === null ? null : Number(valor);
  }
}

export interface RegraLimite {
  /** Prefixo da chave (ex.: "login"). */
  readonly nome: string;
  readonly maximo: number;
  readonly janelaSegundos: number;
  /**
   * Bloqueio progressivo: ao estourar o limite, a chave fica bloqueada por
   * janela × 2^(n-1), onde n é o número de bloqueios nas últimas 24h.
   */
  readonly progressivo?: boolean;
}

export interface ResultadoLimite {
  readonly permitido: boolean;
  /** Segundos até poder tentar de novo (para o header Retry-After). */
  readonly tentarEmSegundos: number;
}

const BLOQUEIO_MAXIMO_SEG = 24 * 3600;

/**
 * Limitador de tentativas em Redis. Identificadores (IP, e-mail) entram na
 * chave como hash SHA-256: o Redis nunca guarda e-mail em claro.
 */
export class LimitadorTentativas {
  constructor(private readonly redis: Redis) {}

  async consumir(regra: RegraLimite, identificador: string): Promise<ResultadoLimite> {
    const id = createHash('sha256').update(identificador).digest('hex').slice(0, 32);
    const chaveBloqueio = `rl:${regra.nome}:bloqueio:${id}`;

    const bloqueioRestante = await this.redis.ttl(chaveBloqueio);
    if (bloqueioRestante > 0) return { permitido: false, tentarEmSegundos: bloqueioRestante };

    const chaveContador = `rl:${regra.nome}:contador:${id}`;
    const [[, total], [, ttl]] = (await this.redis
      .multi()
      .incr(chaveContador)
      .ttl(chaveContador)
      .exec()) as [[null, number], [null, number]];
    if (ttl < 0) await this.redis.expire(chaveContador, regra.janelaSegundos);

    if (total <= regra.maximo) return { permitido: true, tentarEmSegundos: 0 };

    if (!regra.progressivo) {
      return { permitido: false, tentarEmSegundos: ttl > 0 ? ttl : regra.janelaSegundos };
    }

    const chaveNivel = `rl:${regra.nome}:nivel:${id}`;
    const nivel = await this.redis.incr(chaveNivel);
    await this.redis.expire(chaveNivel, BLOQUEIO_MAXIMO_SEG);
    const duracao = Math.min(regra.janelaSegundos * 2 ** (nivel - 1), BLOQUEIO_MAXIMO_SEG);
    await this.redis.multi().set(chaveBloqueio, '1', 'EX', duracao).del(chaveContador).exec();
    return { permitido: false, tentarEmSegundos: duracao };
  }

  /** Zera o contador (ex.: após login bem-sucedido). O nível progressivo permanece. */
  async limpar(regra: RegraLimite, identificador: string): Promise<void> {
    const id = createHash('sha256').update(identificador).digest('hex').slice(0, 32);
    await this.redis.del(`rl:${regra.nome}:contador:${id}`);
  }
}

/** Regras da seção 6 da spec. */
export const REGRAS = {
  login: { nome: 'login', maximo: 5, janelaSegundos: 15 * 60, progressivo: true },
  recuperacaoPorEmail: { nome: 'recuperacao', maximo: 3, janelaSegundos: 3600 },
  verificacaoCodigoPorIp: { nome: 'verificacao', maximo: 10, janelaSegundos: 15 * 60 },
} as const satisfies Record<string, RegraLimite>;
