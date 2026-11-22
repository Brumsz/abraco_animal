import {
  esquemaCadastroEndereco,
  esquemaCadastroPessoal,
  esquemaLogin,
  esquemaNovaSenha,
} from './esquemas';
import { dataParaIso, mascararCep, mascararCpf, mascararData, mascararTelefone } from './mascaras';

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

const hoje = new Date('2026-11-22T12:00:00Z');
const pessoaisValidos = {
  nome: 'Karina Somaggio',
  nascimento: '15/03/1990',
  cpf: '529.982.247-25',
  telefone: '(11) 98765-4321',
  email: 'karina@abraco.org',
  senha: 'cavalos2026',
};

function errosDe(
  esquema: {
    safeParse: (d: unknown) => {
      success: boolean;
      error?: { issues: { path: PropertyKey[]; message: string }[] };
    };
  },
  dados: unknown,
) {
  const r = esquema.safeParse(dados);
  return r.success
    ? {}
    : Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));
}

describe('cadastro — passo 1 (mesmas regras da API, via @abraco/shared)', () => {
  const esquema = esquemaCadastroPessoal(hoje);

  it('aceita dados válidos', () => {
    expect(errosDe(esquema, pessoaisValidos)).toEqual({});
  });

  it('menor de 18 anos, data inexistente, CPF com dígito errado e telefone sem DDD', () => {
    expect(
      errosDe(esquema, {
        ...pessoaisValidos,
        nascimento: '23/11/2008', // faz 18 amanhã
        cpf: '529.982.247-26',
        telefone: '98765-4321',
      }),
    ).toEqual({
      nascimento: 'É preciso ter 18 anos ou mais',
      cpf: 'CPF inválido',
      telefone: 'Telefone inválido (com DDD)',
    });
    expect(errosDe(esquema, { ...pessoaisValidos, nascimento: '30/02/1990' }).nascimento).toBe(
      'Use o formato DD/MM/AAAA',
    );
  });

  it('senha segue a política da API (8+ com letras e números)', () => {
    expect(errosDe(esquema, { ...pessoaisValidos, senha: 'somenteletras' }).senha).toBe(
      'A senha deve conter letras e números',
    );
    expect(errosDe(esquema, { ...pessoaisValidos, senha: 'a1' }).senha).toMatch(/entre 8 e 128/);
  });
});

describe('cadastro — passo 2', () => {
  const endereco = {
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    numero: '1',
    complemento: '',
    bairro: 'Sé',
    cidade: 'São Paulo',
    uf: 'SP',
    aceitouTermos: true,
    consentimentoDados: true,
  };

  it('exige o aceite dos termos e o consentimento LGPD', () => {
    expect(
      errosDe(esquemaCadastroEndereco, {
        ...endereco,
        aceitouTermos: false,
        consentimentoDados: false,
      }),
    ).toEqual({
      aceitouTermos: 'Aceite os termos de uso para continuar',
      consentimentoDados: 'Autorize o uso dos dados para continuar',
    });
    expect(errosDe(esquemaCadastroEndereco, endereco)).toEqual({});
  });
});

describe('nova senha', () => {
  it('a confirmação precisa ser igual', () => {
    expect(errosDe(esquemaNovaSenha, { senha: 'cavalos2026', confirmacao: 'cavalos2027' })).toEqual(
      {
        confirmacao: 'As senhas não conferem',
      },
    );
  });
});

describe('máscaras', () => {
  it('formatam enquanto a pessoa digita', () => {
    expect(mascararCpf('52998224725')).toBe('529.982.247-25');
    expect(mascararCpf('5299')).toBe('529.9');
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascararTelefone('1134567890')).toBe('(11) 3456-7890');
    expect(mascararData('15031990')).toBe('15/03/1990');
    expect(mascararCep('01001000')).toBe('01001-000');
  });

  it('data DD/MM/AAAA vira AAAA-MM-DD para a API', () => {
    expect(dataParaIso('15/03/1990')).toBe('1990-03-15');
    expect(dataParaIso('15/03/19')).toBeNull();
  });
});
