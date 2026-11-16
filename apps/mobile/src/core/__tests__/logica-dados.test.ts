import { ErroApi, ErroRede, type Mensagem } from '@abraco/api-client';
import type { InfiniteData } from '@tanstack/react-query';

import { incluirMensagem, marcarLidas, type PaginaMensagens } from '@/features/chat/data/cache';
import { aplicarCurtida } from '@/features/feed/data/curtida';
import { intervaloStatusPix } from '@/features/pix/data/hooks';
import { deveRepetir } from '../consultas';

describe('retry das consultas', () => {
  it('falta de conexão: até 2 vezes; 5xx: 1 vez; 4xx: nunca', () => {
    const rede = new ErroRede(new Error('offline'));
    expect([0, 1, 2].map((n) => deveRepetir(n, rede))).toEqual([true, true, false]);
    const servidor = new ErroApi(503, 'X', 'fora');
    expect([0, 1].map((n) => deveRepetir(n, servidor))).toEqual([true, false]);
    expect(deveRepetir(0, new ErroApi(422, 'ANIMAL_NAO_DISPONIVEL', 'x'))).toBe(false);
    expect(deveRepetir(0, new ErroApi(401, 'TOKEN_INVALIDO', 'x'))).toBe(false);
    expect(deveRepetir(0, new Error('qualquer'))).toBe(false);
  });
});

describe('Pix: consulta periódica do status', () => {
  const agora = new Date('2026-11-16T12:00:00Z');
  const daqui = (min: number) => new Date(agora.getTime() + min * 60_000);

  it('a cada 5 s enquanto pendente e dentro do prazo', () => {
    expect(intervaloStatusPix(undefined, daqui(10), agora)).toBe(5000);
    expect(intervaloStatusPix('PENDENTE', daqui(1), agora)).toBe(5000);
  });

  it('para quando confirma, expira ou o prazo passa', () => {
    expect(intervaloStatusPix('CONFIRMADA', daqui(10), agora)).toBe(false);
    expect(intervaloStatusPix('EXPIRADA', daqui(10), agora)).toBe(false);
    expect(intervaloStatusPix('PENDENTE', daqui(-1), agora)).toBe(false);
  });
});

describe('curtida otimista', () => {
  it('soma/subtrai uma vez, sem negativo e sem efeito se já estava assim', () => {
    const post = { curtidoPorMim: false, totalCurtidas: 3 };
    expect(aplicarCurtida(post, true)).toEqual({ curtidoPorMim: true, totalCurtidas: 4 });
    expect(aplicarCurtida(post, false)).toBe(post);
    expect(aplicarCurtida({ curtidoPorMim: true, totalCurtidas: 0 }, false)).toEqual({
      curtidoPorMim: false,
      totalCurtidas: 0,
    });
  });
});

describe('cache do chat (eventos em tempo real)', () => {
  const msg = (id: string, autorEhEquipe: boolean, lida = false): Mensagem => ({
    id,
    conteudo: `m-${id}`,
    autorEhEquipe,
    lida,
    lidaEm: null,
    criadoEm: '2026-11-16T12:00:00.000Z',
  });
  const dados = (...paginas: Mensagem[][]): InfiniteData<PaginaMensagens, string | null> => ({
    pages: paginas.map((itens) => ({ itens, proximoCursor: null })),
    pageParams: paginas.map(() => null),
  });

  it('mensagem nova entra no topo; a mesma mensagem (REST + WebSocket) não duplica', () => {
    const d = dados([msg('b', true), msg('a', false)]);
    const com = incluirMensagem(d, msg('c', true));
    expect(com?.pages[0]?.itens.map((m) => m.id)).toEqual(['c', 'b', 'a']);
    expect(incluirMensagem(com, msg('c', true))).toBe(com);
    expect(incluirMensagem(undefined, msg('x', true))).toBeUndefined();
  });

  it('"visto": marca só as do outro lado, da mensagem informada para trás', () => {
    // Mais novas primeiro: e(equipe) d(usuário) c(equipe) | b(equipe) a(usuário)
    const d = dados(
      [msg('e', true), msg('d', false), msg('c', true)],
      [msg('b', true), msg('a', false)],
    );
    // O USUÁRIO leu até "c": marcam-se c e b (da equipe); "e" (mais nova) não.
    const r = marcarLidas(d, 'c', false);
    const lidas = r?.pages
      .flatMap((p) => p.itens)
      .filter((m) => m.lida)
      .map((m) => m.id);
    expect(lidas).toEqual(['c', 'b']);
  });

  it('mensagem fora do cache → null (o hook recarrega da API)', () => {
    expect(marcarLidas(dados([msg('a', true)]), 'nao-existe', false)).toBeNull();
  });
});
