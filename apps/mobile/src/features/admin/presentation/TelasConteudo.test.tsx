import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessao } from '@/core/sessao';
import { apiFalsa, entrarComoUsuario, json, renderizar, usuarioTeste } from '@/testes/utilitarios';

import { TelaFaqEquipe, TelaPerfilOngEquipe } from './TelasInstitucional';
import { TelaNoticiaEquipe, TelaNovaNoticia } from './TelasNoticias';
import { TelaNovoPost, TelaPostEquipe } from './TelasPosts';

const mockRoteador = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
};
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => mockParams,
}));
const mockGaleria = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockGaleria(...args) as unknown,
}));

const ID = '66666666-6666-4666-8666-666666666666';
const AGORA = new Date().toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: ID };
  entrarComoUsuario();
  useSessao.setState({ usuario: { ...usuarioTeste, role: 'ADMIN' } });
});

const noticia = (sobrescrever: Record<string, unknown> = {}) => ({
  id: ID,
  slug: 'trovao-foi-adotado',
  titulo: 'Trovão foi adotado',
  resumo: 'Depois de 2 anos, um lar.',
  conteudo: '# Que alegria\n\nTrovão foi para uma **fazenda**.',
  imagem: null,
  publicado: false,
  criadoEm: AGORA,
  atualizadoEm: AGORA,
  ...sobrescrever,
});

describe('Notícias', () => {
  it('nova notícia salva como rascunho e abre a edição', async () => {
    const chamadas = apiFalsa({ 'POST /v1/admin/noticias': json(noticia(), 201) });
    await renderizar(<TelaNovaNoticia />);

    await fireEvent.changeText(screen.getByLabelText('Título'), '  Trovão foi adotado ');
    await fireEvent.changeText(screen.getByLabelText('Resumo'), 'Depois de 2 anos, um lar.');
    await fireEvent.changeText(screen.getByLabelText('Texto da notícia'), '# Que alegria');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => {
      expect(mockRoteador.replace).toHaveBeenCalledWith({
        pathname: '/admin/noticias/[id]',
        params: { id: ID },
      });
    });
    expect(await chamadas[0]?.json()).toEqual({
      titulo: 'Trovão foi adotado',
      resumo: 'Depois de 2 anos, um lar.',
      conteudo: '# Que alegria',
    });
  });

  it('pré-visualiza o Markdown e publica', async () => {
    const chamadas = apiFalsa({
      [`GET /v1/admin/noticias/${ID}`]: json(noticia()),
      [`PUT /v1/admin/noticias/${ID}/publicacao`]: json(null, 204),
    });
    await renderizar(<TelaNoticiaEquipe />);

    expect(await screen.findByText('Endereço: /jornal/trovao-foi-adotado')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Pré-visualizar' }));
    expect(screen.getByText('Que alegria')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Publicar no Jornal' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/publicacao'))).toBe(true);
    });
    expect(await chamadas.find((c) => c.url.endsWith('/publicacao'))?.json()).toEqual({
      publicado: true,
    });
    expect(await screen.findByText('Notícia publicada!')).toBeOnTheScreen();
  });
});

describe('Posts', () => {
  it('não salva sem imagem; com imagem e legenda envia o multipart', async () => {
    const chamadas = apiFalsa({
      'POST /v1/admin/posts': json(
        {
          id: ID,
          legenda: 'Feira de adoção!',
          imagens: [],
          totalCurtidas: 0,
          curtidoPorMim: false,
          publicado: false,
          criadoEm: AGORA,
        },
        201,
      ),
    });
    await renderizar(<TelaNovoPost />);

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(screen.getByText('Escolha ao menos uma imagem.')).toBeOnTheScreen();
    expect(screen.getByText('Escreva uma legenda')).toBeOnTheScreen();
    expect(chamadas).toHaveLength(0);

    mockGaleria.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///feira.jpg', fileName: 'feira.jpg', mimeType: 'image/jpeg' }],
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar imagens' }));
    expect(await screen.findByRole('button', { name: 'Remover imagem 1' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Legenda'), 'Feira de adoção!');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => {
      expect(mockRoteador.replace).toHaveBeenCalledWith({
        pathname: '/admin/posts/[id]',
        params: { id: ID },
      });
    });
    expect(chamadas[0]?.method).toBe('POST');
  });

  it('publica um post da lista', async () => {
    const chamadas = apiFalsa({
      'GET /v1/admin/posts': json({
        itens: [
          {
            id: ID,
            legenda: 'Feira de adoção!',
            imagens: [{ id: 'i1', url: 'https://cdn.teste/1.webp', ordem: 0 }],
            totalCurtidas: 3,
            curtidoPorMim: false,
            publicado: false,
            criadoEm: AGORA,
          },
        ],
        proximoCursor: null,
      }),
      [`PUT /v1/admin/posts/${ID}/publicacao`]: json(null, 204),
    });
    await renderizar(<TelaPostEquipe />);

    expect(await screen.findByText('3 curtidas')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Publicar no feed' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'PUT')).toBe(true);
    });
    expect(await chamadas.find((c) => c.method === 'PUT')?.json()).toEqual({ publicado: true });
  });
});

describe('Perfil da ONG', () => {
  it('seção ainda não escrita começa com o nome da aba e salva', async () => {
    const chamadas = apiFalsa({
      'GET /v1/admin/perfil-ong': json([
        {
          secao: 'SOBRE_NOS',
          titulo: 'Quem somos',
          conteudo: 'Somos uma ONG.',
          publicado: true,
          atualizadoEm: AGORA,
        },
      ]),
      'PUT /v1/admin/perfil-ong/FUNDACAO': json({
        secao: 'FUNDACAO',
        titulo: 'Fundação',
        conteudo: 'Fundada em 2015.',
        publicado: true,
        atualizadoEm: AGORA,
      }),
    });
    await renderizar(<TelaPerfilOngEquipe />);

    expect(await screen.findByDisplayValue('Quem somos')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Fundação' }));
    expect(screen.getByDisplayValue('Fundação')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Texto'), 'Fundada em 2015.');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mostrar no app' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar seção' }));

    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'PUT')).toBe(true);
    });
    expect(await chamadas.find((c) => c.method === 'PUT')?.json()).toEqual({
      titulo: 'Fundação',
      conteudo: 'Fundada em 2015.',
      publicado: true,
    });
  });
});

describe('FAQ', () => {
  const faq = [
    {
      id: 'q2',
      pergunta: 'Posso visitar?',
      resposta: 'Sim, aos sábados.',
      ordem: 1,
      publicado: true,
    },
    { id: 'q1', pergunta: 'Como adotar?', resposta: 'Pelo app.', ordem: 0, publicado: false },
  ];

  it('mostra na ordem, reordena e cria pergunta', async () => {
    const chamadas = apiFalsa({
      'GET /v1/admin/faq': json(faq),
      'PUT /v1/admin/faq/ordem': json(null, 204),
      'POST /v1/admin/faq': json({ ...faq[0], id: 'q3', ordem: 2 }, 201),
    });
    await renderizar(<TelaFaqEquipe />);

    const botoes = await screen.findAllByRole('button', { name: /^Editar: / });
    expect(botoes.map((b) => b.props.accessibilityLabel as string)).toEqual([
      'Editar: Como adotar?, rascunho',
      'Editar: Posso visitar?',
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Descer: Como adotar?' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/faq/ordem'))).toBe(true);
    });
    expect(await chamadas.find((c) => c.url.endsWith('/faq/ordem'))?.json()).toEqual({
      ids: ['q2', 'q1'],
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Nova pergunta' }));
    await fireEvent.changeText(screen.getByLabelText('Pergunta'), 'Aceitam doação de ração?');
    await fireEvent.changeText(screen.getByLabelText('Resposta'), 'Sim, na sede.');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar pergunta' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'POST')).toBe(true);
    });
    expect(await chamadas.find((c) => c.method === 'POST')?.json()).toEqual({
      pergunta: 'Aceitam doação de ração?',
      resposta: 'Sim, na sede.',
      publicado: true,
    });
  });
});
