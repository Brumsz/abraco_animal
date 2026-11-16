/**
 * Chat com a ONG. Uma conversa ABERTA por usuário; a equipe (ADMIN) atende.
 * As mensagens entram SEMPRE pela API REST (validação + rate limit); o
 * WebSocket só entrega os eventos em tempo real (Barramento).
 */
import type { StatusConversa } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { acessoNegado, exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';

export const LIMITES_CHAT = { mensagem: 2000, assunto: 120 } as const;

export function validarMensagem(texto: string): string {
  const limpo = texto.trim();
  if (limpo.length === 0)
    throw erroValidacao('CAMPO_OBRIGATORIO', 'Escreva uma mensagem', 'conteudo');
  if (limpo.length > LIMITES_CHAT.mensagem) {
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Mensagem longa demais', 'conteudo');
  }
  return limpo;
}

// ── Portas ───────────────────────────────────────────────────────────────

export interface MensagemRegistro {
  readonly id: number;
  readonly publicId: string;
  readonly conteudo: string;
  readonly autorEhEquipe: boolean;
  readonly lida: boolean;
  readonly lidaEm: Date | null;
  readonly criadoEm: Date;
}

export interface ConversaRegistro {
  readonly id: number;
  readonly publicId: string;
  readonly status: StatusConversa;
  readonly assunto: string | null;
  /** publicId do dono. */
  readonly usuarioId: string;
  readonly usuarioNome: string;
  readonly atendenteNome: string | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

export interface ConversaResumo extends ConversaRegistro {
  readonly ultimaMensagem: MensagemRegistro | null;
  /** Não lidas DO PONTO DE VISTA de quem consulta (o outro lado escreveu). */
  readonly naoLidas: number;
}

export interface CursorConversas {
  readonly data: Date;
  readonly publicId: string;
}

export interface RepositorioChat {
  /** Já existe ABERTA do usuário (índice único parcial) → CONFLITO `CONVERSA_ABERTA_EXISTENTE`. */
  abrir(d: { usuarioId: string; assunto: string | null; mensagem: string }): Promise<{
    conversa: ConversaRegistro;
    mensagem: MensagemRegistro;
  }>;
  buscar(publicId: string): Promise<ConversaRegistro | null>;
  listarDoUsuario(usuarioId: string): Promise<ConversaResumo[]>;
  listarParaEquipe(
    filtro: { status?: StatusConversa },
    cursor: CursorConversas | undefined,
    limite: number,
  ): Promise<ConversaResumo[]>;
  /** Mais recentes primeiro. */
  listarMensagens(
    conversa: ConversaRegistro,
    cursor: CursorConversas | undefined,
    limite: number,
  ): Promise<MensagemRegistro[]>;
  /**
   * Grava a mensagem (só em conversa ABERTA → senão CONFLITO `CONVERSA_ENCERRADA`).
   * Mensagem da equipe: assume a conversa se ninguém assumiu e notifica o
   * dono (uma notificação não lida por conversa, para não lotar o sino).
   */
  enviar(
    conversa: ConversaRegistro,
    d: { autorId: string; conteudo: string; daEquipe: boolean; notificacao: ConteudoNotificacao },
  ): Promise<MensagemRegistro>;
  /** Marca como lidas as mensagens DO OUTRO LADO até `ateMensagemId` (inclusive). */
  marcarLidas(
    conversa: ConversaRegistro,
    d: { leitorEhEquipe: boolean; ateMensagemId: string; em: Date },
  ): Promise<number>;
  assumir(conversa: ConversaRegistro, adminId: string, a: EntradaAuditoria): Promise<void>;
  encerrar(conversa: ConversaRegistro, a: EntradaAuditoria): Promise<void>;
}

/** Eventos em tempo real (WebSocket). Destino: o dono da conversa e a equipe. */
export type EventoChat =
  | { tipo: 'mensagem.nova'; conversaId: string; usuarioId: string; mensagem: MensagemSaida }
  | {
      tipo: 'mensagem.lida';
      conversaId: string;
      usuarioId: string;
      ateMensagemId: string;
      leitorEhEquipe: boolean;
    }
  | { tipo: 'conversa.encerrada'; conversaId: string; usuarioId: string }
  | { tipo: 'digitando'; conversaId: string; usuarioId: string; daEquipe: boolean };

export interface BarramentoChat {
  publicar(evento: EventoChat): Promise<void>;
}

interface Deps {
  readonly chat: RepositorioChat;
  readonly barramento: BarramentoChat;
  readonly relogio: Relogio;
  /** Falha ao publicar no barramento: a mensagem já está gravada (o app busca no próximo GET). */
  readonly aoFalhar?: (erro: unknown) => void;
}

// ── Saídas ───────────────────────────────────────────────────────────────

const mensagemSaida = (m: MensagemRegistro) => ({
  id: m.publicId,
  conteudo: m.conteudo,
  autorEhEquipe: m.autorEhEquipe,
  lida: m.lida,
  lidaEm: m.lidaEm,
  criadoEm: m.criadoEm,
});

export type MensagemSaida = ReturnType<typeof mensagemSaida>;

const primeiroNome = (nome: string | null) => (nome ? (nome.trim().split(/\s+/)[0] ?? null) : null);

const conversaSaida = (c: ConversaResumo, paraEquipe: boolean) => ({
  id: c.publicId,
  assunto: c.assunto,
  status: c.status,
  // O usuário vê só o primeiro nome de quem atende.
  atendente: primeiroNome(c.atendenteNome),
  ultimaMensagem: c.ultimaMensagem ? mensagemSaida(c.ultimaMensagem) : null,
  naoLidas: c.naoLidas,
  criadoEm: c.criadoEm,
  atualizadoEm: c.atualizadoEm,
  ...(paraEquipe ? { usuario: { id: c.usuarioId, nome: c.usuarioNome } } : {}),
});

export type ConversaSaida = ReturnType<typeof conversaSaida>;

export const NOTIFICACAO_CHAT: ConteudoNotificacao = {
  tipo: 'CHAT_NOVA_MENSAGEM',
  titulo: 'Nova mensagem da ONG 💬',
  corpo: 'A equipe respondeu sua conversa. Toque para ver.',
};

const naoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'CONVERSA_NAO_ENCONTRADA', 'Conversa não encontrada');

/** Participante = dono da conversa ou ADMIN. Outro usuário → 403 (IDOR). */
export function exigirParticipante(ator: Ator, c: ConversaRegistro): void {
  if (ator.role !== 'ADMIN' && ator.id !== c.usuarioId) throw acessoNegado();
}

async function exigir(deps: Deps, ator: Ator, id: string) {
  const c = await deps.chat.buscar(id);
  if (!c) throw naoEncontrada();
  exigirParticipante(ator, c);
  return c;
}

async function publicar(deps: Deps, evento: EventoChat) {
  try {
    await deps.barramento.publicar(evento);
  } catch (erro) {
    deps.aoFalhar?.(erro);
  }
}

export const LIMITE_PAGINA_CHAT = { padrao: 30, maximo: 100 } as const;
const limitar = (n: number | undefined, padrao: number, maximo: number) =>
  Math.min(Math.max(Math.trunc(n ?? padrao), 1), maximo);

// ── Casos de uso ─────────────────────────────────────────────────────────

export class AbrirConversa {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; assunto?: string | null; mensagem: string }) {
    const mensagem = validarMensagem(entrada.mensagem);
    const assunto = entrada.assunto?.trim() ?? '';
    if (assunto.length > LIMITES_CHAT.assunto) {
      throw erroValidacao('CAMPO_MUITO_LONGO', 'Assunto longo demais', 'assunto');
    }
    const r = await this.deps.chat.abrir({
      usuarioId: entrada.ator.id,
      assunto: assunto || null,
      mensagem,
    });
    await publicar(this.deps, {
      tipo: 'mensagem.nova',
      conversaId: r.conversa.publicId,
      usuarioId: r.conversa.usuarioId,
      mensagem: mensagemSaida(r.mensagem),
    });
    return conversaSaida({ ...r.conversa, ultimaMensagem: r.mensagem, naoLidas: 0 }, false);
  }
}

export class ListarMinhasConversas {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator }) {
    return (await this.deps.chat.listarDoUsuario(entrada.ator.id)).map((c) =>
      conversaSaida(c, false),
    );
  }
}

export class ListarMensagens {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; cursor?: CursorConversas; limite?: number }) {
    const c = await exigir(this.deps, entrada.ator, entrada.id);
    const n = limitar(entrada.limite, LIMITE_PAGINA_CHAT.padrao, LIMITE_PAGINA_CHAT.maximo);
    const registros = await this.deps.chat.listarMensagens(c, entrada.cursor, n + 1);
    const itens = registros.slice(0, n);
    const ultimo = itens.at(-1);
    return {
      itens: itens.map(mensagemSaida),
      proximoCursor:
        registros.length > n && ultimo
          ? { data: ultimo.criadoEm, publicId: ultimo.publicId }
          : null,
    };
  }
}

export class EnviarMensagem {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; conteudo: string }): Promise<MensagemSaida> {
    const conteudo = validarMensagem(entrada.conteudo);
    const c = await exigir(this.deps, entrada.ator, entrada.id);
    if (c.status !== 'ABERTA') {
      throw new ErroDominio(
        'CONFLITO',
        'CONVERSA_ENCERRADA',
        'Esta conversa foi encerrada. Abra uma nova.',
      );
    }
    const m = await this.deps.chat.enviar(c, {
      autorId: entrada.ator.id,
      conteudo,
      daEquipe: entrada.ator.role === 'ADMIN',
      notificacao: NOTIFICACAO_CHAT,
    });
    const saida = mensagemSaida(m);
    await publicar(this.deps, {
      tipo: 'mensagem.nova',
      conversaId: c.publicId,
      usuarioId: c.usuarioId,
      mensagem: saida,
    });
    return saida;
  }
}

export class MarcarMensagensLidas {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; ateMensagemId: string }): Promise<void> {
    const c = await exigir(this.deps, entrada.ator, entrada.id);
    const leitorEhEquipe = entrada.ator.role === 'ADMIN';
    const marcadas = await this.deps.chat.marcarLidas(c, {
      leitorEhEquipe,
      ateMensagemId: entrada.ateMensagemId,
      em: this.deps.relogio.agora(),
    });
    // "Visto" em tempo real só quando algo mudou.
    if (marcadas > 0) {
      await publicar(this.deps, {
        tipo: 'mensagem.lida',
        conversaId: c.publicId,
        usuarioId: c.usuarioId,
        ateMensagemId: entrada.ateMensagemId,
        leitorEhEquipe,
      });
    }
  }
}

/** Chamado pelo WebSocket ("digitando…"). Efêmero: nada é gravado. */
export class SinalizarDigitando {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    const c = await exigir(this.deps, entrada.ator, entrada.id);
    if (c.status !== 'ABERTA') return;
    await publicar(this.deps, {
      tipo: 'digitando',
      conversaId: c.publicId,
      usuarioId: c.usuarioId,
      daEquipe: entrada.ator.role === 'ADMIN',
    });
  }
}

// ── Equipe ───────────────────────────────────────────────────────────────

export class AdminListarConversas {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: {
    ator: Ator;
    status?: StatusConversa;
    cursor?: CursorConversas;
    limite?: number;
  }) {
    exigirAdmin(entrada.ator);
    const n = limitar(entrada.limite, 20, 50);
    const registros = await this.deps.chat.listarParaEquipe(
      entrada.status ? { status: entrada.status } : {},
      entrada.cursor,
      n + 1,
    );
    const itens = registros.slice(0, n);
    const ultimo = itens.at(-1);
    return {
      itens: itens.map((c) => conversaSaida(c, true)),
      proximoCursor:
        registros.length > n && ultimo
          ? { data: ultimo.atualizadoEm, publicId: ultimo.publicId }
          : null,
    };
  }
}

export class AssumirConversa {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const c = await exigir(this.deps, entrada.ator, entrada.id);
    await this.deps.chat.assumir(c, entrada.ator.id, {
      adminId: entrada.ator.id,
      acao: 'CONVERSA_ASSUMIDA',
    });
  }
}

export class EncerrarConversa {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const c = await exigir(this.deps, entrada.ator, entrada.id);
    if (c.status === 'ENCERRADA') return;
    await this.deps.chat.encerrar(c, { adminId: entrada.ator.id, acao: 'CONVERSA_ENCERRADA' });
    await publicar(this.deps, {
      tipo: 'conversa.encerrada',
      conversaId: c.publicId,
      usuarioId: c.usuarioId,
    });
  }
}
