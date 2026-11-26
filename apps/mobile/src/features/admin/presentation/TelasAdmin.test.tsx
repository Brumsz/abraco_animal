import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessao } from '@/core/sessao';
import {
  animalResumo,
  apiFalsa,
  entrarComoUsuario,
  json,
  renderizar,
  usuarioTeste,
} from '@/testes/utilitarios';

import LayoutAdmin from '../../../app/(app)/admin/_layout';
import TelaCentral from './TelaCentral';
import { TelaConversaEquipe, TelaConversasEquipe } from './TelasAtendimento';
import { TelaAdocaoEquipe } from './TelasAdocoes';
import { TelaDoacaoEquipe } from './TelasDoacoes';
import { TelaVoluntarioEquipe } from './TelasVoluntarios';

const mockRoteador = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
};
let mockParams: Record<string, string> = {};
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  Stack: () => null,
}));

const ID = '22222222-2222-4222-8222-222222222222';
const AGORA = new Date().toISOString();

const problema = (status: number, codigo: string) =>
  json({ type: 'about:blank', title: 'Erro', status, detail: 'Erro', codigo }, status);

const endereco = usuarioTeste.endereco;
const pessoa = {
  id: usuarioTeste.id,
  nome: 'Izabella Fortunato',
  email: 'iza@teste.org',
  telefone: '11987654321',
};

function entrarComoAdmin() {
  entrarComoUsuario();
  useSessao.setState({ usuario: { ...usuarioTeste, nome: 'Equipe ONG', role: 'ADMIN' } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: ID };
  entrarComoAdmin();
});

describe('proteção das telas da equipe', () => {
  it('quem não é admin volta para o Início', async () => {
    entrarComoUsuario();
    await renderizar(<LayoutAdmin />);
    expect(mockRedirect).toHaveBeenCalledWith('/inicio');
  });

  it('admin entra', async () => {
    await renderizar(<LayoutAdmin />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('Central', () => {
  it('mostra os números da spec, o gráfico e abre as pendências', async () => {
    apiFalsa({
      'GET /v1/admin/dashboard': json({
        adocoesPendentes: 8,
        doacoesAnimaisPendentes: 2,
        animaisDisponiveis: 21,
        doacoesFinanceirasMes: { quantidade: 3, total: '150.00' },
        adocoesPorMes: [
          { mes: '2026-06', total: 1 },
          { mes: '2026-07', total: 0 },
          { mes: '2026-08', total: 2 },
          { mes: '2026-09', total: 0 },
          { mes: '2026-10', total: 3 },
          { mes: '2026-11', total: 4 },
        ],
        ultimasPendencias: [
          { tipo: 'ADOCAO', id: ID, titulo: 'Alípio — Izabella Fortunato', criadoEm: AGORA },
        ],
      }),
    });
    await renderizar(<TelaCentral />);

    expect(await screen.findByLabelText('8 Pendentes')).toBeOnTheScreen();
    expect(screen.getByLabelText('21 Animais disponíveis')).toBeOnTheScreen();
    expect(screen.getByLabelText(/150,00 Pix no mês \(3\)/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/últimos 6 meses: jun\. 1, .* nov\. 4/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /^Adoção: Alípio/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ver solicitações' }));
    expect(mockRoteador.push.mock.calls).toEqual([
      [{ pathname: '/admin/adocoes/[id]', params: { id: ID } }],
      ['/admin/adocoes'],
    ]);
  });
});

const adocao = (sobrescrever: Record<string, unknown> = {}) => ({
  id: ID,
  status: 'PENDENTE',
  animal: animalResumo(),
  tipoMoradia: 'CHACARA',
  possuiEspacoAdequado: true,
  outrosAnimais: null,
  motivo: 'Tenho um sítio com pasto e baia e cuido de cavalos há anos.',
  termoAceitoEm: AGORA,
  analisadoEm: null,
  motivoRecusa: null,
  recusaAutomatica: false,
  criadoEm: AGORA,
  timeline: [],
  solicitante: { ...pessoa, endereco },
  analisadoPor: null,
  ...sobrescrever,
});

describe('Análise de adoção', () => {
  it('mostra solicitante e triagem; aprovar pede confirmação', async () => {
    const chamadas = apiFalsa({
      [`GET /v1/admin/adocoes/${ID}`]: json(adocao()),
      [`POST /v1/admin/adocoes/${ID}/aprovar`]: json(adocao({ status: 'APROVADA' })),
    });
    await renderizar(<TelaAdocaoEquipe />);

    expect(await screen.findByText('Adoção de Alípio')).toBeOnTheScreen();
    expect(screen.getByLabelText('Telefone: (11) 98765-4321')).toBeOnTheScreen();
    expect(screen.getByLabelText('Moradia: Chácara ou sítio')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Aprovar adoção' }));
    expect(screen.getByText(/recusados automaticamente/)).toBeOnTheScreen();
    const botoes = screen.getAllByRole('button', { name: 'Aprovar adoção' });
    await fireEvent.press(botoes[botoes.length - 1]!);

    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/aprovar'))).toBe(true);
    });
    expect(await screen.findByText('Adoção aprovada. Avisamos por e-mail.')).toBeOnTheScreen();
  });

  it('recusar exige motivo de 10+ caracteres e mostra o erro da API', async () => {
    const chamadas = apiFalsa({
      [`GET /v1/admin/adocoes/${ID}`]: json(adocao()),
      [`POST /v1/admin/adocoes/${ID}/recusar`]: problema(409, 'ADOCAO_JA_ANALISADA'),
    });
    await renderizar(<TelaAdocaoEquipe />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Recusar' }));
    await fireEvent.changeText(screen.getByLabelText('Motivo da recusa'), 'curto');
    const recusar = screen.getAllByRole('button', { name: 'Recusar' });
    await fireEvent.press(recusar[recusar.length - 1]!);
    expect(screen.getByText(/pelo menos 10 caracteres/)).toBeOnTheScreen();
    expect(chamadas.some((c) => c.url.endsWith('/recusar'))).toBe(false);

    await fireEvent.changeText(
      screen.getByLabelText('Motivo da recusa'),
      '  Precisamos de um espaço maior para o Alípio.  ',
    );
    await fireEvent.press(recusar[recusar.length - 1]!);
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/recusar'))).toBe(true);
    });
    const post = chamadas.find((c) => c.url.endsWith('/recusar'));
    expect(await post?.json()).toEqual({
      motivoRecusa: 'Precisamos de um espaço maior para o Alípio.',
    });
    expect(await screen.findByText(/Outra pessoa da equipe já analisou/)).toBeOnTheScreen();
  });

  it('pedido já analisado: sem ações, com o motivo', async () => {
    apiFalsa({
      [`GET /v1/admin/adocoes/${ID}`]: json(
        adocao({
          status: 'RECUSADA',
          analisadoEm: AGORA,
          analisadoPor: 'Equipe ONG',
          motivoRecusa: 'Sem espaço para equinos.',
          solicitante: null,
        }),
      ),
    });
    await renderizar(<TelaAdocaoEquipe />);

    expect(
      await screen.findByLabelText('Motivo da recusa: Sem espaço para equinos.'),
    ).toBeOnTheScreen();
    expect(screen.getByText(/Conta excluída a pedido do titular/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aprovar adoção' })).toBeNull();
  });
});

describe('Doação de animal', () => {
  it('aprovada: marcar como recebida cadastra o animal', async () => {
    const doacao = {
      id: ID,
      status: 'APROVADA',
      nomeAnimal: 'Estrela',
      tipo: 'EQUINO',
      raca: 'Crioula',
      idadeAprox: 30,
      sexo: 'FEMEA',
      porte: 'GRANDE',
      descricao: 'Mansa.',
      motivoDoacao: 'Mudança de cidade.',
      enderecoRetirada: 'Estrada do Sítio, 10 — Mairiporã/SP',
      fotos: [],
      doador: pessoa,
      analisadoEm: AGORA,
      analisadoPor: 'Equipe ONG',
      motivoRecusa: null,
      recebidoEm: null,
      animalCriadoId: null,
      criadoEm: AGORA,
      timeline: [],
    };
    const chamadas = apiFalsa({
      [`GET /v1/admin/doacoes-animais/${ID}`]: json(doacao),
      [`POST /v1/admin/doacoes-animais/${ID}/receber`]: json({
        ...doacao,
        status: 'RECEBIDA',
        animalCriadoId: ID,
      }),
    });
    await renderizar(<TelaDoacaoEquipe />);

    expect(
      await screen.findByLabelText('Idade, sexo e porte: 2 anos e 6 meses · Fêmea · Grande'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar como recebida' }));
    expect(screen.getByText(/em tratamento/)).toBeOnTheScreen();
    const botoes = screen.getAllByRole('button', { name: 'Marcar como recebida' });
    await fireEvent.press(botoes[botoes.length - 1]!);

    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/receber'))).toBe(true);
    });
    expect(await screen.findByText('Estrela foi cadastrado.')).toBeOnTheScreen();
  });
});

describe('Candidatura de voluntário', () => {
  it('aprova com cargo opcional', async () => {
    const candidatura = {
      id: ID,
      status: 'PENDENTE',
      candidato: { ...pessoa, endereco },
      areasInteresse: ['TRANSPORTE', 'CUIDADO_ANIMAIS'],
      areaInteresseOutros: null,
      disponibilidadeDias: ['SABADO', 'SEGUNDA'],
      turnos: ['MANHA'],
      motivacao: 'Tenho caminhonete e gosto muito de cavalos.',
      habilidades: null,
      cargo: null,
      analisadoEm: null,
      motivoRecusa: null,
      criadoEm: AGORA,
    };
    const chamadas = apiFalsa({
      [`GET /v1/admin/voluntarios/${ID}`]: json(candidatura),
      [`POST /v1/admin/voluntarios/${ID}/aprovar`]: json({
        ...candidatura,
        status: 'APROVADO',
        cargo: 'Motorista',
      }),
    });
    await renderizar(<TelaVoluntarioEquipe />);

    expect(
      await screen.findByLabelText('Áreas: Cuidado dos animais, Transporte'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Dias: Seg, Sáb')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Aprovar' }));
    await fireEvent.changeText(screen.getByLabelText('Cargo (opcional)'), ' Motorista ');
    const botoes = screen.getAllByRole('button', { name: 'Aprovar' });
    await fireEvent.press(botoes[botoes.length - 1]!);

    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/aprovar'))).toBe(true);
    });
    const post = chamadas.find((c) => c.url.endsWith('/aprovar'));
    expect(await post?.json()).toEqual({ cargo: 'Motorista' });
  });
});

const conversa = (sobrescrever: Record<string, unknown> = {}) => ({
  id: ID,
  assunto: null,
  status: 'ABERTA',
  atendente: null,
  ultimaMensagem: {
    id: 'm1',
    conteudo: 'Posso visitar o Alípio sábado?',
    autorEhEquipe: false,
    lida: false,
    lidaEm: null,
    criadoEm: AGORA,
  },
  naoLidas: 2,
  criadoEm: AGORA,
  atualizadoEm: AGORA,
  usuario: { id: usuarioTeste.id, nome: 'Izabella Fortunato' },
  ...sobrescrever,
});

describe('Atendimento', () => {
  it('lista as conversas abertas e busca por nome sem acento', async () => {
    apiFalsa({
      'GET /v1/admin/conversas': json({
        itens: [
          conversa(),
          conversa({
            id: '33333333-3333-4333-8333-333333333333',
            usuario: { id: ID, nome: 'Juliana Leão' },
            naoLidas: 0,
          }),
        ],
        proximoCursor: null,
      }),
    });
    await renderizar(<TelaConversasEquipe />);

    expect(
      await screen.findByRole('button', { name: /^Izabella Fortunato, .*2 não lidas$/ }),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Buscar por nome'), 'leao');
    expect(screen.queryByText('Izabella Fortunato')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Juliana Leão/ }));
    expect(mockRoteador.push).toHaveBeenCalledWith({
      pathname: '/admin/conversas/[id]',
      params: { id: '33333333-3333-4333-8333-333333333333' },
    });
  });

  it('a equipe vê as próprias mensagens como "Você", avisa a leitura e assume', async () => {
    const chamadas = apiFalsa({
      'GET /v1/admin/conversas': json({ itens: [conversa()], proximoCursor: null }),
      [`GET /v1/conversas/${ID}/mensagens`]: json({
        itens: [
          {
            id: 'm2',
            conteudo: 'Pode sim, às 9h.',
            autorEhEquipe: true,
            lida: false,
            lidaEm: null,
            criadoEm: AGORA,
          },
          conversa().ultimaMensagem,
        ],
        proximoCursor: null,
      }),
      [`POST /v1/conversas/${ID}/lidas`]: json(null, 204),
      [`POST /v1/admin/conversas/${ID}/assumir`]: json(null, 204),
    });
    await renderizar(<TelaConversaEquipe />);

    expect(await screen.findByText('Izabella Fortunato')).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Você, .*: Pode sim, às 9h\.$/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Izabella Fortunato, .*: Posso visitar/)).toBeOnTheScreen();
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/lidas'))).toBe(true);
    });
    const lidas = chamadas.find((c) => c.url.endsWith('/lidas'));
    expect(await lidas?.json()).toEqual({ ateMensagemId: 'm1' });

    await fireEvent.press(screen.getByRole('button', { name: 'Assumir atendimento' }));
    await waitFor(() => {
      expect(chamadas.some((c) => c.url.endsWith('/assumir'))).toBe(true);
    });
  });

  it('conversa encerrada é só leitura', async () => {
    apiFalsa({
      'GET /v1/admin/conversas': json({
        itens: [conversa({ status: 'ENCERRADA' })],
        proximoCursor: null,
      }),
      [`GET /v1/conversas/${ID}/mensagens`]: json({ itens: [], proximoCursor: null }),
    });
    await renderizar(<TelaConversaEquipe />);

    expect(await screen.findByText(/Conversa encerrada\. Só dá para ler/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Mensagem')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Encerrar' })).toBeNull();
  });
});
