import { render, screen } from '@testing-library/react-native';

import { Avatar, iniciais } from '../componentes/Avatar';
import { Badge } from '../componentes/Badge';

describe('iniciais', () => {
  it.each([
    ['Karina Somaggio', 'KS'],
    ['  maria   da  silva ', 'MS'],
    ['abraço', 'A'],
    ['', '?'],
  ])('%j → %s', (nome, esperado) => {
    expect(iniciais(nome)).toBe(esperado);
  });
});

describe('Avatar', () => {
  it('sem foto mostra as iniciais e tem rótulo acessível', async () => {
    await render(<Avatar nome="Karina Somaggio" />);

    expect(screen.getByText('KS')).toBeOnTheScreen();
    expect(screen.getByLabelText('Foto de Karina Somaggio')).toBeOnTheScreen();
  });
});

describe('Badge', () => {
  it('traduz o status e não depende só da cor', async () => {
    await render(<Badge status="EM_TRATAMENTO" />);

    expect(screen.getByText('Em tratamento')).toBeOnTheScreen();
    expect(screen.getByLabelText('Status: Em tratamento')).toBeOnTheScreen();
  });
});
