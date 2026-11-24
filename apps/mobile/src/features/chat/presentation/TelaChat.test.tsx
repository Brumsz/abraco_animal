import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import TelaChat from './TelaChat';

const ID_CONVERSA = '88888888-8888-4888-8888-888888888888';
const conversa = {
  id: ID_CONVERSA,
  assunto: null,
  status: 'ABERTA',
  atendente: 'Equipe',
  naoLidas: 1,
  criadoEm: '2026-11-24T10:00:00.000Z',
  atualizadoEm: '2026-11-24T10:45:00.000Z',
};
const mensagem = (id: string, conteudo: string, autorEhEquipe: boolean, lida = false) => ({
  id,
  conteudo,
  autorEhEquipe,
  lida,
  lidaEm: null,
  criadoEm: new Date().toISOString(),
});

beforeEach(() => {
  entrarComoUsuario();
});

describe('Chat com a ONG', () => {
  it('sem conversa aberta: a primeira mensagem abre uma', async () => {
    const chamadas = apiFalsa({
      'GET /v1/conversas': json([]),
      'POST /v1/conversas': json(conversa, 201),
    });
    await renderizar(<TelaChat />);

    expect(await screen.findByText('Fale com a ONG')).toBeOnTheScreen();
    const enviar = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(enviar).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Mensagem'), '  Como funciona a visita?  ');
    await fireEvent.press(enviar);

    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'POST')).toBe(true);
    });
    const post = chamadas.find((c) => c.method === 'POST');
    expect(await post?.json()).toEqual({ mensagem: 'Como funciona a visita?' });
  });

  it('conversa aberta: mostra as mensagens, avisa a leitura e envia', async () => {
    const chamadas = apiFalsa({
      'GET /v1/conversas': json([conversa]),
      [`GET /v1/conversas/${ID_CONVERSA}/mensagens`]: json({
        itens: [
          mensagem('m2', 'As visitas são aos sábados.', true),
          mensagem('m1', 'Olá! Como funciona a visita?', false, true),
        ],
        proximoCursor: null,
      }),
      [`POST /v1/conversas/${ID_CONVERSA}/lidas`]: json(null, 204),
      [`POST /v1/conversas/${ID_CONVERSA}/mensagens`]: json(
        mensagem('m3', 'O Alípio!', false),
        201,
      ),
    });
    await renderizar(<TelaChat />);

    expect(await screen.findByText('As visitas são aos sábados.')).toBeOnTheScreen();
    expect(screen.getByText('Hoje')).toBeOnTheScreen();
    expect(screen.getByText(/^Vista · /)).toBeOnTheScreen();
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/lidas'))).toBe(true);
    });
    const lidas = chamadas.find((c) => c.url.endsWith('/lidas'));
    expect(await lidas?.json()).toEqual({ ateMensagemId: 'm2' });

    await fireEvent.changeText(screen.getByLabelText('Mensagem'), 'O Alípio!');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(await screen.findByText('O Alípio!')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mensagem')).toHaveDisplayValue('');
  });
});
