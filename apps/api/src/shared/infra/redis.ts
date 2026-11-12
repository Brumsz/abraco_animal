import { Redis } from 'ioredis';

export function criarRedis(url: string): Redis {
  return new Redis(url, {
    // Necessário para o BullMQ; comandos esperam a reconexão em vez de falhar na hora.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
