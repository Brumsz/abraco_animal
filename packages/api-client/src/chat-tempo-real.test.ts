import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatTempoReal, type EventoChat, type SocketMinimo } from './chat-tempo-real.js';

class SocketFalso implements SocketMinimo {
  static criados: SocketFalso[] = [];
  enviadas: Record<string, unknown>[] = [];
  fechadoCom: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    SocketFalso.criados.push(this);
  }
  send(d: string) {
    this.enviadas.push(JSON.parse(d) as Record<string, unknown>);
  }
  close(codigo = 1000) {
    this.fechadoCom = codigo;
  }
  // Ações do "servidor"
  abrir() {
    this.onopen?.();
  }
  responder(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  cair(codigo: number) {
    this.onclose?.({ code: codigo });
  }
}

const ultimo = () => SocketFalso.criados.at(-1)!;

let token: string | null;
let renovar: ReturnType<typeof vi.fn<() => Promise<string | null>>>;

function criarChat() {
  return new ChatTempoReal({
    url: 'wss://api.teste/v1/ws/chat',
    obterToken: () => token,
    renovar: () => renovar(),
    criarSocket: (url) => new SocketFalso(url),
    aleatorio: () => 0,
    intervaloPingMs: 25_000,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  SocketFalso.criados = [];
  token = 'tk-1';
  renovar = vi.fn(() => Promise.resolve('tk-2'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChatTempoReal', () => {
  it('autentica na 1ª mensagem (token fora da URL) e entrega os eventos', () => {
    const chat = criarChat();
    const eventos: EventoChat[] = [];
    chat.ouvir((e) => eventos.push(e));
    chat.conectar();
    expect(ultimo().url).toBe('wss://api.teste/v1/ws/chat');
    expect(ultimo().url).not.toContain('tk-1');

    ultimo().abrir();
    expect(ultimo().enviadas[0]).toEqual({ tipo: 'auth', token: 'tk-1' });
    ultimo().responder({ tipo: 'auth.ok' });
    expect(chat.estado).toBe('conectado');

    ultimo().responder({ tipo: 'digitando', conversaId: 'c1', daEquipe: true });
    ultimo().responder({ tipo: 'pong' });
    ultimo().responder('lixo');
    ultimo().responder({ tipo: 'evento.inventado', x: 1 });
    ultimo().responder(null);
    expect(eventos).toEqual([{ tipo: 'digitando', conversaId: 'c1', daEquipe: true }]);
  });

  it('queda de rede: reconecta com espera crescente (1 s, 2 s, 4 s) e zera ao autenticar', () => {
    const chat = criarChat();
    chat.conectar();
    ultimo().cair(1006);
    expect(SocketFalso.criados).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(SocketFalso.criados).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(SocketFalso.criados).toHaveLength(2);

    ultimo().cair(1006);
    vi.advanceTimersByTime(2000);
    expect(SocketFalso.criados).toHaveLength(3);
    ultimo().cair(1006);
    vi.advanceTimersByTime(3999);
    expect(SocketFalso.criados).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(SocketFalso.criados).toHaveLength(4);

    // Autenticou: a próxima queda volta a esperar 1 s.
    ultimo().abrir();
    ultimo().responder({ tipo: 'auth.ok' });
    ultimo().cair(1006);
    vi.advanceTimersByTime(1000);
    expect(SocketFalso.criados).toHaveLength(5);
  });

  it('a espera não passa de 30 s', () => {
    const chat = criarChat();
    chat.conectar();
    for (let i = 0; i < 10; i++) {
      ultimo().cair(1006);
      vi.advanceTimersByTime(30_000);
    }
    expect(SocketFalso.criados).toHaveLength(11);
  });

  it('4401 (token expirado): renova e reconecta com o token novo', async () => {
    const chat = criarChat();
    chat.conectar();
    renovar.mockImplementation(() => {
      token = 'tk-2';
      return Promise.resolve('tk-2');
    });
    ultimo().cair(4401);
    await vi.runOnlyPendingTimersAsync();
    expect(renovar).toHaveBeenCalledTimes(1);
    ultimo().abrir();
    expect(ultimo().enviadas[0]).toEqual({ tipo: 'auth', token: 'tk-2' });
  });

  it('4401 sem sessão (renovar → null): para de tentar', async () => {
    const chat = criarChat();
    chat.conectar();
    renovar.mockResolvedValue(null);
    ultimo().cair(4401);
    await vi.runAllTimersAsync();
    expect(SocketFalso.criados).toHaveLength(1);
    expect(chat.estado).toBe('desconectado');
  });

  it('desconectar (logout) fecha e não reconecta', () => {
    const chat = criarChat();
    chat.conectar();
    const s = ultimo();
    chat.desconectar();
    expect(s.fechadoCom).toBe(1000);
    s.cair(1000);
    vi.advanceTimersByTime(60_000);
    expect(SocketFalso.criados).toHaveLength(1);
  });

  it('ping a cada 25 s; digitando e reautenticar só quando conectado', () => {
    const chat = criarChat();
    chat.conectar();
    chat.digitando('c1');
    ultimo().abrir();
    ultimo().responder({ tipo: 'auth.ok' });
    vi.advanceTimersByTime(25_000);
    chat.digitando('c1');
    token = 'tk-3';
    chat.reautenticar();
    expect(ultimo().enviadas).toEqual([
      { tipo: 'auth', token: 'tk-1' },
      { tipo: 'ping' },
      { tipo: 'digitando', conversaId: 'c1' },
      { tipo: 'auth', token: 'tk-3' },
    ]);
  });

  it('avisa as mudanças de estado (para o app mostrar "reconectando…")', () => {
    const chat = criarChat();
    const estados: string[] = [];
    chat.aoMudarEstado((e) => estados.push(e));
    chat.conectar();
    ultimo().abrir();
    ultimo().responder({ tipo: 'auth.ok' });
    ultimo().cair(1006);
    expect(estados).toEqual(['conectando', 'conectado', 'desconectado']);
  });
});
