import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import TelaNotificacoes from '@/features/notificacoes/presentation/TelaNotificacoes';
import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import TelaInicio from './TelaInicio';
import TelaVerbosDoAmor from './TelaVerbosDoAmor';

const mockRoteador = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));

const ID_POST = '33333333-3333-4333-8333-333333333333';
const post = {
  id: ID_POST,
  legenda: 'Boas-vindas ao Alípio!',
  imagens: [
    { id: '44444444-4444-4444-8444-444444444444', ordem: 0, url: 'https://s3.local/a.jpg' },
  ],
  curtidoPorMim: false,
  totalCurtidas: 128,
  criadoEm: new Date(Date.now() - 2 * 3600_000).toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

describe('Início', () => {
  it('saúda pelo primeiro nome, mostra o feed e o contador do sino', async () => {
    apiFalsa({
      'GET /v1/posts': json({ itens: [post], proximoCursor: null }),
      'GET /v1/notificacoes/nao-lidas': json({ total: 3 }),
    });
    await renderizar(<TelaInicio />);

    expect(screen.getByText('Olá, Karina!')).toBeOnTheScreen();
    expect(await screen.findByText('Boas-vindas ao Alípio!')).toBeOnTheScreen();
    expect(screen.getByText('Há 2 horas')).toBeOnTheScreen();

    const sino = await screen.findByRole('button', { name: 'Notificações, 3 não lidas' });
    await fireEvent.press(sino);
    expect(mockRoteador.push).toHaveBeenCalledWith('/notificacoes');
  });

  it('curtir atualiza na hora e chama a API', async () => {
    const chamadas = apiFalsa({
      'GET /v1/posts': json({ itens: [post], proximoCursor: null }),
      'GET /v1/notificacoes/nao-lidas': json({ total: 0 }),
      [`POST /v1/posts/${ID_POST}/curtida`]: json(null, 204),
    });
    await renderizar(<TelaInicio />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Curtir' }));
    // O cache avisa a tela num setTimeout(0): espera, não lê na hora.
    expect(await screen.findByText('129')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Descurtir' })).toBeSelected();
    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'POST')).toBe(true);
    });
  });

  it('banners com destino abrem Verbos do Amor e Jornal; o 1º é só imagem', async () => {
    apiFalsa({
      'GET /v1/posts': json({ itens: [], proximoCursor: null }),
      'GET /v1/notificacoes/nao-lidas': json({ total: 0 }),
    });
    await renderizar(<TelaInicio />);

    expect(await screen.findByText('Nenhuma publicação ainda')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: /Verbos do Amor/ }));
    await fireEvent.press(screen.getByRole('link', { name: /Jornal/ }));
    expect(mockRoteador.push.mock.calls).toEqual([['/verbos-do-amor'], ['/jornal']]);
    expect(screen.getByRole('image', { name: /Amar os animais/ })).toBeOnTheScreen();
  });
});

describe('Verbos do Amor', () => {
  it('"Doar" pergunta: Pix ou doar um animal', async () => {
    await renderizar(<TelaVerbosDoAmor />);

    await fireEvent.press(screen.getByRole('button', { name: /^Doar\./ }));
    expect(await screen.findByText('Como você quer doar?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Doar um animal' }));
    expect(mockRoteador.push).toHaveBeenCalledWith('/doar-animal');
  });

  it('Adotar, Voluntariar e Apadrinhar levam aos destinos certos', async () => {
    await renderizar(<TelaVerbosDoAmor />);

    await fireEvent.press(screen.getByRole('button', { name: /^Adotar\./ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Voluntariar\./ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Apadrinhar\./ }));
    expect(mockRoteador.push.mock.calls).toEqual([['/adotar'], ['/voluntariar'], ['/adotar']]);
    expect(await screen.findByText(/toque em "Apadrinhar"/)).toBeOnTheScreen();
  });
});

describe('Notificações', () => {
  const notificacao = (id: string, lida: boolean, tipo = 'ADOCAO_APROVADA') => ({
    id,
    tipo,
    titulo: tipo === 'CHAT_NOVA_MENSAGEM' ? 'Nova mensagem' : 'Adoção aprovada!',
    corpo: 'Veja os próximos passos.',
    entidadeId: null,
    lidaEm: lida ? new Date().toISOString() : null,
    criadoEm: new Date().toISOString(),
  });
  const ID_1 = '55555555-5555-4555-8555-555555555555';
  const ID_2 = '66666666-6666-4666-8666-666666666666';

  it('tocar marca como lida; mensagem do chat abre o chat', async () => {
    const chamadas = apiFalsa({
      'GET /v1/notificacoes': json({
        itens: [notificacao(ID_1, false), notificacao(ID_2, true, 'CHAT_NOVA_MENSAGEM')],
        proximoCursor: null,
      }),
      [`POST /v1/notificacoes/${ID_1}/lida`]: json(null, 204),
      'POST /v1/notificacoes/lidas': json(null, 204),
    });
    await renderizar(<TelaNotificacoes />);

    await fireEvent.press(
      await screen.findByRole('button', { name: /^Não lida\. Adoção aprovada!/ }),
    );
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith(`/${ID_1}/lida`))).toBe(true);
    });

    await fireEvent.press(screen.getByRole('button', { name: /^Nova mensagem/ }));
    expect(mockRoteador.push).toHaveBeenCalledWith('/chat');
    // Já lida: não chama a API de novo.
    expect(chamadas.filter((c) => c.url.endsWith('/lida'))).toHaveLength(1);
  });

  it('lista vazia explica o que aparece ali', async () => {
    apiFalsa({ 'GET /v1/notificacoes': json({ itens: [], proximoCursor: null }) });
    await renderizar(<TelaNotificacoes />);
    expect(await screen.findByText('Nada por aqui')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).toBeNull();
  });
});
