/**
 * Ponto de entrada: lê a configuração, cria as conexões e sobe o servidor.
 * A montagem dos casos de uso fica em composicao.ts.
 */
import { CAMPOS_REDIGIDOS, construirApp } from './app.js';
import {
  comporAdocoes,
  comporAnimais,
  comporAuth,
  comporDoacoesAnimais,
  comporNotificacoes,
  comporPix,
  verificacoesProntidao,
} from './composicao.js';
import { carregarAmbiente } from './config/ambiente.js';
import { relogioSistema } from './shared/aplicacao/relogio.js';
import { ArmazenamentoS3 } from './shared/infra/armazenamento-s3.js';
import { FilaEmailsBullmq, iniciarWorkerEmails } from './shared/infra/emails.js';
import { criarPrisma } from './shared/infra/prisma.js';
import { criarRedis } from './shared/infra/redis.js';

const ambiente = carregarAmbiente();

const prisma = criarPrisma(ambiente.DATABASE_URL);
const redis = criarRedis(ambiente.REDIS_URL);
const emails = new FilaEmailsBullmq(redis);
const armazenamento = new ArmazenamentoS3(
  {
    ...(ambiente.S3_ENDPOINT ? { endpoint: ambiente.S3_ENDPOINT } : {}),
    ...(ambiente.S3_ENDPOINT_PUBLICO ? { endpointPublico: ambiente.S3_ENDPOINT_PUBLICO } : {}),
    regiao: ambiente.S3_REGION,
    bucket: ambiente.S3_BUCKET,
    accessKeyId: ambiente.S3_ACCESS_KEY_ID,
    secretAccessKey: ambiente.S3_SECRET_ACCESS_KEY,
    forcePathStyle: ambiente.S3_FORCE_PATH_STYLE,
    ttlUrlSegundos: ambiente.S3_URL_ASSINADA_TTL_SEGUNDOS,
  },
  relogioSistema,
);
const infra = { prisma, redis, emails, armazenamento };

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

// Só o tipo do erro: a mensagem do Redis/BullMQ pode trazer o payload (e-mail).
function aoFalharEmail(erro: unknown): void {
  app.log.warn(
    { erro: erro instanceof Error ? erro.name : 'desconhecido' },
    'falha ao enfileirar e-mail',
  );
}

const app = construirApp({
  logger: {
    level: ambiente.LOG_LEVEL,
    redact: { paths: [...CAMPOS_REDIGIDOS], censor: '[REDIGIDO]' },
  },
  verificacoesProntidao: verificacoesProntidao(infra),
  corsOrigens: ambiente.CORS_ORIGINS,
  redis,
  auth: auth.rotas,
  animais: comporAnimais(infra, auth.rotas.autenticacao),
  adocoes: comporAdocoes(infra, auth.rotas.autenticacao, { aoFalharEmail }),
  doacoesAnimais: comporDoacoesAnimais(infra, auth.rotas.autenticacao, { aoFalharEmail }),
  notificacoes: comporNotificacoes(infra, auth.rotas.autenticacao),
  pix: comporPix(ambiente, infra, auth.rotas.autenticacao, {
    // Só o contexto e o tipo do erro: nada de corpo do PSP nem dados do doador.
    aoFalhar: (contexto, erro) => {
      app.log.warn({ contexto, erro: erro instanceof Error ? erro.name : 'desconhecido' }, 'pix');
    },
  }),
});

if (!ambiente.ASAAS_API_KEY) {
  app.log.warn('ASAAS_API_KEY vazia: Pix SIMULADO ativo (POST /v1/dev/pix/{id}/pagar)');
}

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
    armazenamento.destruir();
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
