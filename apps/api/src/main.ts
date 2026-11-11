/**
 * Composition root: o único lugar que conhece implementações concretas.
 * Nas próximas etapas, aqui serão instanciados Prisma, Redis, S3, BullMQ e
 * injetados nos use cases de cada módulo.
 */
import { CAMPOS_REDIGIDOS, construirApp } from './app.js';

const porta = Number(process.env['PORT'] ?? 3333);
const host = process.env['HOST'] ?? '0.0.0.0';
const nivelLog = process.env['LOG_LEVEL'] ?? 'info';

const app = construirApp({
  logger: {
    level: nivelLog,
    redact: { paths: [...CAMPOS_REDIGIDOS], censor: '[REDIGIDO]' },
  },
  verificacoesProntidao: [],
});

let encerrando = false;
async function encerrar(sinal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  app.log.info({ sinal }, 'encerrando servidor');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'falha ao encerrar');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('SIGINT', () => void encerrar('SIGINT'));

try {
  await app.listen({ port: porta, host });
} catch (err) {
  app.log.fatal({ err }, 'falha ao iniciar servidor');
  process.exit(1);
}
