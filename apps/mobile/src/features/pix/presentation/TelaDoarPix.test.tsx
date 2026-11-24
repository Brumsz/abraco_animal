import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import { caminhoQr } from './QrCodePix';
import TelaDoarPix from './TelaDoarPix';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const ID = '22222222-2222-4222-8222-222222222222';
const COPIA_COLA =
  '00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d520400005303986540525.005802BR5917ABRACO ANIMAL ONG6009SAO PAULO62070503***6304ABCD';

function cobranca(valor: string) {
  return {
    id: ID,
    valor,
    status: 'PENDENTE',
    anonima: false,
    pixCopiaCola: COPIA_COLA,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    paidAt: null,
    criadoEm: new Date().toISOString(),
  };
}

const statusPendente = json({ id: ID, status: 'PENDENTE', paidAt: null });

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

describe('Doar com Pix', () => {
  it('gera o Pix do valor escolhido com Idempotency-Key e mostra QR, valor e prazo', async () => {
    const chamadas = apiFalsa({
      'POST /v1/doacoes-financeiras': json(cobranca('50.00'), 201),
      [`GET /v1/doacoes-financeiras/${ID}/status`]: statusPendente,
    });
    await renderizar(<TelaDoarPix />);

    await fireEvent.press(screen.getByRole('radio', { name: 'R$ 50' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Gerar Pix de R$ 50,00' }));

    expect(await screen.findByTestId('qr-pix')).toBeOnTheScreen();
    expect(screen.getByText('R$ 50,00')).toBeOnTheScreen();
    expect(screen.getByText(/Expira em 1[45]:\d\d/)).toBeOnTheScreen();

    const post = chamadas.find((c) => c.method === 'POST');
    expect(await post?.json()).toEqual({ valor: '50.00' });
    expect(post?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('valor "Outro" abaixo do mínimo: avisa sem chamar a API', async () => {
    const chamadas = apiFalsa({});
    await renderizar(<TelaDoarPix />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Outro' }));
    await fireEvent.changeText(screen.getByLabelText('Outro valor'), '300');
    expect(screen.getByLabelText('Outro valor').props.value).toBe('R$ 3,00');
    await fireEvent.press(screen.getByRole('button', { name: 'Gerar Pix de R$ 3,00' }));

    expect(await screen.findByText('O valor mínimo é R$ 5,00')).toBeOnTheScreen();
    expect(chamadas).toHaveLength(0);
  });

  it('nova tentativa do MESMO valor reaproveita a Idempotency-Key (nunca duas cobranças)', async () => {
    let tentativa = 0;
    const chamadas = apiFalsa({
      'POST /v1/doacoes-financeiras': () => {
        tentativa += 1;
        return tentativa === 1
          ? json({ codigo: 'PSP_INDISPONIVEL', detail: 'x' }, 503)
          : json(cobranca('25.00'), 201);
      },
      [`GET /v1/doacoes-financeiras/${ID}/status`]: statusPendente,
    });
    await renderizar(<TelaDoarPix />);

    await fireEvent.press(screen.getByRole('button', { name: 'Gerar Pix de R$ 25,00' }));
    expect(await screen.findByText(/O Pix está fora do ar/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Gerar Pix de R$ 25,00' }));
    await screen.findByTestId('qr-pix');

    const chaves = chamadas
      .filter((c) => c.method === 'POST')
      .map((c) => c.headers.get('idempotency-key'));
    expect(chaves).toHaveLength(2);
    expect(chaves[0]).toBe(chaves[1]);
  });

  it('confirma sozinho quando o pagamento cai', async () => {
    apiFalsa({
      'POST /v1/doacoes-financeiras': json(cobranca('25.00'), 201),
      [`GET /v1/doacoes-financeiras/${ID}/status`]: json({
        id: ID,
        status: 'CONFIRMADA',
        paidAt: new Date().toISOString(),
      }),
    });
    await renderizar(<TelaDoarPix />);

    await fireEvent.press(screen.getByRole('button', { name: 'Gerar Pix de R$ 25,00' }));
    await waitFor(() => {
      expect(screen.getByText('Obrigado!')).toBeOnTheScreen();
    });
    expect(screen.getByText(/R\$ 25,00 foi confirmada/)).toBeOnTheScreen();
  });

  it('botão copiar coloca o copia e cola na área de transferência', async () => {
    apiFalsa({
      'POST /v1/doacoes-financeiras': json(cobranca('25.00'), 201),
      [`GET /v1/doacoes-financeiras/${ID}/status`]: statusPendente,
    });
    await renderizar(<TelaDoarPix />);
    await fireEvent.press(screen.getByRole('button', { name: 'Gerar Pix de R$ 25,00' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Copiar código Pix' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(COPIA_COLA);
    expect(await screen.findByText(/Código Pix copiado/)).toBeOnTheScreen();
  });
});

describe('QR do Pix', () => {
  it('gera a matriz a partir do copia e cola (determinístico)', () => {
    const a = caminhoQr(COPIA_COLA);
    expect(a.tamanho).toBeGreaterThanOrEqual(21);
    expect(a.d).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(caminhoQr(COPIA_COLA).d).toBe(a.d);
  });
});
