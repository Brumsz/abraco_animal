/**
 * Cliente do Expo Push Service (gratuito). Sem SDK: é um POST com JSON, e o
 * fetch nativo do Node basta — uma dependência a menos.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

import type {
  DespacharPush,
  EnviadorPush,
  MensagemPush,
  ResultadoEnvio,
} from '../application/casos-de-uso.js';

const URL_EXPO = 'https://exp.host/--/api/v2/push/send';

interface Ticket {
  readonly status: 'ok' | 'error';
  readonly details?: { readonly error?: string };
}

/** Resposta da Expo → um resultado por mensagem (mesma ordem). */
export function lerTickets(corpo: unknown, quantidade: number): ResultadoEnvio[] {
  const dados = (corpo as { data?: unknown } | null)?.data;
  if (!Array.isArray(dados) || dados.length !== quantidade) {
    return Array.from({ length: quantidade }, () => ({ ok: false, aparelhoInvalido: false }));
  }
  return (dados as Ticket[]).map((t) =>
    t.status === 'ok'
      ? { ok: true }
      : { ok: false, aparelhoInvalido: t.details?.error === 'DeviceNotRegistered' },
  );
}

export class EnviadorExpo implements EnviadorPush {
  constructor(
    /** Opcional: só exigido se "Enhanced Security for Push" estiver ligado na conta Expo. */
    private readonly tokenAcesso?: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async enviar(mensagens: readonly MensagemPush[]): Promise<ResultadoEnvio[]> {
    const resposta = await this.http(URL_EXPO, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.tokenAcesso ? { authorization: `Bearer ${this.tokenAcesso}` } : {}),
      },
      body: JSON.stringify(
        mensagens.map((m) => ({ ...m, sound: 'default', channelId: 'padrao', priority: 'high' })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) throw new Error(`Expo Push respondeu ${String(resposta.status)}`);
    return lerTickets(await resposta.json(), mensagens.length);
  }
}

const FILA = 'push';
const A_CADA_MS = 10_000;

/**
 * Job periódico do BullMQ: uma única execução por vez no cluster inteiro (o
 * agendador do BullMQ garante), a cada 10 s.
 */
export async function iniciarDespachoPush(
  conexao: ConnectionOptions,
  despachar: DespacharPush,
): Promise<{ fila: Queue; worker: Worker }> {
  const fila = new Queue(FILA, {
    connection: conexao,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 3600 } },
  });
  await fila.upsertJobScheduler('despachar', { every: A_CADA_MS }, { name: 'despachar' });
  const worker = new Worker(FILA, () => despachar.executar(), {
    connection: conexao,
    concurrency: 1,
  });
  return { fila, worker };
}
