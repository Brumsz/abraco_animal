import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import { CadastrarUsuario, type EntradaCadastro } from './cadastrar.js';
import { Login } from './login.js';
import { Logout } from './logout.js';
import {
  MAX_TENTATIVAS_CODIGO,
  RedefinirSenha,
  SolicitarRecuperacao,
  VerificarCodigoRecuperacao,
} from './recuperar-senha.js';
import { RenovarSessao } from './renovar-sessao.js';
import { criarAmbiente } from './testes/fakes.js';

type Ambiente = ReturnType<typeof criarAmbiente>;

const entradaValida = (mudancas: Partial<EntradaCadastro> = {}): EntradaCadastro => ({
  nome: '  Karina   Somaggio ',
  dataNasc: '1990-05-20',
  cpf: '529.982.247-25',
  telefone: '(11) 98765-4321',
  email: 'Karina@Abraco.org',
  senha: 'cavalos123',
  endereco: {
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    numero: '1',
    complemento: null,
    bairro: 'Sé',
    cidade: 'São Paulo',
    uf: 'sp',
  },
  aceitouTermos: true,
  consentimentoDados: true,
  deviceId: 'celular-1',
  ...mudancas,
});

async function erro(promessa: Promise<unknown>): Promise<ErroDominio> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDominio) return e;
    throw e;
  }
  throw new Error('esperava um ErroDominio');
}

let amb: Ambiente;
beforeEach(() => {
  amb = criarAmbiente();
});

describe('CadastrarUsuario', () => {
  it('cria o usuário, normaliza os dados e já inicia a sessão', async () => {
    const sessao = await new CadastrarUsuario(amb).executar(entradaValida());

    const salvo = amb.usuarios.lista[0]!;
    expect(salvo.nome).toBe('Karina Somaggio');
    expect(salvo.email).toBe('karina@abraco.org');
    expect(salvo.telefone).toBe('11987654321');
    expect(salvo.dados.endereco).toMatchObject({ cep: '01001000', uf: 'SP' });
    expect(salvo.senhaHash).toBe('hash:cavalos123');
    expect(sessao.refreshToken).toBeTruthy();
    expect(sessao.accessToken).toBeTruthy();
  });

  it('nunca guarda CPF ou data de nascimento em texto puro', async () => {
    await new CadastrarUsuario(amb).executar(entradaValida());
    const { dados } = amb.usuarios.lista[0]!;

    expect(dados.cpfHash).toBe('idx:52998224725');
    expect(amb.cifrador.decifrar(dados.cpf)).toBe('52998224725');
    expect(amb.cifrador.decifrar(dados.dataNasc)).toBe('1990-05-20');
    expect(JSON.stringify(dados)).not.toContain('"52998224725"');
  });

  it('registra o momento do aceite dos termos e do consentimento (LGPD)', async () => {
    await new CadastrarUsuario(amb).executar(entradaValida());
    const { dados } = amb.usuarios.lista[0]!;
    expect(dados.aceitouTermosEm).toEqual(amb.relogio.agora());
    expect(dados.consentimentoDadosEm).toEqual(amb.relogio.agora());
  });

  it.each([
    ['sem aceite dos termos', { aceitouTermos: false }, 'TERMOS_NAO_ACEITOS'],
    ['sem consentimento LGPD', { consentimentoDados: false }, 'CONSENTIMENTO_AUSENTE'],
    ['menor de 18 anos', { dataNasc: '2010-01-01' }, 'IDADE_MINIMA'],
    ['CPF inválido', { cpf: '111.111.111-11' }, 'CPF_INVALIDO'],
    ['senha fraca', { senha: 'abc' }, 'SENHA_FRACA'],
    ['nome curto', { nome: 'Jo' }, 'NOME_INVALIDO'],
  ] as const)('rejeita cadastro %s', async (_, mudanca, codigo) => {
    const e = await erro(new CadastrarUsuario(amb).executar(entradaValida(mudanca)));
    expect(e.codigo).toBe(codigo);
    expect(amb.usuarios.lista).toHaveLength(0);
  });

  it('rejeita e-mail ou CPF já cadastrado com a mesma mensagem (não revela qual)', async () => {
    const caso = new CadastrarUsuario(amb);
    await caso.executar(entradaValida());

    const porEmail = await erro(caso.executar(entradaValida({ cpf: '111.444.777-35' })));
    const porCpf = await erro(caso.executar(entradaValida({ email: 'outra@abraco.org' })));

    expect(porEmail.tipo).toBe('CONFLITO');
    expect(porEmail.message).toBe(porCpf.message);
  });
});

describe('Login', () => {
  beforeEach(async () => {
    await new CadastrarUsuario(amb).executar(entradaValida());
  });

  it('autentica com e-mail em qualquer caixa', async () => {
    const sessao = await new Login(amb).executar({
      email: ' KARINA@abraco.org',
      senha: 'cavalos123',
      deviceId: 'celular-2',
    });
    expect(sessao.usuario.email).toBe('karina@abraco.org');
    expect(amb.sessoes.sessoes.at(-1)?.deviceId).toBe('celular-2');
  });

  it('senha errada e e-mail inexistente dão o MESMO erro', async () => {
    const login = new Login(amb);
    const senhaErrada = await erro(
      login.executar({ email: 'karina@abraco.org', senha: 'errada123', deviceId: 'x' }),
    );
    const naoExiste = await erro(
      login.executar({ email: 'ninguem@abraco.org', senha: 'errada123', deviceId: 'x' }),
    );
    expect(senhaErrada.codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect(naoExiste.codigo).toBe(senhaErrada.codigo);
    expect(naoExiste.message).toBe(senhaErrada.message);
  });

  it('e-mail inexistente ainda executa uma verificação de hash (tempo constante)', async () => {
    const verificar = vi.spyOn(amb.hasher, 'verificar');
    await erro(
      new Login(amb).executar({ email: 'ninguem@x.org', senha: 'a1b2c3d4', deviceId: 'x' }),
    );
    expect(verificar).toHaveBeenCalledWith(amb.hashFicticio, 'a1b2c3d4');
  });

  it('conta desativada: só informa depois de a senha estar correta', async () => {
    amb.usuarios.alterar(1, { ativo: false });
    const login = new Login(amb);

    const comSenhaErrada = await erro(
      login.executar({ email: 'karina@abraco.org', senha: 'errada123', deviceId: 'x' }),
    );
    const comSenhaCerta = await erro(
      login.executar({ email: 'karina@abraco.org', senha: 'cavalos123', deviceId: 'x' }),
    );

    expect(comSenhaErrada.codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect(comSenhaCerta.codigo).toBe('CONTA_DESATIVADA');
  });

  it('conta removida (soft delete) não autentica', async () => {
    amb.usuarios.alterar(1, { removido: true });
    const e = await erro(
      new Login(amb).executar({ email: 'karina@abraco.org', senha: 'cavalos123', deviceId: 'x' }),
    );
    expect(e.codigo).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('refaz o hash quando os parâmetros do Argon2 estão desatualizados', async () => {
    amb.usuarios.alterar(1, { senhaHash: 'hash:cavalos123' });
    vi.spyOn(amb.hasher, 'precisaRefazer').mockReturnValue(true);
    const atualizar = vi.spyOn(amb.usuarios, 'atualizarSenha');

    await new Login(amb).executar({
      email: 'karina@abraco.org',
      senha: 'cavalos123',
      deviceId: 'x',
    });

    expect(atualizar).toHaveBeenCalledWith(1, 'hash:cavalos123');
  });
});

describe('RenovarSessao', () => {
  let refreshInicial: string;

  beforeEach(async () => {
    const sessao = await new CadastrarUsuario(amb).executar(entradaValida());
    refreshInicial = sessao.refreshToken;
  });

  it('rotaciona: devolve um refresh novo e invalida o antigo', async () => {
    const renovar = new RenovarSessao(amb);
    const nova = await renovar.executar({ refreshToken: refreshInicial, deviceId: 'celular-1' });

    expect(nova.refreshToken).not.toBe(refreshInicial);
    expect(amb.sessoes.refreshes.filter((r) => r.usadoEm === null)).toHaveLength(1);
  });

  it('REUSO de token já rotacionado → 401 e revoga a família inteira + a sessão', async () => {
    const renovar = new RenovarSessao(amb);
    const nova = await renovar.executar({ refreshToken: refreshInicial, deviceId: 'celular-1' });

    // Atacante usa o token antigo (roubado)…
    const e = await erro(renovar.executar({ refreshToken: refreshInicial, deviceId: 'celular-1' }));
    expect(e.codigo).toBe('REFRESH_REUTILIZADO');
    expect(e.tipo).toBe('NAO_AUTENTICADO');

    // …e o token legítimo mais novo também deixa de valer.
    const legitimo = await erro(
      renovar.executar({ refreshToken: nova.refreshToken, deviceId: 'celular-1' }),
    );
    expect(legitimo.codigo).toBe('REFRESH_REUTILIZADO');
    expect(amb.sessoes.refreshes.every((r) => r.revogadoEm !== null)).toBe(true);
    expect(amb.revogacao.sids.has(amb.sessoes.sessoes[0]!.sid)).toBe(true);
  });

  it('refresh apresentado por outro aparelho é tratado como roubo', async () => {
    const e = await erro(
      new RenovarSessao(amb).executar({ refreshToken: refreshInicial, deviceId: 'outro' }),
    );
    expect(e.codigo).toBe('REFRESH_REUTILIZADO');
    expect(amb.sessoes.sessoes[0]!.revogada).toBe(true);
  });

  it('refresh expirado (após 30 dias) → 401', async () => {
    amb.relogio.avancar(31 * 86_400_000);
    const e = await erro(
      new RenovarSessao(amb).executar({ refreshToken: refreshInicial, deviceId: 'celular-1' }),
    );
    expect(e.codigo).toBe('REFRESH_EXPIRADO');
  });

  it('token desconhecido → 401', async () => {
    const e = await erro(
      new RenovarSessao(amb).executar({ refreshToken: 'inventado', deviceId: 'celular-1' }),
    );
    expect(e.codigo).toBe('REFRESH_INVALIDO');
  });

  it('usuário desativado depois do login não consegue renovar', async () => {
    amb.usuarios.alterar(1, { ativo: false });
    const e = await erro(
      new RenovarSessao(amb).executar({ refreshToken: refreshInicial, deviceId: 'celular-1' }),
    );
    expect(e.codigo).toBe('REFRESH_INVALIDO');
  });

  it('corrida: duas renovações simultâneas com o mesmo token → só uma vence', async () => {
    const renovar = new RenovarSessao(amb);
    const resultados = await Promise.allSettled([
      renovar.executar({ refreshToken: refreshInicial, deviceId: 'celular-1' }),
      renovar.executar({ refreshToken: refreshInicial, deviceId: 'celular-1' }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
  });
});

describe('Logout', () => {
  it('revoga a sessão no banco e o jti/sid no Redis', async () => {
    await new CadastrarUsuario(amb).executar(entradaValida());
    const claims = amb.tokens.emitidos[0]!;

    await new Logout(amb).executar(claims);

    expect(amb.sessoes.sessoes[0]!.revogada).toBe(true);
    expect(await amb.revogacao.estaRevogado(claims.jti, claims.sid)).toBe(true);
    const refresh = await erro(
      new RenovarSessao(amb).executar({ refreshToken: 'refresh-1', deviceId: 'celular-1' }),
    );
    expect(refresh.tipo).toBe('NAO_AUTENTICADO');
  });
});

describe('Recuperação de senha', () => {
  beforeEach(async () => {
    await new CadastrarUsuario(amb).executar(entradaValida());
  });

  it('fluxo completo: código por e-mail → token → nova senha → sessões encerradas', async () => {
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });
    expect(amb.emails.codigos).toEqual([{ para: 'karina@abraco.org', codigo: '123456' }]);
    expect(amb.recuperacoes.lista[0]!.codigoHash).not.toBe('123456');

    const { tokenRedefinicao } = await new VerificarCodigoRecuperacao(amb).executar({
      email: 'karina@abraco.org',
      codigo: '123456',
    });
    await new RedefinirSenha(amb).executar({ tokenRedefinicao, novaSenha: 'novaSenha2026' });

    expect(amb.usuarios.lista[0]!.senhaHash).toBe('hash:novaSenha2026');
    expect(amb.sessoes.sessoes.every((s) => s.revogada)).toBe(true);
    expect(amb.revogacao.sids.size).toBe(1);
    expect(amb.emails.alteracoes).toEqual(['karina@abraco.org']);
  });

  it('e-mail inexistente: responde normalmente e não envia nada (sem enumeração)', async () => {
    await expect(
      new SolicitarRecuperacao(amb).executar({ email: 'ninguem@abraco.org' }),
    ).resolves.toBeUndefined();
    expect(amb.emails.codigos).toHaveLength(0);
  });

  it(`código errado ${MAX_TENTATIVAS_CODIGO}x invalida o código, mesmo que depois venha o certo`, async () => {
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });
    const verificar = new VerificarCodigoRecuperacao(amb);

    for (let i = 0; i < MAX_TENTATIVAS_CODIGO; i++) {
      const e = await erro(verificar.executar({ email: 'karina@abraco.org', codigo: '000000' }));
      expect(e.codigo).toBe('CODIGO_INVALIDO');
    }
    const certo = await erro(verificar.executar({ email: 'karina@abraco.org', codigo: '123456' }));
    expect(certo.codigo).toBe('CODIGO_INVALIDO');
  });

  it('código expira em 15 minutos', async () => {
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });
    amb.relogio.avancar(16 * 60_000);
    const e = await erro(
      new VerificarCodigoRecuperacao(amb).executar({
        email: 'karina@abraco.org',
        codigo: '123456',
      }),
    );
    expect(e.codigo).toBe('CODIGO_INVALIDO');
  });

  it('novo pedido invalida o código anterior', async () => {
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });
    amb.aleatorio.proximoCodigo = '654321';
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });

    const antigo = await erro(
      new VerificarCodigoRecuperacao(amb).executar({
        email: 'karina@abraco.org',
        codigo: '123456',
      }),
    );
    expect(antigo.codigo).toBe('CODIGO_INVALIDO');
  });

  it('código e token de redefinição são de uso único', async () => {
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });
    const verificar = new VerificarCodigoRecuperacao(amb);
    const { tokenRedefinicao } = await verificar.executar({
      email: 'karina@abraco.org',
      codigo: '123456',
    });

    const reusoCodigo = await erro(
      verificar.executar({ email: 'karina@abraco.org', codigo: '123456' }),
    );
    expect(reusoCodigo.codigo).toBe('CODIGO_INVALIDO');

    const redefinir = new RedefinirSenha(amb);
    await redefinir.executar({ tokenRedefinicao, novaSenha: 'novaSenha2026' });
    const reusoToken = await erro(
      redefinir.executar({ tokenRedefinicao, novaSenha: 'outraSenha2026' }),
    );
    expect(reusoToken.codigo).toBe('TOKEN_REDEFINICAO_INVALIDO');
  });

  it('nova senha fraca é rejeitada antes de consumir o token', async () => {
    await new SolicitarRecuperacao(amb).executar({ email: 'karina@abraco.org' });
    const { tokenRedefinicao } = await new VerificarCodigoRecuperacao(amb).executar({
      email: 'karina@abraco.org',
      codigo: '123456',
    });

    const e = await erro(
      new RedefinirSenha(amb).executar({ tokenRedefinicao, novaSenha: 'curta' }),
    );
    expect(e.codigo).toBe('SENHA_FRACA');
    expect(e.campo).toBe('novaSenha');
    expect(amb.cofre.itens.size).toBe(1);
  });
});
