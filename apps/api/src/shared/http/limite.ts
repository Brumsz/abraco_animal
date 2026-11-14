import type { FastifyReply } from 'fastify';

import type {
  LimitadorTentativas,
  RegraLimite,
} from '../../modules/auth/infrastructure/redis-auth.js';
import { ErroDominio } from '../dominio/erros.js';

/** Consome uma tentativa; estourou → 429 com Retry-After. */
export async function aplicarLimite(
  limitador: LimitadorTentativas,
  regra: RegraLimite,
  identificador: string,
  reply: FastifyReply,
): Promise<void> {
  const resultado = await limitador.consumir(regra, identificador);
  if (!resultado.permitido) {
    void reply.header('Retry-After', String(resultado.tentarEmSegundos));
    throw new ErroDominio(
      'LIMITE_EXCEDIDO',
      'MUITAS_TENTATIVAS',
      'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    );
  }
}
