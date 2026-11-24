import { fireEvent, screen } from '@testing-library/react-native';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import TelaPerfilOng from './TelaPerfilOng';

const mockRoteador = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));

const secao = (s: string, titulo: string, conteudo: string) => ({
  secao: s,
  titulo,
  conteudo,
  publicado: true,
  atualizadoEm: '2026-11-01T12:00:00.000Z',
});

beforeEach(() => {
  entrarComoUsuario();
  apiFalsa({
    'GET /v1/institucional/perfil': json([
      secao('SOBRE_NOS', 'Sobre nós', 'Resgatamos cavalos que sofreram maus-tratos.'),
      secao('FUNDADORES', 'Fundadores', 'Nossa líder, Karina Somaggio.'),
    ]),
    'GET /v1/institucional/faq': json([
      {
        id: '77777777-7777-4777-8777-777777777777',
        pergunta: 'Vocês possuem CNPJ?',
        resposta: 'Sim, somos uma associação registrada.',
        ordem: 0,
        publicado: true,
      },
    ]),
  });
});

describe('Perfil da ONG', () => {
  it('abas com o conteúdo da API; aba sem conteúdo avisa', async () => {
    await renderizar(<TelaPerfilOng />);

    expect(await screen.findByText(/maus-tratos/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Fundadores' }));
    expect(screen.getByText('Nossa líder, Karina Somaggio.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Fundação' }));
    expect(screen.getByText('Em breve a ONG conta mais por aqui.')).toBeOnTheScreen();
  });

  it('dúvidas abrem e fecham', async () => {
    await renderizar(<TelaPerfilOng />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Dúvidas' }));
    const pergunta = await screen.findByRole('button', { name: 'Vocês possuem CNPJ?' });
    expect(screen.queryByText(/associação registrada/)).toBeNull();
    await fireEvent.press(pergunta);
    expect(screen.getByText(/associação registrada/)).toBeOnTheScreen();
    expect(pergunta).toBeExpanded();
  });
});
