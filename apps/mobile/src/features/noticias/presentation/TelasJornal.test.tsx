import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import TelaJornal from './TelaJornal';
import TelaNoticia from './TelaNoticia';

const mockRoteador = { push: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => ({ slug: 'trovao-foi-adotado' }),
}));

const noticia = {
  id: '66666666-6666-4666-8666-666666666666',
  slug: 'trovao-foi-adotado',
  titulo: 'Trovão foi adotado',
  resumo: 'Depois de dois anos, um lar.',
  imagem: null,
  publicado: true,
  criadoEm: new Date(2024, 2, 12, 10).toISOString(),
  atualizadoEm: new Date(2024, 2, 12, 10).toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

describe('Jornal', () => {
  it('lista com data e abre a notícia pelo slug', async () => {
    apiFalsa({ 'GET /v1/noticias': json({ itens: [noticia], proximoCursor: null }) });
    await renderizar(<TelaJornal />);

    expect(await screen.findByText('Trovão foi adotado')).toBeOnTheScreen();
    expect(screen.getByText('12/03/2024')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Trovão foi adotado/ }));
    expect(mockRoteador.push).toHaveBeenCalledWith({
      pathname: '/jornal/[slug]',
      params: { slug: 'trovao-foi-adotado' },
    });
  });

  it('leitura: Markdown vira texto nativo e o link abre fora do app', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    apiFalsa({
      'GET /v1/noticias/trovao-foi-adotado': json({
        ...noticia,
        conteudo: '## A história\n\nEle chegou **magro**.\n\n[Doe agora](https://abraco.org/doar)',
      }),
    });
    await renderizar(<TelaNoticia />);

    expect(await screen.findByRole('header', { name: 'A história' })).toBeOnTheScreen();
    expect(screen.getByText('magro')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Doe agora' }));
    expect(abrir).toHaveBeenCalledWith('https://abraco.org/doar');
  });
});
