import type { Conversa, Mensagem } from '@abraco/api-client';

import { conversaAtual, situacaoEnvio, ultimaDaEquipeNaoLida } from './conversa';

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
    expect(ultimaDaEquipeNaoLida([msg('3', false), msg('2', true), msg('1', true)])).toBe('2');
    expect(ultimaDaEquipeNaoLida([msg('2', true, true), msg('1', true)])).toBeNull();
    expect(ultimaDaEquipeNaoLida([msg('1', false)])).toBeNull();
  });

  it('situação do envio', () => {
    const hora = () => '10:42';
    expect(situacaoEnvio(msg('1', false), hora)).toBe('Enviada · 10:42');
    expect(situacaoEnvio(msg('1', false, true), hora)).toBe('Vista · 10:42');
  });
});
