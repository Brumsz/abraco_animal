import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type * as ReactNative from 'react-native';

import TelaAdotar from '@/features/animais/presentation/TelaAdotar';
import TelaAnimal from '@/features/animais/presentation/TelaAnimal';
import {
  animalDetalhe,
  animalResumo,
  apiFalsa,
  entrarComoUsuario,
  ID_ANIMAL,
  json,
  renderizar,
} from '@/testes/utilitarios';

import TelaAvisoAdocao from './TelaAvisoAdocao';
import TelaFormularioAdocao from './TelaFormularioAdocao';

const mockRoteador = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  canGoBack: () => true,
};
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: unknown }) => {
    const { Text } = jest.requireActual<typeof ReactNative>('react-native');
    return <Text>{`redirect:${JSON.stringify(href)}`}</Text>;
  },
}));

const MOTIVO = 'Tenho um sítio com pasto e baia, e cuido de dois cavalos há dez anos.';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  entrarComoUsuario();
});

describe('Adotar (lista)', () => {
  it('mostra os animais e filtra por espécie na API', async () => {
    const chamadas = apiFalsa({
      'GET /v1/animais': (req) => {
        const tipo = new URL(req.url).searchParams.get('tipo');
        return json({
          itens:
            tipo === 'CANINO'
              ? [animalResumo({ id: 'c1', nome: 'Pipoca', tipo: 'CANINO', raca: 'Vira-lata' })]
              : [animalResumo()],
          proximoCursor: null,
        });
      },
    });
    await renderizar(<TelaAdotar />);

    expect(await screen.findByText('Alípio')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Todos' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: 'Caninos' }));
    expect(await screen.findByText('Pipoca')).toBeOnTheScreen();
    expect(new URL(chamadas.at(-1)?.url ?? '').searchParams.get('tipo')).toBe('CANINO');
  });

  it('"Quero adotar" leva ao aviso; o cartão leva ao detalhe', async () => {
    apiFalsa({ 'GET /v1/animais': json({ itens: [animalResumo()], proximoCursor: null }) });
    await renderizar(<TelaAdotar />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Quero adotar Alípio' }));
    await fireEvent.press(screen.getByRole('button', { name: /Alípio, Mustangue/ }));
    expect(mockRoteador.push.mock.calls).toEqual([
      [{ pathname: '/adocao/[animalId]', params: { animalId: ID_ANIMAL } }],
      [{ pathname: '/animal/[id]', params: { id: ID_ANIMAL } }],
    ]);
  });

  it('lista vazia explica e não fica em branco', async () => {
    apiFalsa({ 'GET /v1/animais': json({ itens: [], proximoCursor: null }) });
    await renderizar(<TelaAdotar />);
    expect(await screen.findByText('Nenhum animal esperando agora')).toBeOnTheScreen();
  });
});

describe('detalhe do animal', () => {
  it('mostra a ficha e apadrinha com recado opcional', async () => {
    mockParams = { id: ID_ANIMAL };
    const chamadas = apiFalsa({
      'GET /v1/animais/11111111-1111-4111-8111-111111111111': json(animalDetalhe()),
      'POST /v1/apadrinhamentos': json({}, 201),
    });
    await renderizar(<TelaAnimal />);

    expect(await screen.findByText('8 anos')).toBeOnTheScreen();
    expect(screen.getByText('Muito grande')).toBeOnTheScreen();
    expect(screen.getByText('2 padrinhos')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Apadrinhar' }));
    await fireEvent.changeText(
      screen.getByLabelText('Recado para a equipe (opcional)'),
      ' Força, Alípio! ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Quero ser padrinho' }));

    expect(await screen.findByText('Agora você é padrinho(a) de Alípio!')).toBeOnTheScreen();
    const post = chamadas.find((c) => c.method === 'POST');
    expect(await post?.json()).toEqual({ animalId: ID_ANIMAL, mensagemPadrinho: 'Força, Alípio!' });
  });
});

describe('aviso e formulário de adoção', () => {
  it('só continua depois de aceitar o termo', async () => {
    mockParams = { animalId: ID_ANIMAL };
    await renderizar(<TelaAvisoAdocao />);

    const continuar = screen.getByRole('button', { name: 'Entendi, continuar' });
    expect(continuar).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: /aceito o termo/ }));
    await fireEvent.press(continuar);
    expect(mockRoteador.push).toHaveBeenCalledWith({
      pathname: '/adocao/[animalId]/formulario',
      params: { animalId: ID_ANIMAL, termo: 'aceito' },
    });
  });

  it('sem o aceite (link direto), volta para o aviso', async () => {
    mockParams = { animalId: ID_ANIMAL };
    apiFalsa({ 'GET /v1/animais/11111111-1111-4111-8111-111111111111': json(animalDetalhe()) });
    await renderizar(<TelaFormularioAdocao />);
    expect(screen.getByText(/redirect:.*adocao/)).toBeOnTheScreen();
  });

  it('envia a triagem com o termo aceito e mostra a confirmação', async () => {
    mockParams = { animalId: ID_ANIMAL, termo: 'aceito' };
    const chamadas = apiFalsa({
      'GET /v1/animais/11111111-1111-4111-8111-111111111111': json(animalDetalhe()),
      'POST /v1/adocoes': json({}, 201),
    });
    await renderizar(<TelaFormularioAdocao />);

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText('Escolha onde você mora')).toBeOnTheScreen();
    expect(screen.getByText('Responda sim ou não')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Chácara ou sítio' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sim' }));
    await fireEvent.changeText(screen.getByLabelText('Qual seu interesse nessa adoção?'), MOTIVO);
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar pedido' }));

    expect(await screen.findByText('Pedido enviado!')).toBeOnTheScreen();
    const post = chamadas.find((c) => c.method === 'POST');
    expect(await post?.json()).toEqual({
      animalId: ID_ANIMAL,
      tipoMoradia: 'CHACARA',
      possuiEspacoAdequado: true,
      motivo: MOTIVO,
      outrosAnimais: null,
      aceitouTermo: true,
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar para o início' }));
    expect(mockRoteador.dismissTo).toHaveBeenCalledWith('/inicio');
  });

  it('pedido já em análise: mensagem clara, sem sair do formulário', async () => {
    mockParams = { animalId: ID_ANIMAL, termo: 'aceito' };
    apiFalsa({
      'GET /v1/animais/11111111-1111-4111-8111-111111111111': json(animalDetalhe()),
      'POST /v1/adocoes': json({ codigo: 'ADOCAO_PENDENTE_EXISTENTE', detail: 'x' }, 409),
    });
    await renderizar(<TelaFormularioAdocao />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Fazenda' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Não' }));
    await fireEvent.changeText(screen.getByLabelText('Qual seu interesse nessa adoção?'), MOTIVO);
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => {
      expect(screen.getByText(/já tem um pedido de adoção em análise/)).toBeOnTheScreen();
    });
    expect(screen.queryByText('Pedido enviado!')).toBeNull();
  });
});
