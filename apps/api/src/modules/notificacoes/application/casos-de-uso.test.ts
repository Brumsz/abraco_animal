import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import {
  ContarNaoLidas,
  ListarNotificacoes,
  MarcarNotificacaoLida,
  MarcarTodasLidas,
  type CursorNotificacoes,
  type NotificacaoRegistro,
  type RepositorioNotificacoes,
} from './casos-de-uso.js';

class NotificacoesFake implements RepositorioNotificacoes {
  readonly lista: (NotificacaoRegistro & { dono: string; lidaEm: Date | null })[] = [];
  private t = Date.parse('2026-11-01T12:00:00Z');

  adicionar(dono: string, titulo: string) {
    this.t += 1000;
    const n = {
      dono,
      publicId: randomUUID(),
      tipo: 'GERAL' as const,
      titulo,
      corpo: '...',
      entidadeId: null,
      lidaEm: null,
      criadoEm: new Date(this.t),
    };
    this.lista.push(n);
    return n;
  }
  listar(usuarioId: string, cursor: CursorNotificacoes | undefined, limite: number) {
    return Promise.resolve(
      this.lista
        .filter((n) => n.dono === usuarioId)
        .filter((n) => !cursor || n.criadoEm < cursor.criadoEm)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite),
    );
  }
  contarNaoLidas(usuarioId: string) {
    return Promise.resolve(this.lista.filter((n) => n.dono === usuarioId && !n.lidaEm).length);
  }
  marcarLida(usuarioId: string, id: string, em: Date) {
    const n = this.lista.find((x) => x.publicId === id && x.dono === usuarioId);
    if (!n) return Promise.resolve(false);
    n.lidaEm ??= em;
    return Promise.resolve(true);
  }
  marcarTodasLidas(usuarioId: string, em: Date) {
    for (const n of this.lista) if (n.dono === usuarioId) n.lidaEm ??= em;
    return Promise.resolve();
  }
}

const MARIA: Ator = { id: 'maria', role: 'USUARIO' };
const JOAO: Ator = { id: 'joao', role: 'USUARIO' };

let repo: NotificacoesFake;
let deps: { notificacoes: NotificacoesFake; relogio: RelogioFake };

beforeEach(() => {
  repo = new NotificacoesFake();
  deps = { notificacoes: repo, relogio: new RelogioFake() };
});

describe('notificações', () => {
  it('lista só as do usuário, mais recentes primeiro, com paginação', async () => {
    repo.adicionar('maria', 'm1');
    repo.adicionar('joao', 'j1');
    repo.adicionar('maria', 'm2');
    repo.adicionar('maria', 'm3');

    const listar = new ListarNotificacoes(deps);
    const p1 = await listar.executar({ ator: MARIA, limite: 2 });
    expect(p1.itens.map((n) => n.titulo)).toEqual(['m3', 'm2']);
    const p2 = await listar.executar({
      ator: MARIA,
      limite: 2,
      ...(p1.proximoCursor ? { cursor: p1.proximoCursor } : {}),
    });
    expect(p2.itens.map((n) => n.titulo)).toEqual(['m1']);
    expect(p2.proximoCursor).toBeNull();
  });

  it('contador de não lidas, marcar uma e marcar todas', async () => {
    const a = repo.adicionar('maria', 'a');
    repo.adicionar('maria', 'b');
    repo.adicionar('joao', 'c');
    const contar = () => new ContarNaoLidas(deps).executar({ ator: MARIA });

    expect(await contar()).toEqual({ total: 2 });
    await new MarcarNotificacaoLida(deps).executar({ ator: MARIA, id: a.publicId });
    // Idempotente: marcar de novo não muda a data.
    deps.relogio.avancar(60_000);
    await new MarcarNotificacaoLida(deps).executar({ ator: MARIA, id: a.publicId });
    expect(repo.lista[0]?.lidaEm).toEqual(new Date('2026-11-11T12:00:00Z'));
    expect(await contar()).toEqual({ total: 1 });

    await new MarcarTodasLidas(deps).executar({ ator: MARIA });
    expect(await contar()).toEqual({ total: 0 });
    // As do João continuam não lidas.
    expect(await new ContarNaoLidas(deps).executar({ ator: JOAO })).toEqual({ total: 1 });
  });

  it('marcar a notificação de outra pessoa → 404 (sem revelar que existe)', async () => {
    const doJoao = repo.adicionar('joao', 'x');
    const erro = await new MarcarNotificacaoLida(deps)
      .executar({ ator: MARIA, id: doJoao.publicId })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect((erro as ErroDominio).codigo).toBe('NOTIFICACAO_NAO_ENCONTRADA');
    expect(doJoao.lidaEm).toBeNull();
  });
});
