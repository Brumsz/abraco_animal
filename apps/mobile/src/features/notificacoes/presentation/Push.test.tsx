import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import { usePushNotificacoes } from '../data/push';
import { AvisosNoCelular } from './AvisosNoCelular';

const mockRoteador = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));

const ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

function ComPush() {
  usePushNotificacoes();
  return null;
}

describe('push no app', () => {
  it('no Expo Go/emulador o interruptor explica que precisa do app instalado', async () => {
    apiFalsa({});
    await renderizar(<AvisosNoCelular />);
    const chave = screen.getByLabelText('Avisos no celular');
    await waitFor(() => {
      expect(chave).toBeEnabled();
    });
    await fireEvent(chave, 'valueChange', true);
    expect(await screen.findByText(/funcionam no app instalado/)).toBeOnTheScreen();
  });

  it('tocar na notificação abre a tela do tipo e marca como lida', async () => {
    const chamadas = apiFalsa({ [`POST /v1/notificacoes/${ID}/lida`]: json(null, 204) });
    await renderizar(<ComPush />);

    const ouvinte = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock
      .calls[0]?.[0];
    expect(ouvinte).toBeDefined();
    ouvinte?.({
      notification: {
        request: {
          identifier: 'n-1',
          content: { data: { notificacaoId: ID, tipo: 'ADOCAO_APROVADA', entidadeId: null } },
        },
      },
    } as unknown as Notifications.NotificationResponse);

    expect(mockRoteador.push).toHaveBeenCalledWith('/minhas-adocoes');
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/lida'))).toBe(true);
    });
  });

  it('payload fora do formato abre o sino e não chama a API', async () => {
    const chamadas = apiFalsa({});
    await renderizar(<ComPush />);
    const ouvinte = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock
      .calls[0]?.[0];
    ouvinte?.({
      notification: {
        request: { identifier: 'n-2', content: { data: { url: 'https://malicioso.example' } } },
      },
    } as unknown as Notifications.NotificationResponse);
    expect(mockRoteador.push).toHaveBeenCalledWith('/notificacoes');
    expect(chamadas.filter((c) => c.url.includes('/notificacoes'))).toHaveLength(0);
  });
});
