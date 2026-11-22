import { fireEvent, render, screen } from '@testing-library/react-native';

import { CampoCodigo } from '../componentes/CampoCodigo';
import { Chip } from '../componentes/Chip';

describe('Chip', () => {
  it('anuncia o papel e o estado de seleção, e chama onPress', async () => {
    const onPress = jest.fn();
    await render(<Chip rotulo="Equinos" selecionado={false} onPress={onPress} variante="filtro" />);

    const chip = screen.getByRole('radio', { name: 'Equinos' });
    expect(chip).not.toBeChecked();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('múltipla escolha usa o papel checkbox', async () => {
    await render(<Chip rotulo="Sábado" selecionado papel="checkbox" onPress={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Sábado' })).toBeChecked();
  });
});

describe('CampoCodigo', () => {
  it('aceita só dígitos, corta no limite e avisa quando completa (ex.: código colado)', async () => {
    const onChange = jest.fn();
    const aoCompletar = jest.fn();
    await render(<CampoCodigo valor="" onChange={onChange} aoCompletar={aoCompletar} />);

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '12a-345678');

    expect(onChange).toHaveBeenCalledWith('123456');
    expect(aoCompletar).toHaveBeenCalledWith('123456');
  });

  it('mostra os dígitos nas caixas e o erro', async () => {
    await render(<CampoCodigo valor="42" onChange={jest.fn()} erro="Código inválido" />);
    // As caixas são só desenho (o leitor de tela anuncia o campo).
    expect(screen.getByText('4', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Código inválido')).toBeOnTheScreen();
  });
});
