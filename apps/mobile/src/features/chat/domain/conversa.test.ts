import type { Conversa, Mensagem } from '@abraco/api-client';

import { conversaAtual, previaConversa, situacaoEnvio, ultimaDoOutroLadoNaoLida } from './conversa';

const conversa = (id: string, status: 'ABERTA' | 'ENCERRADA') =>
  ({ id, status }) as unknown as Conversa;
const msg = (id: string, autorEhEquipe: boolean, lida = false): Mensagem => ({
  id,
  conteudo: id,
  autorEhEquipe,
  lida,
  lidaEm: lida ? '2026-11-24T10:50:00.000Z' : null,
  criadoEm: '2026-11-24T10:42:00.000Z',
});

describe('chat do usuário', () => {
  it('mostra só a conversa aberta', () => {
    expect(conversaAtual([conversa('a', 'ENCERRADA'), conversa('b', 'ABERTA')])?.id).toBe('b');
    expect(conversaAtual([conversa('a', 'ENCERRADA')])).toBeNull();
    expect(conversaAtual(undefined)).toBeNull();
  });

  it('marca como lida até a mensagem mais nova da equipe', () => {
    const usuario = false;
    expect(
      ultimaDoOutroLadoNaoLida([msg('3', false), msg('2', true), msg('1', true)], usuario),
    ).toBe('2');
    expect(ultimaDoOutroLadoNaoLida([msg('2', true, true), msg('1', true)], usuario)).toBeNull();
    expect(ultimaDoOutroLadoNaoLida([msg('1', false)], usuario)).toBeNull();
  });

  it('a equipe avisa "li" até a mensagem mais nova do usuário', () => {
    const equipe = true;
    expect(ultimaDoOutroLadoNaoLida([msg('3', true), msg('2', false)], equipe)).toBe('2');
    expect(ultimaDoOutroLadoNaoLida([msg('2', false, true)], equipe)).toBeNull();
  });

  it('prévia da conversa na lista da equipe', () => {
    expect(previaConversa({ ultimaMensagem: msg('Oi', false) })).toBe('Oi');
    expect(previaConversa({ ultimaMensagem: msg('Pode vir', true) })).toBe('ONG: Pode vir');
    expect(previaConversa({ ultimaMensagem: null })).toBe('Sem mensagens');
  });

  it('situação do envio', () => {
    const hora = () => '10:42';
    expect(situacaoEnvio(msg('1', false), hora)).toBe('Enviada · 10:42');
    expect(situacaoEnvio(msg('1', false, true), hora)).toBe('Vista · 10:42');
  });
});
