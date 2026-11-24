/**
 * Conexões para os scripts de linha de comando (criar-admin, semear).
 * Mesma configuração do servidor (lê o .env da raiz pelo --env-file do tsx).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carregarAmbiente } from '../config/ambiente.js';
import { relogioSistema } from '../shared/aplicacao/relogio.js';
import { ArmazenamentoS3 } from '../shared/infra/armazenamento-s3.js';
import { criarPrisma } from '../shared/infra/prisma.js';

/** Fotos dos dados de exemplo (apps/api/semente). */
export const PASTA_SEMENTE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'semente');

export function criarInfraScript() {
  const ambiente = carregarAmbiente();
  const prisma = criarPrisma(ambiente.DATABASE_URL);
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
  return { ambiente, prisma, armazenamento };
}

/** Saída dos scripts (o lint proíbe console na API; aqui só vão mensagens fixas, sem dados pessoais). */
export const informar = (msg: string) => process.stdout.write(`${msg}\n`);
export const falhar = (msg: string) => process.stderr.write(`${msg}\n`);
