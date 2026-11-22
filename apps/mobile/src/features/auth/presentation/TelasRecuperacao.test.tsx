import { ToastProvider } from '@abraco/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { BarraNavegacao } from '@/shared/componentes/BarraNavegacao';

import { useFluxoRecuperacao } from '../data/fluxo-recuperacao';
import { TelaRecuperarCodigo, TelaRecuperarEmail } from './TelasRecuperacao';

const mockRoteador = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  Redirect: ({ href }: { href: string }) => `redirect:${href}`,
}));

const json = (corpo: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

let fetchMock: jest.Mock<Promise<Response>, [Request]>;

beforeEach(() => {
  jest.clearAllMocks();
  useFluxoRecuperacao.setState({ email: null, tokenRedefinicao: null });
  fetchMock = jest.fn<Promise<Response>, [Request]>();
  globalThis.fetch = ((req: Request) => fetchMock(req)) as typeof fetch;
});

async function renderizar(tela: React.ReactElement) {
  // gcTime infinito: sem timer de limpeza pendurado depois do teste.
  const qc = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{tela}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('recuperação de senha', () => {
  it('passo 1: pede o código e guarda o e-mail só na memória', async () => {
    fetchMock.mockResolvedValue(json(null, 204));
    await renderizar(<TelaRecuperarEmail />);

    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'karina@abraco.org');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));

    await waitFor(() => {
      expect(mockRoteador.push).toHaveBeenCalledWith('/recuperar-senha/codigo');
    });
    expect(useFluxoRecuperacao.getState().email).toBe('karina@abraco.org');
  });

  it('passo 2: código colado é conferido sozinho e o token segue para o passo 3', async () => {
    useFluxoRecuperacao.setState({ email: 'karina@abraco.org' });
    fetchMock.mockResolvedValue(json({ tokenRedefinicao: 'tok-123' }));
    await renderizar(<TelaRecuperarCodigo />);

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '123456');

    await waitFor(() => {
      expect(mockRoteador.replace).toHaveBeenCalledWith('/recuperar-senha/nova-senha');
    });
    expect(await fetchMock.mock.calls[0]?.[0].json()).toEqual({
      email: 'karina@abraco.org',
      codigo: '123456',
    });
    expect(useFluxoRecuperacao.getState().tokenRedefinicao).toBe('tok-123');
  });

  it('passo 2: código errado mostra a mensagem e limpa as caixas', async () => {
    useFluxoRecuperacao.setState({ email: 'karina@abraco.org' });
    fetchMock.mockResolvedValue(json({ codigo: 'CODIGO_INVALIDO', detail: 'x' }, 422));
    await renderizar(<TelaRecuperarCodigo />);

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '000000');

    expect(await screen.findByText(/Código incorreto ou expirado/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Código de 6 dígitos').props.value).toBe('');
    expect(screen.getByText(/Reenviar código em \d+s/)).toBeOnTheScreen();
  });
});

describe('BarraNavegacao', () => {
  function props(ocultas: string[]): BottomTabBarProps {
    const nomes = ['inicio', 'adotar', 'doar', 'central', 'chat', 'perfil'];
    const routes = nomes.map((name) => ({ key: `${name}-k`, name, params: undefined }));
    return {
      state: { index: 0, routes },
      descriptors: Object.fromEntries(
        routes.map((r) => [r.key, { options: { hidden: ocultas.includes(r.name) } }]),
      ),
      emitter: { emit: jest.fn(() => ({ defaultPrevented: false })) },
      navigateToTab: jest.fn(),
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    } as unknown as BottomTabBarProps;
  }

  it('usuário vê Doar; a aba Central não aparece', async () => {
    const p = props(['central']);
    await render(<BarraNavegacao {...p} />);

    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel as string)).toEqual([
      'Início',
      'Adotar',
      'Doar',
      'Chat',
      'Perfil',
    ]);
    expect(screen.getByRole('tab', { name: 'Início' })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'Doar' }));
    expect(p.navigateToTab).toHaveBeenCalledWith('doar-k');
  });

  it('admin vê Central no lugar de Doar', async () => {
    await render(<BarraNavegacao {...props(['doar'])} />);
    expect(screen.queryByRole('tab', { name: 'Doar' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Central' })).toBeOnTheScreen();
  });
});
