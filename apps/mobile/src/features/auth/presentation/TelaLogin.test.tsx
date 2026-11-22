import { ToastProvider } from '@abraco/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useSessao } from '@/core/sessao';

import TelaCadastro from './TelaCadastro';
import TelaLogin from './TelaLogin';

const mockRoteador = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));

const usuario = {
  id: '00000000-0000-4000-8000-000000000001',
  nome: 'Karina Somaggio',
  email: 'karina@abraco.org',
  telefone: '11987654321',
  role: 'USUARIO',
  endereco: null,
  fotoUrl: null,
  capaUrl: null,
  criadoEm: '2026-11-01T12:00:00.000Z',
};
const sessao = { accessToken: 'a', refreshToken: 'r', expiraEm: '2026-11-22T13:00:00Z', usuario };

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

let fetchMock: jest.Mock<Promise<Response>, [Request]>;

beforeEach(() => {
  jest.clearAllMocks();
  useSessao.setState({ estado: 'anonimo', usuario: null, accessToken: null });
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

describe('TelaLogin', () => {
  it('mostra erros inline ao tentar entrar com o formulário vazio (sem chamar a API)', async () => {
    await renderizar(<TelaLogin />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe seu e-mail')).toBeOnTheScreen();
    expect(screen.getByText('Informe sua senha')).toBeOnTheScreen();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('entra: envia e-mail, senha e o deviceId do aparelho, guarda a sessão e segue', async () => {
    fetchMock.mockResolvedValue(json(sessao));
    await renderizar(<TelaLogin />);

    await fireEvent.changeText(screen.getByLabelText('E-mail'), ' karina@abraco.org ');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'cavalos2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockRoteador.replace).toHaveBeenCalledWith('/boas-vindas');
    });
    const corpo = (await fetchMock.mock.calls[0]?.[0].json()) as Record<string, string>;
    expect(corpo).toMatchObject({ email: 'karina@abraco.org', senha: 'cavalos2026' });
    expect(corpo.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(useSessao.getState()).toMatchObject({ estado: 'autenticado', accessToken: 'a' });
  });

  it('credenciais inválidas: mensagem clara, sem sair da tela', async () => {
    fetchMock.mockResolvedValue(json({ codigo: 'CREDENCIAIS_INVALIDAS', detail: 'x' }, 401));
    await renderizar(<TelaLogin />);

    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'karina@abraco.org');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'errada123');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeOnTheScreen();
    expect(mockRoteador.replace).not.toHaveBeenCalled();
  });

  it('links para criar conta e recuperar a senha', async () => {
    await renderizar(<TelaLogin />);
    await fireEvent.press(screen.getByRole('link', { name: 'Criar conta' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Esqueceu a senha?' }));
    expect(mockRoteador.push.mock.calls).toEqual([['/cadastro'], ['/recuperar-senha']]);
  });
});

describe('TelaCadastro', () => {
  async function preencherPasso1() {
    await fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Karina Somaggio');
    await fireEvent.changeText(screen.getByLabelText('Nascimento'), '15031990');
    await fireEvent.changeText(screen.getByLabelText('CPF'), '52998224725');
    await fireEvent.changeText(screen.getByLabelText('Telefone com DDD'), '11987654321');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'karina@abraco.org');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'cavalos2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  }

  it('passo 1 aplica as máscaras e valida antes de avançar', async () => {
    await renderizar(<TelaCadastro />);
    await fireEvent.changeText(screen.getByLabelText('CPF'), '52998224725');
    expect(screen.getByLabelText('CPF').props.value).toBe('529.982.247-25');

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Informe seu nome completo')).toBeOnTheScreen();
    expect(screen.queryByText('Onde você mora?')).toBeNull();
  });

  it('cria a conta: só dígitos para CPF/telefone/CEP, data ISO e consentimentos', async () => {
    fetchMock.mockResolvedValue(json(sessao, 201));
    await renderizar(<TelaCadastro />);
    await preencherPasso1();

    expect(await screen.findByText('Onde você mora?')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('CEP'), '01001000');
    await fireEvent.changeText(screen.getByLabelText('Rua'), 'Praça da Sé');
    await fireEvent.changeText(screen.getByLabelText('Número'), '1');
    await fireEvent.changeText(screen.getByLabelText('Bairro'), 'Sé');
    await fireEvent.changeText(screen.getByLabelText('Cidade'), 'São Paulo');
    await fireEvent.changeText(screen.getByLabelText('UF'), 'sp');

    // Sem os aceites, não envia.
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Aceite os termos de uso para continuar')).toBeOnTheScreen();
    expect(fetchMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Li e aceito os termos de uso' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /Autorizo o uso dos meus dados/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(mockRoteador.replace).toHaveBeenCalledWith('/boas-vindas');
    });
    const corpo = (await fetchMock.mock.calls[0]?.[0].json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({
      nome: 'Karina Somaggio',
      dataNasc: '1990-03-15',
      cpf: '52998224725',
      telefone: '11987654321',
      email: 'karina@abraco.org',
      endereco: {
        cep: '01001000',
        logradouro: 'Praça da Sé',
        numero: '1',
        complemento: null,
        bairro: 'Sé',
        cidade: 'São Paulo',
        uf: 'SP',
      },
      aceitouTermos: true,
      consentimentoDados: true,
    });
  });

  it('cadastro duplicado: avisa sem dizer se foi o e-mail ou o CPF', async () => {
    fetchMock.mockResolvedValue(json({ codigo: 'CADASTRO_DUPLICADO', detail: 'x' }, 409));
    await renderizar(<TelaCadastro />);
    await preencherPasso1();
    await screen.findByText('Onde você mora?');
    await fireEvent.changeText(screen.getByLabelText('CEP'), '01001000');
    await fireEvent.changeText(screen.getByLabelText('Rua'), 'Praça da Sé');
    await fireEvent.changeText(screen.getByLabelText('Número'), '1');
    await fireEvent.changeText(screen.getByLabelText('Bairro'), 'Sé');
    await fireEvent.changeText(screen.getByLabelText('Cidade'), 'São Paulo');
    await fireEvent.changeText(screen.getByLabelText('UF'), 'SP');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Li e aceito os termos de uso' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /Autorizo o uso dos meus dados/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText(/Já existe uma conta com estes dados/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Revisar meus dados' })).toBeOnTheScreen();
  });
});
