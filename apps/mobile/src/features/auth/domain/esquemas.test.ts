import { esquemaLogin } from './esquemas';

function erros(dados: unknown): Record<string, string | undefined> {
  const resultado = esquemaLogin.safeParse(dados);
  if (resultado.success) return {};
  return Object.fromEntries(resultado.error.issues.map((i) => [String(i.path[0]), i.message]));
}

describe('esquemaLogin', () => {
  it('aceita e-mail e senha válidos e remove espaços do e-mail', () => {
    const resultado = esquemaLogin.parse({ email: '  karina@abraco.org ', senha: 'x' });
    expect(resultado.email).toBe('karina@abraco.org');
  });

  it('exige e-mail e senha', () => {
    expect(erros({ email: '', senha: '' })).toEqual({
      email: 'Informe seu e-mail',
      senha: 'Informe sua senha',
    });
  });

  it('rejeita e-mail inválido', () => {
    expect(erros({ email: 'karina@', senha: 'x' })).toEqual({ email: 'Informe um e-mail válido' });
  });
});
