/**
 * Cliente do WebSocket do chat (/v1/ws/chat).
 *
 * - Autentica na 1ª mensagem (o token NUNCA vai na URL).
 * - Reconecta sozinho com espera crescente (1 s, 2 s, 4 s… até 30 s, com
 *   variação aleatória para os aparelhos não voltarem todos juntos).
 * - Fechado por token expirado/inválido (4401): renova o token e reconecta;
 *   se não houver mais sessão, para.
 * - `ping` a cada 25 s mantém a conexão viva em redes móveis e proxies.
 *
 * Mensagens de chat NÃO são enviadas por aqui: use POST /conversas/{id}/mensagens.
 */
import type { Mensagem } from './tipos.js';

export type EventoChat =
  | { tipo: 'mensagem.nova'; conversaId: string; mensagem: Mensagem }
  | { tipo: 'mensagem.lida'; conversaId: string; ateMensagemId: string; leitorEhEquipe: boolean }
  | { tipo: 'conversa.encerrada'; conversaId: string }
  | { tipo: 'digitando'; conversaId: string; daEquipe: boolean };

export type EstadoConexao = 'desconectado' | 'conectando' | 'conectado';

/** O mínimo de WebSocket que usamos (o global do React Native e o do navegador servem). */
export interface SocketMinimo {
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface OpcoesChat {
  /** Ex.: wss://api.abracoanimal.org.br/v1/ws/chat */
  readonly url: string;
  obterToken(): string | null;
  renovar(): Promise<string | null>;
  readonly criarSocket?: (url: string) => SocketMinimo;
  readonly atrasoMaximoMs?: number;
  readonly intervaloPingMs?: number;
  readonly aleatorio?: () => number;
}

const NAO_AUTENTICADO = 4401;

const TIPOS_EVENTO = new Set<string>([
  'mensagem.nova',
  'mensagem.lida',
  'conversa.encerrada',
  'digitando',
]);

export class ChatTempoReal {
  private socket: SocketMinimo | null = null;
  private tentativas = 0;
  private ativo = false;
  private timerReconexao: ReturnType<typeof setTimeout> | null = null;
  private timerPing: ReturnType<typeof setInterval> | null = null;
  private readonly ouvintes = new Set<(e: EventoChat) => void>();
  private readonly ouvintesEstado = new Set<(e: EstadoConexao) => void>();
  private _estado: EstadoConexao = 'desconectado';

  constructor(private readonly opcoes: OpcoesChat) {}

  get estado(): EstadoConexao {
    return this._estado;
  }

  /** Recebe eventos em tempo real. Devolve a função para parar de ouvir. */
  ouvir(fn: (e: EventoChat) => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  aoMudarEstado(fn: (e: EstadoConexao) => void): () => void {
    this.ouvintesEstado.add(fn);
    return () => this.ouvintesEstado.delete(fn);
  }

  conectar(): void {
    if (this.ativo) return;
    this.ativo = true;
    this.abrir();
  }

  /** Logout ou app em segundo plano: fecha e não reconecta. */
  desconectar(): void {
    this.ativo = false;
    this.limparTimers();
    const s = this.socket;
    this.socket = null;
    s?.close(1000, 'cliente saiu');
    this.mudarEstado('desconectado');
  }

  /** Token renovado pelo app: reautentica sem derrubar a conexão. */
  reautenticar(): void {
    const token = this.opcoes.obterToken();
    if (token && this._estado === 'conectado') this.enviar({ tipo: 'auth', token });
  }

  digitando(conversaId: string): void {
    if (this._estado === 'conectado') this.enviar({ tipo: 'digitando', conversaId });
  }

  private abrir(): void {
    const token = this.opcoes.obterToken();
    if (!token) {
      void this.renovarEReconectar();
      return;
    }
    this.mudarEstado('conectando');
    const criar =
      this.opcoes.criarSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketMinimo);
    const s = criar(this.opcoes.url);
    this.socket = s;

    s.onopen = () => {
      s.send(JSON.stringify({ tipo: 'auth', token }));
    };
    s.onmessage = (e) => {
      this.receber(e.data);
    };
    s.onerror = () => {
      // O "close" vem logo depois e decide a reconexão.
    };
    s.onclose = (e) => {
      if (this.socket !== s) return;
      this.socket = null;
      this.limparTimers();
      this.mudarEstado('desconectado');
      if (!this.ativo) return;
      if (e.code === NAO_AUTENTICADO) void this.renovarEReconectar();
      else this.agendarReconexao();
    };
  }

  private receber(bruto: unknown): void {
    let msg: { tipo?: unknown };
    try {
      const dado: unknown = JSON.parse(String(bruto));
      if (typeof dado !== 'object' || dado === null) return;
      msg = dado;
    } catch {
      return;
    }
    if (msg.tipo === 'auth.ok') {
      this.tentativas = 0;
      this.mudarEstado('conectado');
      this.iniciarPing();
      return;
    }
    // Só repassa eventos conhecidos (um JSON qualquer não vira "evento").
    if (typeof msg.tipo !== 'string' || !TIPOS_EVENTO.has(msg.tipo)) return;
    for (const fn of this.ouvintes) fn(msg as EventoChat);
  }

  private async renovarEReconectar(): Promise<void> {
    const novo = await this.opcoes.renovar().catch(() => null);
    if (!this.ativo) return;
    // Sem sessão: não fica tentando para sempre (o app volta ao login).
    if (!novo) {
      this.desconectar();
      return;
    }
    this.agendarReconexao(0);
  }

  private agendarReconexao(atraso?: number): void {
    const maximo = this.opcoes.atrasoMaximoMs ?? 30_000;
    const base = Math.min(1000 * 2 ** this.tentativas, maximo);
    const variacao = (this.opcoes.aleatorio ?? Math.random)() * 0.3 * base;
    this.tentativas += 1;
    this.timerReconexao = setTimeout(
      () => {
        this.timerReconexao = null;
        if (this.ativo) this.abrir();
      },
      atraso ?? base + variacao,
    );
  }

  private iniciarPing(): void {
    this.timerPing = setInterval(() => {
      this.enviar({ tipo: 'ping' });
    }, this.opcoes.intervaloPingMs ?? 25_000);
  }

  private enviar(dados: Record<string, unknown>): void {
    try {
      this.socket?.send(JSON.stringify(dados));
    } catch {
      // Conexão caindo: o onclose cuida.
    }
  }

  private limparTimers(): void {
    if (this.timerReconexao) clearTimeout(this.timerReconexao);
    if (this.timerPing) clearInterval(this.timerPing);
    this.timerReconexao = null;
    this.timerPing = null;
  }

  private mudarEstado(e: EstadoConexao): void {
    if (this._estado === e) return;
    this._estado = e;
    for (const fn of this.ouvintesEstado) fn(e);
  }
}
