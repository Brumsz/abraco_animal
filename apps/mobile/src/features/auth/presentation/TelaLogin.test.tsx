import { ToastProvider } from '@abraco/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';

import TelaLogin from './TelaLogin';

async function renderizar() {
  await render(
    <ToastProvider>
      <TelaLogin />
    </ToastProvider>,
  );
}

describe('TelaLogin', () => {
  it('mostra erros inline ao tentar entrar com o formulário vazio', async () => {
    await renderizar();

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe seu e-mail')).toBeOnTheScreen();
    expect(screen.getByText('Informe sua senha')).toBeOnTheScreen();
  });

  it('valida o formato do e-mail ao sair do campo', async () => {
    await renderizar();

    const email = screen.getByLabelText('E-mail');
    await fireEvent.changeText(email, 'karina@');
    await fireEvent(email, 'blur');

    expect(await screen.findByText('Informe um e-mail válido')).toBeOnTheScreen();
  });

  it('com dados válidos não mostra erros e avisa que é uma demonstração', async () => {
    await renderizar();

    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'karina@abraco.org');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-segura');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByTestId('toast-info', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.queryByText('Informe seu e-mail')).not.toBeOnTheScreen();
  });

  it('"Criar conta" informa que o cadastro chega em breve, sem alert nativo', async () => {
    await renderizar();

    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Cadastro: disponível em breve.')).toBeOnTheScreen();
  });
});
