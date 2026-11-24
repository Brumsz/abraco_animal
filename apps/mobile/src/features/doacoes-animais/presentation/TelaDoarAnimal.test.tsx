import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { apiFalsa, entrarComoUsuario, json, renderizar } from '@/testes/utilitarios';

import TelaDoarAnimal from './TelaDoarAnimal';

const mockRoteador = {
  push: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const escolher = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

async function preencher() {
  await fireEvent.press(screen.getByRole('button', { name: 'Adicionar fotos' }));
  await fireEvent.changeText(screen.getByLabelText('Nome do animal'), 'Trovão');
  await fireEvent.press(screen.getByRole('radio', { name: 'Equino' }));
  await fireEvent.changeText(screen.getByLabelText('Raça'), 'Mangalarga');
  await fireEvent.changeText(screen.getByLabelText('Anos'), '2');
  await fireEvent.changeText(screen.getByLabelText('Meses'), '6');
  await fireEvent.press(screen.getByRole('radio', { name: 'Macho' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Grande' }));
  await fireEvent.changeText(screen.getByLabelText('Como ele é?'), 'Manso e saudável.');
  await fireEvent.changeText(
    screen.getByLabelText('Por que você está doando?'),
    'Vou me mudar para a cidade.',
  );
}

describe('Doar um animal', () => {
  it('sugere o endereço do cadastro e envia dados + fotos no multipart', async () => {
    escolher.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///trovao.jpg',
          fileName: 'trovao.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1000,
        },
      ],
    });
    const chamadas = apiFalsa({ 'POST /v1/doacoes-animais': json({}, 201) });
    await renderizar(<TelaDoarAnimal />);

    expect(screen.getByLabelText('Onde o animal está?').props.value).toBe(
      'Praça da Sé, 1 - Sé, São Paulo/SP',
    );
    await preencher();
    expect(screen.getByText('Fotos (1 de 10)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar para a ONG' }));

    expect(await screen.findByText('Recebemos!')).toBeOnTheScreen();
    // O tipo FormData do React Native não declara get/getAll (o do Node, usado no teste, tem).
    const form = (await chamadas[0]?.formData()) as unknown as
      { get: (k: string) => unknown; getAll: (k: string) => unknown[] } | undefined;
    expect(JSON.parse(String(form?.get('dados')))).toEqual({
      nomeAnimal: 'Trovão',
      tipo: 'EQUINO',
      raca: 'Mangalarga',
      idadeAprox: 30,
      sexo: 'MACHO',
      porte: 'GRANDE',
      descricao: 'Manso e saudável.',
      motivoDoacao: 'Vou me mudar para a cidade.',
      enderecoRetirada: 'Praça da Sé, 1 - Sé, São Paulo/SP',
    });
    expect(form?.getAll('fotos')).toHaveLength(1);
  });

  it('sem foto não envia; foto pode ser removida', async () => {
    escolher.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.jpg' }] });
    const chamadas = apiFalsa({});
    await renderizar(<TelaDoarAnimal />);

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar para a ONG' }));
    expect(await screen.findByText('Envie ao menos uma foto do animal')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar fotos' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remover foto 1' }));
    await waitFor(() => {
      expect(screen.getByText('Fotos (0 de 10)')).toBeOnTheScreen();
    });
    expect(chamadas).toHaveLength(0);
  });

  it('erro de campo da API aparece no campo certo (idade → Anos)', async () => {
    escolher.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.jpg' }] });
    apiFalsa({
      'POST /v1/doacoes-animais': json(
        {
          codigo: 'VALIDACAO',
          detail: 'x',
          erros: [{ campo: 'idadeAprox', mensagem: 'Idade fora do limite' }],
        },
        422,
      ),
    });
    await renderizar(<TelaDoarAnimal />);
    await preencher();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar para a ONG' }));

    expect(await screen.findByText('Idade fora do limite')).toBeOnTheScreen();
  });
});
