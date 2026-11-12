import type { FastifyInstance } from 'fastify';

/**
 * Verificação de uma dependência para o readiness (Postgres, Redis, S3…).
 * Cada módulo de infraestrutura registra a sua no composition root (main.ts).
 */
export interface VerificacaoProntidao {
  readonly nome: string;
  verificar(): Promise<void>;
}

const TIMEOUT_VERIFICACAO_MS = 2_000;

async function comTimeout(promessa: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => {
      rejeitar(new Error(`timeout após ${ms}ms`));
    }, ms);
  });
  try {
    await Promise.race([promessa, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function registrarRotasHealth(
  app: FastifyInstance,
  verificacoes: readonly VerificacaoProntidao[],
): void {
  app.get('/health/live', () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    const resultados = await Promise.allSettled(
      verificacoes.map((v) => comTimeout(v.verificar(), TIMEOUT_VERIFICACAO_MS)),
    );

    const dependencias: Record<string, 'ok' | 'falha'> = {};
    resultados.forEach((resultado, i) => {
      const nome = verificacoes[i]?.nome ?? `dependencia-${i}`;
      dependencias[nome] = resultado.status === 'fulfilled' ? 'ok' : 'falha';
      if (resultado.status === 'rejected') {
        // O motivo vai só para o log; a resposta pública não expõe detalhes internos.
        app.log.warn({ dependencia: nome, err: resultado.reason as unknown }, 'readiness falhou');
      }
    });

    const pronto = resultados.every((r) => r.status === 'fulfilled');
    return reply
      .code(pronto ? 200 : 503)
      .send({ status: pronto ? 'ok' : 'indisponivel', dependencias });
  });
}
