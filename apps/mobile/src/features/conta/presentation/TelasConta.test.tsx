import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessao } from '@/core/sessao';
import { apiFalsa, entrarComoUsuario, json, renderizar, usuarioTeste } from '@/testes/utilitarios';

import TelaAlterarSenha from './TelaAlterarSenha';
import TelaEditarPerfil from './TelaEditarPerfil';
import TelaExcluirConta from './TelaExcluirConta';
import TelaPerfil from './TelaPerfil';

const mockRoteador = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));

const problema = (status: number, codigo: string, campo?: string, mensagem = 'Erro') =>
  json(
    {
      type: 'about:blank',
      title: mensagem,
      status,
      detail: mensagem,
      codigo,
      ...(campo ? { erros: [{ campo, mensagem }] } : {}),
    },
    status,
  );

beforeEach(() => {
  jest.clearAllMocks();
  entrarComoUsuario();
});

describe('Perfil', () => {
  it('mostra nome, os números do resumo e abre as telas do menu', async () => {
    apiFalsa({
      'GET /v1/me': json(usuarioTeste),
      'GET /v1/me/resumo': json({ adocoes: 2, doacoes: 5, apadrinhados: 1 }),
    });
    await renderizar(<TelaPerfil />);

    expect(screen.getByText('Karina Somaggio')).toBeOnTheScreen();
    expect(await screen.findByLabelText('5 Doações')).toBeOnTheScreen();
    expect(screen.getByLabelText('2 Adoções')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Editar perfil' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Sobre a ONG' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Configurações' })[0]!);
    expect(mockRoteador.push.mock.calls).toEqual([
      ['/perfil/editar'],
      ['/ong'],
      ['/configuracoes'],
    ]);
  });
});

describe('Editar perfil', () => {
  it('envia só dígitos e atualiza a sessão (a saudação da Home muda)', async () => {
    const chamadas = apiFalsa({
      'GET /v1/me': json(usuarioTeste),
      'PATCH /v1/me': json({ ...usuarioTeste, nome: 'Karina S. Lima', telefone: '21988887777' }),
    });
    await renderizar(<TelaEditarPerfil />);

    expect(screen.getByDisplayValue('(11) 98765-4321')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('01001-000')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Karina S. Lima');
    await fireEvent.changeText(screen.getByLabelText('Telefone'), '21988887777');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(mockRoteador.back).toHaveBeenCalled();
    });
    const patch = chamadas.find((c) => c.method === 'PATCH');
    expect(await patch?.json()).toMatchObject({
      nome: 'Karina S. Lima',
      telefone: '21988887777',
      endereco: { cep: '01001000', uf: 'SP', complemento: null },
    });
    expect(useSessao.getState().usuario?.nome).toBe('Karina S. Lima');
  });

  it('nome com @ é recusado antes de chamar a API', async () => {
    const chamadas = apiFalsa({ 'GET /v1/me': json(usuarioTeste) });
    await renderizar(<TelaEditarPerfil />);

    await fireEvent.changeText(screen.getByLabelText('Nome completo'), 'karina@abraco.org');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Digite seu nome, não o e-mail')).toBeOnTheScreen();
    expect(chamadas.some((c) => c.method === 'PATCH')).toBe(false);
  });
});

describe('Alterar senha', () => {
  it('senha atual errada aparece no campo', async () => {
    apiFalsa({
      'POST /v1/me/senha': problema(422, 'SENHA_INCORRETA', 'senhaAtual', 'Senha incorreta'),
    });
    await renderizar(<TelaAlterarSenha />);

    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'errada123');
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'potros2027');
    await fireEvent.changeText(screen.getByLabelText('Confirme a nova senha'), 'potros2027');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByText('Senha incorreta')).toBeOnTheScreen();
    expect(mockRoteador.back).not.toHaveBeenCalled();
  });

  it('confirmação diferente não chama a API', async () => {
    const chamadas = apiFalsa({});
    await renderizar(<TelaAlterarSenha />);

    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'cavalos123');
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'potros2027');
    await fireEvent.changeText(screen.getByLabelText('Confirme a nova senha'), 'potros2028');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByText('As senhas não conferem')).toBeOnTheScreen();
    expect(chamadas).toHaveLength(0);
  });
});

describe('Excluir conta', () => {
  it('exige a confirmação; depois apaga e sai da sessão', async () => {
    const chamadas = apiFalsa({ 'DELETE /v1/me': json(null, 204) });
    await renderizar(<TelaExcluirConta />);

    await fireEvent.changeText(screen.getByLabelText('Sua senha'), 'cavalos123');
    const excluir = screen.getByRole('button', { name: 'Excluir conta definitivamente' });
    await fireEvent.press(excluir);
    expect(
      await screen.findByText('Confirme que entendeu que a exclusão não pode ser desfeita'),
    ).toBeOnTheScreen();
    expect(chamadas).toHaveLength(0);

    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'Entendo que a exclusão é definitiva' }),
    );
    await fireEvent.press(excluir);
    await waitFor(() => {
      expect(useSessao.getState().estado).toBe('anonimo');
    });
    expect(await chamadas[0]?.json()).toEqual({ senha: 'cavalos123' });
  });

  it('único admin: mensagem clara', async () => {
    apiFalsa({ 'DELETE /v1/me': problema(422, 'ULTIMO_ADMIN') });
    await renderizar(<TelaExcluirConta />);

    await fireEvent.changeText(screen.getByLabelText('Sua senha'), 'cavalos123');
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'Entendo que a exclusão é definitiva' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Excluir conta definitivamente' }));

    expect(await screen.findByText(/única pessoa da equipe/)).toBeOnTheScreen();
    expect(useSessao.getState().estado).toBe('autenticado');
  });
});
