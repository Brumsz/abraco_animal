/**
 * Sobe Postgres 16, Redis 7 e SeaweedFS (S3) reais (Testcontainers), aplica as
 * migrações do Prisma e monta o app completo — só o envio de e-mail é
 * substituído por uma caixa em memória para o teste ler o código de recuperação.
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import { construirApp } from '../app.js';
import {
  comporAdocoes,
  comporAnimais,
  comporAuth,
  comporDoacoesAnimais,
  comporAdmin,
  comporApadrinhamentos,
  comporChat,
  comporFeed,
  comporNoticias,
  comporInstitucional,
  comporNotificacoes,
  comporPix,
  comporVoluntariado,
  verificacoesProntidao,
  type ConfigComposicao,
} from '../composicao.js';
import type { FilaEmails } from '../modules/auth/application/portas.js';
import type { DestinatarioEmail, EmailsAdocao } from '../shared/aplicacao/emails-adocao.js';
import type { EmailsDoacaoAnimal } from '../shared/aplicacao/emails-doacao-animal.js';
import type { EmailsDoacaoFinanceira } from '../modules/doacoes-financeiras/application/portas.js';
import type { EmailsVoluntariado } from '../shared/aplicacao/emails-voluntariado.js';
import { GatewaySimulado } from '../modules/doacoes-financeiras/infrastructure/gateway-simulado.js';
import { BarramentoRedis } from '../modules/chat/infrastructure/barramento.js';
import { relogioSistema, type Relogio } from '../shared/aplicacao/relogio.js';
import { ArmazenamentoS3 } from '../shared/infra/armazenamento-s3.js';
import { criarPrisma, type Prisma } from '../shared/infra/prisma.js';
import { criarRedis } from '../shared/infra/redis.js';
import { iniciarS3, type S3Integracao } from './s3-integracao.js';

const RAIZ_API = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export class CaixaEmails
  implements
    FilaEmails,
    EmailsAdocao,
    EmailsDoacaoAnimal,
    EmailsDoacaoFinanceira,
    EmailsVoluntariado
{
  readonly voluntariado: { tipo: string; para: string }[] = [];
  candidaturaRecebida(d: { para: string }) {
    this.voluntariado.push({ tipo: 'recebida', para: d.para });
    return Promise.resolve();
  }
  voluntarioAprovado(d: { para: string }) {
    this.voluntariado.push({ tipo: 'aprovado', para: d.para });
    return Promise.resolve();
  }
  voluntarioRecusado(d: { para: string }) {
    this.voluntariado.push({ tipo: 'recusado', para: d.para });
    return Promise.resolve();
  }
  readonly comprovantes: { para: string; nome: string; valor: string }[] = [];
  comprovanteDoacao(d: { para: string; nome: string; valor: string; data: Date }) {
    this.comprovantes.push({ para: d.para, nome: d.nome, valor: d.valor });
    return Promise.resolve();
  }
  readonly codigos: { para: string; codigo: string }[] = [];
  readonly alteracoes: string[] = [];
  readonly adocoes: { tipo: string; para: string; animal: string; motivo?: string }[] = [];
  private adocao(tipo: string, d: DestinatarioEmail & { animal: string; motivo?: string }) {
    this.adocoes.push({
      tipo,
      para: d.para,
      animal: d.animal,
      ...(d.motivo ? { motivo: d.motivo } : {}),
    });
    return Promise.resolve();
  }
  adocaoRecebida(d: DestinatarioEmail & { animal: string }) {
    return this.adocao('recebida', d);
  }
  adocaoAprovada(d: DestinatarioEmail & { animal: string }) {
    return this.adocao('aprovada', d);
  }
  adocaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }) {
    return this.adocao('recusada', d);
  }
  adocaoEncerrada(d: DestinatarioEmail & { animal: string }) {
    return this.adocao('encerrada', d);
  }
  doacaoEnviada(d: DestinatarioEmail & { animal: string }) {
    return this.adocao('doacao-enviada', d);
  }
  doacaoAprovada(d: DestinatarioEmail & { animal: string }) {
    return this.adocao('doacao-aprovada', d);
  }
  doacaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }) {
    return this.adocao('doacao-recusada', d);
  }
  doacaoConcluida(d: DestinatarioEmail & { animal: string }) {
    return this.adocao('doacao-concluida', d);
  }
  codigoRecuperacao(d: { para: string; codigo: string }) {
    this.codigos.push({ para: d.para, codigo: d.codigo });
    return Promise.resolve();
  }
  senhaAlterada(d: { para: string }) {
    this.alteracoes.push(d.para);
    return Promise.resolve();
  }
  ultimoCodigo(para: string): string {
    const item = this.codigos.filter((c) => c.para === para).at(-1);
    if (!item) throw new Error(`nenhum código enviado para ${para}`);
    return item.codigo;
  }
}

const chave32 = (byte: number) => Buffer.alloc(32, byte).toString('base64');

export function gerarParJwt() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publica: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export interface AmbienteIntegracao {
  readonly app: FastifyInstance;
  readonly prisma: Prisma;
  readonly redis: Redis;
  readonly emails: CaixaEmails;
  readonly s3: S3Integracao;
  /** PSP simulado compartilhado: o teste decide se a cobrança foi paga. */
  readonly psp: GatewaySimulado;
  readonly tokenWebhook: string;
  readonly config: ConfigComposicao;
  readonly chaves: ReturnType<typeof gerarParJwt>;
  /** Monta um app novo sobre o mesmo banco (ex.: com outro relógio). */
  criarApp(opcoes?: { relogio?: Relogio }): Promise<FastifyInstance>;
  encerrar(): Promise<void>;
}

export async function iniciarAmbiente(): Promise<AmbienteIntegracao> {
  const [pg, rd, s3]: [StartedPostgreSqlContainer, StartedRedisContainer, S3Integracao] =
    await Promise.all([
      new PostgreSqlContainer('postgres:16.15-alpine').start(),
      new RedisContainer('redis:7.4.12-alpine').start(),
      iniciarS3(),
    ]);

  const databaseUrl = `${pg.getConnectionUri()}?schema=public`;
  // Migrações reais (as mesmas do deploy), incluindo o índice parcial manual.
  execFileSync(
    process.execPath,
    [resolve(RAIZ_API, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    },
  );

  const prisma = criarPrisma(databaseUrl);
  const redis = criarRedis(rd.getConnectionUrl());
  const emails = new CaixaEmails();
  const chaves = gerarParJwt();

  const config: ConfigComposicao = {
    JWT_PRIVATE_KEY_B64: chaves.privada,
    JWT_PUBLIC_KEY_B64: chaves.publica,
    JWT_ISSUER: 'https://api.teste.abracoanimal.org.br',
    JWT_AUDIENCE: 'abraco-animal-app',
    ACCESS_TOKEN_TTL_SEGUNDOS: 900,
    REFRESH_TOKEN_TTL_DIAS: 30,
    DADOS_CRYPTO_KEY_B64: chave32(1),
    DADOS_CRYPTO_KEY_VERSAO: 1,
    CPF_HMAC_KEY_B64: chave32(2),
    CODIGOS_HMAC_KEY_B64: chave32(3),
  };

  const armazenamento = new ArmazenamentoS3(s3.config, relogioSistema);
  const psp = new GatewaySimulado();
  const tokenWebhook = 'token-de-webhook-de-teste-com-mais-de-32-caracteres';
  const configPix = {
    NODE_ENV: 'test' as const,
    ASAAS_API_URL: 'https://asaas.invalid/v3',
    ASAAS_API_KEY: undefined,
    ASAAS_CLIENTE_ID: undefined,
    ASAAS_WEBHOOK_TOKEN: tokenWebhook,
    PIX_EXPIRACAO_MINUTOS: 15,
  };
  const infra = { prisma, redis, emails, armazenamento };

  const criarApp = async (opcoes: { relogio?: Relogio } = {}) => {
    const comOpcoes = { ...infra, ...opcoes };
    const auth = await comporAuth(config, comOpcoes);
    const app = construirApp({
      verificacoesProntidao: verificacoesProntidao(infra),
      redis,
      auth: auth.rotas,
      animais: comporAnimais(comOpcoes, auth.rotas.autenticacao),
      adocoes: comporAdocoes(comOpcoes, auth.rotas.autenticacao),
      doacoesAnimais: comporDoacoesAnimais(comOpcoes, auth.rotas.autenticacao),
      pix: comporPix(configPix, comOpcoes, auth.rotas.autenticacao, { gateway: psp }),
      apadrinhamentos: comporApadrinhamentos(comOpcoes, auth.rotas.autenticacao),
      voluntariado: comporVoluntariado(comOpcoes, auth.rotas.autenticacao),
      institucional: comporInstitucional(comOpcoes, auth.rotas.autenticacao),
      feed: comporFeed(comOpcoes, auth.rotas.autenticacao),
      admin: comporAdmin(comOpcoes, auth.rotas.autenticacao, auth),
      noticias: comporNoticias(comOpcoes, auth.rotas.autenticacao),
      // Redis REAL também no pub/sub do chat.
      chat: comporChat(comOpcoes, auth.rotas.autenticacao, {
        tokens: auth.tokens,
        revogacao: auth.revogacao,
        barramento: new BarramentoRedis(redis),
        origensPermitidas: ['https://painel.abracoanimal.org.br'],
      }),
      notificacoes: comporNotificacoes(comOpcoes, auth.rotas.autenticacao),
    });
    return app;
  };

  const app = await criarApp();
  await app.ready();

  return {
    app,
    prisma,
    redis,
    emails,
    s3,
    psp,
    tokenWebhook,
    config,
    chaves,
    criarApp,
    async encerrar() {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
      armazenamento.destruir();
      s3.cliente.destroy();
      await Promise.all([pg.stop(), rd.stop(), s3.container.stop()]);
    },
  };
}
