/**
 * Ponto de entrada: lê a configuração, cria as conexões e sobe o servidor.
 * A montagem dos casos de uso fica em composicao.ts.
 */
import { CAMPOS_REDIGIDOS, construirApp } from './app.js';
import { comporAuth, verificacoesProntidao } from './composicao.js';
import { carregarAmbiente } from './config/ambiente.js';
import { FilaEmailsBullmq, iniciarWorkerEmails } from './shared/infra/emails.js';
import { criarPrisma } from './shared/infra/prisma.js';
import { criarRedis } from './shared/infra/redis.js';

const ambiente = carregarAmbiente();

const prisma = criarPrisma(ambiente.DATABASE_URL);
const redis = criarRedis(ambiente.REDIS_URL);
const emails = new FilaEmailsBullmq(redis);
const infra = { prisma, redis, emails };

// Worker de e-mails no mesmo processo (separável em outro container na Etapa 11).
const workerEmails = iniciarWorkerEmails(redis, {
  host: ambiente.SMTP_HOST,
  port: ambiente.SMTP_PORT,
  secure: ambiente.SMTP_SECURE,
  user: ambiente.SMTP_USER,
  password: ambiente.SMTP_PASSWORD,
  remetente: ambiente.EMAIL_REMETENTE,
});

const auth = await comporAuth(ambiente, infra);

const app = construirApp({
  logger: {
    level: ambiente.LOG_LEVEL,
    redact: { paths: [...CAMPOS_REDIGIDOS], censor: '[REDIGIDO]' },
  },
  verificacoesProntidao: verificacoesProntidao(infra),
  corsOrigens: ambiente.CORS_ORIGINS,
  redis,
  auth: auth.rotas,
});

workerEmails.on('failed', (job, err) => {
  // Só o tipo do e-mail vai para o log — nunca destinatário nem código.
  app.log.warn(
    { tipo: job?.data.tipo, tentativa: job?.attemptsMade, err: err.message },
    'falha ao enviar e-mail',
  );
});

let encerrando = false;
async function encerrar(sinal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  app.log.info({ sinal }, 'encerrando servidor');
  try {
    await app.close();
    await workerEmails.close();
    await emails.fechar();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'falha ao encerrar');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('SIGINT', () => void encerrar('SIGINT'));

try {
  await app.listen({ port: ambiente.PORT, host: ambiente.HOST });
} catch (err) {
  app.log.fatal({ err }, 'falha ao iniciar servidor');
  process.exit(1);
}
