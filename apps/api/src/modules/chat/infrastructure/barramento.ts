/**
 * Barramento dos eventos do chat.
 *
 * Com Redis pub/sub, um evento publicado por QUALQUER instância da API chega
 * aos WebSockets conectados em TODAS as instâncias (necessário ao escalar
 * horizontalmente na Etapa 11). O assinante usa uma conexão Redis própria:
 * em modo "subscribe" ela não aceita outros comandos.
 */
import type { Redis } from 'ioredis';

import type { BarramentoChat, EventoChat } from '../application/casos-de-uso.js';

export interface BarramentoAssinavel extends BarramentoChat {
  assinar(aoReceber: (evento: EventoChat) => void): Promise<void>;
  fechar(): Promise<void>;
}

const CANAL = 'chat:eventos';

export class BarramentoRedis implements BarramentoAssinavel {
  private assinante: Redis | undefined;

  constructor(private readonly redis: Redis) {}

  async publicar(evento: EventoChat): Promise<void> {
    await this.redis.publish(CANAL, JSON.stringify(evento));
  }

  async assinar(aoReceber: (evento: EventoChat) => void): Promise<void> {
    this.assinante = this.redis.duplicate();
    this.assinante.on('message', (_canal: string, bruto: string) => {
      try {
        aoReceber(JSON.parse(bruto) as EventoChat);
      } catch {
        // Mensagem malformada no canal: ignora (só a própria API publica nele).
      }
    });
    await this.assinante.subscribe(CANAL);
  }

  async fechar(): Promise<void> {
    if (this.assinante) {
      await this.assinante.unsubscribe(CANAL).catch(() => undefined);
      this.assinante.disconnect();
    }
  }
}

/** Um processo só (testes). */
export class BarramentoMemoria implements BarramentoAssinavel {
  private readonly ouvintes: ((evento: EventoChat) => void)[] = [];

  publicar(evento: EventoChat): Promise<void> {
    for (const ouvir of this.ouvintes) ouvir(evento);
    return Promise.resolve();
  }

  assinar(aoReceber: (evento: EventoChat) => void): Promise<void> {
    this.ouvintes.push(aoReceber);
    return Promise.resolve();
  }

  fechar(): Promise<void> {
    this.ouvintes.length = 0;
    return Promise.resolve();
  }
}
