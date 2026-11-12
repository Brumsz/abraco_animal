import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../componentes/Button';

describe('Button', () => {
  it('chama onPress ao tocar', async () => {
    const onPress = jest.fn();
    await render(<Button titulo="Entrar" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('desabilitado: não chama onPress e anuncia o estado', async () => {
    const onPress = jest.fn();
    await render(<Button titulo="Entrar" onPress={onPress} disabled />);

    const botao = screen.getByRole('button', { name: 'Entrar' });
    await fireEvent.press(botao);

    expect(onPress).not.toHaveBeenCalled();
    expect(botao).toBeDisabled();
  });

  it('carregando: mostra indicador, fica ocupado e bloqueia toques', async () => {
    const onPress = jest.fn();
    await render(<Button titulo="Entrar" onPress={onPress} carregando />);

    const botao = screen.getByRole('button', { name: 'Entrar' });
    await fireEvent.press(botao);

    expect(onPress).not.toHaveBeenCalled();
    expect(botao).toBeBusy();
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
  });
});
