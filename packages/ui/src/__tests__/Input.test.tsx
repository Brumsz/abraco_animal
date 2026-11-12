import { fireEvent, render, screen } from '@testing-library/react-native';

import { Input } from '../componentes/Input';

describe('Input', () => {
  it('exibe a mensagem de erro inline', async () => {
    await render(<Input rotulo="E-mail" erro="Informe um e-mail válido" />);

    expect(screen.getByText('Informe um e-mail válido')).toBeOnTheScreen();
  });

  it('campo de senha começa oculto e alterna ao tocar no ícone', async () => {
    await render(<Input rotulo="Senha" senha value="segredo123" onChangeText={jest.fn()} />);

    const campo = screen.getByLabelText('Senha');
    expect(campo.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeOnTheScreen();
  });

  it('desabilitado não é editável', async () => {
    await render(<Input rotulo="Nome" desabilitado />);

    expect(screen.getByLabelText('Nome').props.editable).toBe(false);
  });

  it('repassa o texto digitado', async () => {
    const onChangeText = jest.fn();
    await render(<Input rotulo="Nome" onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Karina');

    expect(onChangeText).toHaveBeenCalledWith('Karina');
  });
});
