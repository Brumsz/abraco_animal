import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessao } from '@/core/sessao';
import {
  animalDetalhe,
  apiFalsa,
  entrarComoUsuario,
  ID_ANIMAL,
  json,
  renderizar,
  usuarioTeste,
} from '@/testes/utilitarios';

import TelaAuditoria from './TelaAuditoria';
import { TelaNovoAnimal } from './TelaFormAnimal';
import { TelaAnimalEquipe } from './TelasAnimais';
import { TelaUsuariosEquipe } from './TelasUsuarios';

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

const AGORA = new Date().toISOString();
const ID_ADMIN = '99999999-9999-4999-8999-999999999999';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: ID_ANIMAL };
  entrarComoUsuario();
  useSessao.setState({ usuario: { ...usuarioTeste, id: ID_ADMIN, role: 'ADMIN' } });
});

const ultimo = (nome: string) => {
  const botoes = screen.getAllByRole('button', { name: nome });
  return botoes[botoes.length - 1]!;
};

describe('Cadastro de animal', () => {
  it('envia a ficha com a idade em meses e abre a ficha para as fotos', async () => {
    const chamadas = apiFalsa({
      'POST /v1/admin/animais': json(animalDetalhe({ status: 'EM_TRATAMENTO' }), 201),
    });
    await renderizar(<TelaNovoAnimal />);

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Alípio');
    await fireEvent.press(screen.getByRole('radio', { name: 'Equino' }));
    await fireEvent.changeText(screen.getByLabelText('Raça'), 'Mustangue');
    await fireEvent.changeText(screen.getByLabelText('Anos'), '8');
    await fireEvent.changeText(screen.getByLabelText('Meses'), '2');
    await fireEvent.press(screen.getByRole('radio', { name: 'Macho' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Muito grande' }));
    await fireEvent.changeText(screen.getByLabelText('Como ele é'), 'Calmo e carinhoso.');
    await fireEvent.changeText(screen.getByLabelText('História do resgate'), 'Veio da estrada.');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Vacinado' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Disponível' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(mockRoteador.replace).toHaveBeenCalledWith({
        pathname: '/admin/animais/[id]',
        params: { id: ID_ANIMAL },
      });
    });
    expect(await chamadas[0]?.json()).toEqual({
      nome: 'Alípio',
      tipo: 'EQUINO',
      raca: 'Mustangue',
      idadeAprox: 98,
      sexo: 'MACHO',
      porte: 'MUITO_GRANDE',
      descricao: 'Calmo e carinhoso.',
      historiaResgate: 'Veio da estrada.',
      vacinado: true,
      castrado: false,
      status: 'DISPONIVEL',
    });
  });

  it('não envia sem os campos obrigatórios', async () => {
    const chamadas = apiFalsa({});
    await renderizar(<TelaNovoAnimal />);
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o nome')).toBeOnTheScreen();
    expect(screen.getByText('Escolha a espécie')).toBeOnTheScreen();
    expect(chamadas).toHaveLength(0);
  });
});

describe('Ficha do animal (equipe)', () => {
  const fotos = [
    { id: 'f2', url: 'https://cdn.teste/2.webp', ordem: 1 },
    { id: 'f1', url: 'https://cdn.teste/1.webp', ordem: 0 },
  ];

  it('muda o status e reordena as fotos (a primeira é a capa)', async () => {
    const chamadas = apiFalsa({
      [`GET /v1/animais/${ID_ANIMAL}`]: json(animalDetalhe({ fotos })),
      [`PATCH /v1/admin/animais/${ID_ANIMAL}/status`]: json(
        animalDetalhe({ fotos, status: 'INDISPONIVEL' }),
      ),
      [`PUT /v1/admin/animais/${ID_ANIMAL}/fotos`]: json(null, 204),
    });
    await renderizar(<TelaAnimalEquipe />);

    expect(await screen.findByLabelText('Foto 1, capa')).toBeOnTheScreen();
    expect(screen.getByText('Fotos (2 de 10)')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Indisponível' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'PATCH')).toBe(true);
    });
    expect(await chamadas.find((c) => c.method === 'PATCH')?.json()).toEqual({
      status: 'INDISPONIVEL',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Mover foto 2 para a frente' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'PUT')).toBe(true);
    });
    expect(await chamadas.find((c) => c.method === 'PUT')?.json()).toEqual({ ids: ['f2', 'f1'] });
  });

  it('adotado: explica que o status veio da adoção', async () => {
    apiFalsa({ [`GET /v1/animais/${ID_ANIMAL}`]: json(animalDetalhe({ status: 'ADOTADO' })) });
    await renderizar(<TelaAnimalEquipe />);
    expect(await screen.findByText(/Adotado pela aprovação de uma adoção/)).toBeOnTheScreen();
    expect(screen.getByText(/Sem fotos/)).toBeOnTheScreen();
  });

  it('remover pede confirmação e volta', async () => {
    apiFalsa({
      [`GET /v1/animais/${ID_ANIMAL}`]: json(animalDetalhe()),
      [`DELETE /v1/admin/animais/${ID_ANIMAL}`]: json(null, 204),
    });
    await renderizar(<TelaAnimalEquipe />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Remover animal' }));
    await fireEvent.press(ultimo('Remover animal'));
    await waitFor(() => {
      expect(mockRoteador.back).toHaveBeenCalled();
    });
  });
});

const usuario = (sobrescrever: Record<string, unknown> = {}) => ({
  id: '44444444-4444-4444-8444-444444444444',
  nome: 'Bruno da Silva',
  email: 'bruno@teste.org',
  telefone: '11912345678',
  role: 'USUARIO',
  ativo: true,
  cidade: 'São Paulo',
  uf: 'SP',
  criadoEm: AGORA,
  ...sobrescrever,
});

describe('Usuários', () => {
  it('busca por nome e promove a voluntário', async () => {
    const chamadas = apiFalsa({
      'GET /v1/admin/usuarios': json({ itens: [usuario()], proximoCursor: null }),
      'PATCH /v1/admin/usuarios/44444444-4444-4444-8444-444444444444/role': json(null, 204),
    });
    await renderizar(<TelaUsuariosEquipe />);

    await fireEvent.changeText(await screen.findByLabelText('Buscar por nome ou e-mail'), 'bru');
    await waitFor(() => {
      expect(chamadas.some((c) => new URL(c.url).searchParams.get('q') === 'bru')).toBe(true);
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Bruno da Silva, Usuário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Promover a voluntário' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.method === 'PATCH')).toBe(true);
    });
    expect(await chamadas.find((c) => c.method === 'PATCH')?.json()).toEqual({
      role: 'VOLUNTARIO',
    });
    expect(await screen.findByText('Bruno da Silva agora é voluntário(a).')).toBeOnTheScreen();
  });

  it('conta da equipe não tem ações', async () => {
    apiFalsa({
      'GET /v1/admin/usuarios': json({
        itens: [usuario({ nome: 'Ana Admin', role: 'ADMIN' })],
        proximoCursor: null,
      }),
    });
    await renderizar(<TelaUsuariosEquipe />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Ana Admin/ }));
    expect(screen.getByText(/não são alteradas pelo app/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Desativar conta' })).toBeNull();
  });
});

describe('Auditoria', () => {
  it('mostra a ação legível e filtra pelo período', async () => {
    const chamadas = apiFalsa({
      'GET /v1/admin/usuarios': json({
        itens: [usuario({ id: ID_ADMIN, nome: 'Equipe ONG', role: 'ADMIN' })],
        proximoCursor: null,
      }),
      'GET /v1/admin/auditoria': json({
        itens: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            admin: { id: ID_ADMIN, nome: 'Equipe ONG' },
            acao: 'USUARIO_ROLE_ALTERADA',
            entidade: 'Usuario',
            entidadeId: '44444444-4444-4444-8444-444444444444',
            detalhe: { de: 'USUARIO', para: 'VOLUNTARIO' },
            criadoEm: AGORA,
          },
        ],
        proximoCursor: null,
      }),
    });
    await renderizar(<TelaAuditoria />);

    expect(await screen.findByText('Mudou o papel de uma conta')).toBeOnTheScreen();
    expect(screen.getByText('de: USUARIO, para: VOLUNTARIO')).toBeOnTheScreen();
    const doLog = () => chamadas.filter((c) => c.url.includes('/auditoria'));
    expect(new URL(doLog()[0]!.url).searchParams.get('de')).not.toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Tudo' }));
    await waitFor(() => {
      expect(doLog().some((c) => !new URL(c.url).searchParams.has('de'))).toBe(true);
    });
  });
});
