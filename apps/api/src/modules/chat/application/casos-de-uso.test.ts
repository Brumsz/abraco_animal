import { randomUUID } from 'node:crypto';

import type { StatusConversa } from '@abraco/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import {
  AbrirConversa,
  AdminListarConversas,
  AssumirConversa,
  EncerrarConversa,
  EnviarMensagem,
  ListarMensagens,
  ListarMinhasConversas,
  MarcarMensagensLidas,
  SinalizarDigitando,
  type BarramentoChat,
  type ConversaRegistro,
  type ConversaResumo,
  type CursorConversas,
  type EventoChat,
  type MensagemRegistro,
  type RepositorioChat,
} from './casos-de-uso.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };
type MsgMem = Mutavel<MensagemRegistro> & { conversaId: number; autorId: string };

class ChatFake implements RepositorioChat {
  readonly conversas: Mutavel<ConversaRegistro>[] = [];
  readonly mensagens: MsgMem[] = [];
  readonly notificacoes: string[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  private t = Date.parse('2026-11-01T12:00:00Z');
  private tick() {
    this.t += 1000;
    return new Date(this.t);
  }

  private resumo(c: ConversaRegistro, paraEquipe: boolean): ConversaResumo {
    const msgs = this.mensagens.filter((m) => m.conversaId === c.id);
    return {
      ...c,
      ultimaMensagem: msgs.at(-1) ?? null,
      naoLidas: msgs.filter((m) => !m.lida && m.autorEhEquipe !== paraEquipe).length,
    };
  }
  abrir(d: { usuarioId: string; assunto: string | null; mensagem: string }) {
    if (this.conversas.some((c) => c.usuarioId === d.usuarioId && c.status === 'ABERTA')) {
      return Promise.reject(new ErroDominio('CONFLITO', 'CONVERSA_ABERTA_EXISTENTE', 'já existe'));
    }
    const em = this.tick();
    const conversa = {
      id: this.conversas.length + 1,
      publicId: randomUUID(),
      status: 'ABERTA' as const,
      assunto: d.assunto,
      usuarioId: d.usuarioId,
      usuarioNome: 'Maria Souza',
      atendenteNome: null,
      criadoEm: em,
      atualizadoEm: em,
    };
    this.conversas.push(conversa);
    const mensagem = this.gravar(conversa, d.usuarioId, d.mensagem, false);
    return Promise.resolve({ conversa: { ...conversa }, mensagem });
  }
  private gravar(
    c: ConversaRegistro,
    autorId: string,
    conteudo: string,
    daEquipe: boolean,
  ): MensagemRegistro {
    const m: MsgMem = {
      id: this.mensagens.length + 1,
      publicId: randomUUID(),
      conteudo,
      autorEhEquipe: daEquipe,
      lida: false,
      lidaEm: null,
      criadoEm: this.tick(),
      conversaId: c.id,
      autorId,
    };
    this.mensagens.push(m);
    return { ...m };
  }
  buscar(publicId: string) {
    const c = this.conversas.find((x) => x.publicId === publicId);
    return Promise.resolve(c ? { ...c } : null);
  }
  listarDoUsuario(usuarioId: string) {
    return Promise.resolve(
      this.conversas.filter((c) => c.usuarioId === usuarioId).map((c) => this.resumo(c, false)),
    );
  }
  listarParaEquipe(
    f: { status?: StatusConversa },
    _c: CursorConversas | undefined,
    limite: number,
  ) {
    return Promise.resolve(
      this.conversas
        .filter((c) => !f.status || c.status === f.status)
        .sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime())
        .slice(0, limite)
        .map((c) => this.resumo(c, true)),
    );
  }
  listarMensagens(c: ConversaRegistro, cursor: CursorConversas | undefined, limite: number) {
    return Promise.resolve(
      this.mensagens
        .filter((m) => m.conversaId === c.id && (!cursor || m.criadoEm < cursor.data))
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite)
        .map((m) => ({ ...m })),
    );
  }
  enviar(c: ConversaRegistro, d: { autorId: string; conteudo: string; daEquipe: boolean }) {
    const conversa = this.conversas.find((x) => x.id === c.id);
    if (conversa?.status !== 'ABERTA') {
      return Promise.reject(new ErroDominio('CONFLITO', 'CONVERSA_ENCERRADA', 'encerrada'));
    }
    if (d.daEquipe) {
      conversa.atendenteNome ??= 'Karina Admin';
      if (!this.notificacoes.includes(c.publicId)) this.notificacoes.push(c.publicId);
    }
    conversa.atualizadoEm = new Date(this.t + 1000);
    return Promise.resolve(this.gravar(c, d.autorId, d.conteudo, d.daEquipe));
  }
  marcarLidas(
    c: ConversaRegistro,
    d: { leitorEhEquipe: boolean; ateMensagemId: string; em: Date },
  ) {
    const limite = this.mensagens.find(
      (m) => m.publicId === d.ateMensagemId && m.conversaId === c.id,
    );
    if (!limite) return Promise.resolve(0);
    let n = 0;
    for (const m of this.mensagens) {
      if (
        m.conversaId === c.id &&
        !m.lida &&
        m.autorEhEquipe !== d.leitorEhEquipe &&
        m.criadoEm <= limite.criadoEm
      ) {
        m.lida = true;
        m.lidaEm = d.em;
        n += 1;
      }
    }
    return Promise.resolve(n);
  }
  assumir(c: ConversaRegistro, _adminId: string, a: EntradaAuditoria) {
    const x = this.conversas.find((y) => y.id === c.id);
    if (x) x.atendenteNome = 'Outra Admin';
    this.auditoria.push(a);
    return Promise.resolve();
  }
  encerrar(c: ConversaRegistro, a: EntradaAuditoria) {
    const x = this.conversas.find((y) => y.id === c.id);
    if (x) x.status = 'ENCERRADA';
    this.auditoria.push(a);
    return Promise.resolve();
  }
}

class BarramentoFake implements BarramentoChat {
  readonly eventos: EventoChat[] = [];
  falhar = false;
  publicar(e: EventoChat) {
    if (this.falhar) return Promise.reject(new Error('redis fora'));
    this.eventos.push(e);
    return Promise.resolve();
  }
}

const ADMIN: Ator = { id: 'admin', role: 'ADMIN' };
const MARIA: Ator = { id: 'maria', role: 'USUARIO' };
const JOAO: Ator = { id: 'joao', role: 'USUARIO' };

let chat: ChatFake;
let barramento: BarramentoFake;
let falhas: unknown[];
let deps: {
  chat: ChatFake;
  barramento: BarramentoFake;
  relogio: RelogioFake;
  aoFalhar: (e: unknown) => void;
};

beforeEach(() => {
  chat = new ChatFake();
  barramento = new BarramentoFake();
  falhas = [];
  deps = { chat, barramento, relogio: new RelogioFake(), aoFalhar: (e) => falhas.push(e) };
});

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return 'SEM_ERRO';
}

const abrir = (ator: Ator = MARIA, mensagem = '  Olá, quero visitar o santuário!  ') =>
  new AbrirConversa(deps).executar({ ator, assunto: ' Visita ', mensagem });
const enviar = (ator: Ator, id: string, conteudo = 'Oi!') =>
  new EnviarMensagem(deps).executar({ ator, id, conteudo });

describe('chat', () => {
  it('abre conversa com a primeira mensagem e publica o evento em tempo real', async () => {
    const c = await abrir();
    expect(c).toMatchObject({ status: 'ABERTA', assunto: 'Visita', atendente: null, naoLidas: 0 });
    expect(c.ultimaMensagem?.conteudo).toBe('Olá, quero visitar o santuário!');
    expect(barramento.eventos).toEqual([
      expect.objectContaining({ tipo: 'mensagem.nova', conversaId: c.id, usuarioId: 'maria' }),
    ]);
  });

  it('uma conversa aberta por vez; depois de encerrada, pode abrir outra', async () => {
    const c = await abrir();
    expect(await codigoDe(abrir())).toBe('CONVERSA_ABERTA_EXISTENTE');
    await new EncerrarConversa(deps).executar({ ator: ADMIN, id: c.id });
    expect((await abrir()).status).toBe('ABERTA');
  });

  it('IDOR: outro usuário não lê, não escreve, não marca como lida (403)', async () => {
    const c = await abrir();
    const [m] = (await new ListarMensagens(deps).executar({ ator: MARIA, id: c.id })).itens;
    for (const p of [
      new ListarMensagens(deps).executar({ ator: JOAO, id: c.id }),
      enviar(JOAO, c.id),
      new MarcarMensagensLidas(deps).executar({ ator: JOAO, id: c.id, ateMensagemId: m?.id ?? '' }),
      new SinalizarDigitando(deps).executar({ ator: JOAO, id: c.id }),
    ]) {
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
    expect(
      await codigoDe(new ListarMensagens(deps).executar({ ator: MARIA, id: randomUUID() })),
    ).toBe('CONVERSA_NAO_ENCONTRADA');
  });

  it('equipe responde: assume a conversa, notifica uma vez só e o usuário vê "não lidas"', async () => {
    const c = await abrir();
    await enviar(ADMIN, c.id, 'Olá! Pode vir no sábado.');
    await enviar(ADMIN, c.id, 'Às 9h.');
    expect(chat.notificacoes).toEqual([c.id]);
    const [minha] = await new ListarMinhasConversas(deps).executar({ ator: MARIA });
    expect(minha).toMatchObject({ atendente: 'Karina', naoLidas: 2 });
    // O usuário vê só o primeiro nome de quem atende, e não recebe os dados de usuário.
    expect(minha).not.toHaveProperty('usuario');
  });

  it('"visto": marca até a mensagem informada, só as do outro lado, e publica uma vez', async () => {
    const c = await abrir();
    const r1 = await enviar(ADMIN, c.id, 'Primeira');
    const r2 = await enviar(ADMIN, c.id, 'Segunda');
    barramento.eventos.length = 0;
    const marcar = (ateMensagemId: string) =>
      new MarcarMensagensLidas(deps).executar({ ator: MARIA, id: c.id, ateMensagemId });
    await marcar(r1.id);
    expect(chat.mensagens.filter((m) => m.lida).map((m) => m.conteudo)).toEqual(['Primeira']);
    await marcar(r2.id);
    await marcar(r2.id); // nada novo: não publica de novo
    expect(barramento.eventos.map((e) => e.tipo)).toEqual(['mensagem.lida', 'mensagem.lida']);
    // A mensagem da própria Maria continua não lida (é a equipe quem lê).
    expect(chat.mensagens[0]?.lida).toBe(false);
  });

  it('conversa encerrada: não aceita mensagem; evento conversa.encerrada; encerrar 2x é idempotente', async () => {
    const c = await abrir();
    await new EncerrarConversa(deps).executar({ ator: ADMIN, id: c.id });
    await new EncerrarConversa(deps).executar({ ator: ADMIN, id: c.id });
    expect(await codigoDe(enviar(MARIA, c.id))).toBe('CONVERSA_ENCERRADA');
    expect(barramento.eventos.filter((e) => e.tipo === 'conversa.encerrada')).toHaveLength(1);
    expect(chat.auditoria.map((a) => a.acao)).toEqual(['CONVERSA_ENCERRADA']);
  });

  it('mensagem vazia ou longa → erro; falha no barramento não perde a mensagem', async () => {
    const c = await abrir();
    expect(await codigoDe(enviar(MARIA, c.id, '   '))).toBe('CAMPO_OBRIGATORIO');
    expect(await codigoDe(enviar(MARIA, c.id, 'x'.repeat(2001)))).toBe('CAMPO_MUITO_LONGO');
    barramento.falhar = true;
    expect((await enviar(MARIA, c.id, 'ainda chega')).conteudo).toBe('ainda chega');
    expect(falhas).toHaveLength(1);
  });

  it('digitando: só em conversa aberta, sem gravar nada', async () => {
    const c = await abrir();
    barramento.eventos.length = 0;
    await new SinalizarDigitando(deps).executar({ ator: ADMIN, id: c.id });
    expect(barramento.eventos).toEqual([
      { tipo: 'digitando', conversaId: c.id, usuarioId: 'maria', daEquipe: true },
    ]);
    await new EncerrarConversa(deps).executar({ ator: ADMIN, id: c.id });
    barramento.eventos.length = 0;
    await new SinalizarDigitando(deps).executar({ ator: MARIA, id: c.id });
    expect(barramento.eventos).toEqual([]);
  });

  it('equipe: lista ordenada pela mais recente, com dados do usuário; só ADMIN', async () => {
    const a = await abrir(MARIA);
    const b = await abrir(JOAO);
    await enviar(MARIA, a.id, 'nova mensagem');
    const lista = await new AdminListarConversas(deps).executar({ ator: ADMIN });
    expect(lista.itens.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(lista.itens[0]).toMatchObject({ usuario: { id: 'maria' }, naoLidas: 2 });
    await new AssumirConversa(deps).executar({ ator: ADMIN, id: b.id });
    for (const p of [
      new AdminListarConversas(deps).executar({ ator: MARIA }),
      new AssumirConversa(deps).executar({ ator: MARIA, id: a.id }),
      new EncerrarConversa(deps).executar({ ator: { id: 'ana', role: 'VOLUNTARIO' }, id: a.id }),
    ]) {
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
  });

  it('histórico paginado, mais recentes primeiro', async () => {
    const c = await abrir();
    for (let i = 1; i <= 4; i++) await enviar(MARIA, c.id, `m${String(i)}`);
    const p1 = await new ListarMensagens(deps).executar({ ator: MARIA, id: c.id, limite: 3 });
    expect(p1.itens.map((m) => m.conteudo)).toEqual(['m4', 'm3', 'm2']);
    const p2 = await new ListarMensagens(deps).executar({
      ator: MARIA,
      id: c.id,
      limite: 3,
      ...(p1.proximoCursor ? { cursor: p1.proximoCursor } : {}),
    });
    expect(p2.itens.map((m) => m.conteudo)).toEqual(['m1', 'Olá, quero visitar o santuário!']);
    expect(p2.proximoCursor).toBeNull();
  });
});
