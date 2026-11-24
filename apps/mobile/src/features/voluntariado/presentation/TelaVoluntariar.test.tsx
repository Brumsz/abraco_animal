import { fireEvent, screen } from '@testing-library/react-native';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import TelaVoluntariar from './TelaVoluntariar';

const mockRoteador = {
  push: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));

const naoEncontrada = json(
  { type: 'about:blank', title: 'Não encontrado', status: 404, codigo: 'NAO_ENCONTRADO' },
  404,
);

const candidatura = {
  id: '55555555-5555-4555-8555-555555555555',
  status: 'PENDENTE',
  areasInteresse: ['CUIDADO_ANIMAIS', 'EVENTOS'],
  areaInteresseOutros: null,
  disponibilidadeDias: ['SABADO', 'DOMINGO'],
  turnos: ['MANHA'],
  motivacao: 'Amo cavalos e quero ajudar nos fins de semana.',
  habilidades: null,
  cargo: null,
  motivoRecusa: null,
  analisadoEm: null,
  criadoEm: '2026-11-20T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

describe('Voluntariar', () => {
  it('sem candidatura: preenche áreas, dias, turnos e motivação e envia', async () => {
    const chamadas = apiFalsa({
      'GET /v1/me/voluntariado': naoEncontrada,
      'POST /v1/voluntariado/candidaturas': json(candidatura, 201),
    });
    await renderizar(<TelaVoluntariar />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Enviar candidatura' }));
    expect(await screen.findByText('Escolha ao menos uma área')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Eventos' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Cuidado dos animais' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Sáb' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Manhã' }));
    await fireEvent.changeText(
      screen.getByLabelText('Por que você quer ser voluntário(a)?'),
      candidatura.motivacao,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar candidatura' }));

    expect(await screen.findByText('Candidatura enviada!')).toBeOnTheScreen();
    const post = chamadas.find((c) => c.method === 'POST');
    expect(await post?.json()).toEqual({
      areasInteresse: ['CUIDADO_ANIMAIS', 'EVENTOS'],
      areaInteresseOutros: null,
      disponibilidadeDias: ['SABADO'],
      turnos: ['MANHA'],
      motivacao: candidatura.motivacao,
      habilidades: null,
    });
  });

  it('"Outros" abre o campo de texto', async () => {
    apiFalsa({ 'GET /v1/me/voluntariado': naoEncontrada });
    await renderizar(<TelaVoluntariar />);

    expect(screen.queryByLabelText('Qual outra área?')).toBeNull();
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Outros' }));
    expect(screen.getByLabelText('Qual outra área?')).toBeOnTheScreen();
  });

  it('candidatura em análise: mostra o resumo, sem formulário', async () => {
    apiFalsa({ 'GET /v1/me/voluntariado': json(candidatura) });
    await renderizar(<TelaVoluntariar />);

    expect(await screen.findByText('Candidatura em análise')).toBeOnTheScreen();
    expect(screen.getByText('Cuidado dos animais, Eventos')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Enviar candidatura' })).toBeNull();
  });

  it('recusada: mostra o motivo e permite tentar de novo', async () => {
    apiFalsa({
      'GET /v1/me/voluntariado': json({
        ...candidatura,
        status: 'RECUSADO',
        motivoRecusa: 'No momento precisamos de pessoas aos sábados à tarde.',
      }),
    });
    await renderizar(<TelaVoluntariar />);

    expect(await screen.findByText(/aos sábados à tarde/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar nova candidatura' }));
    expect(screen.getByRole('button', { name: 'Enviar candidatura' })).toBeOnTheScreen();
  });
});
