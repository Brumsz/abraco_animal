/**
 * Integração + segurança do módulo de autenticação (seção 9 da spec), com
 * Postgres e Redis reais. Exige Docker.
 */
import { createSigner } from 'fast-jwt';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RelogioFake } from './application/testes/fakes.js';
import { criarAutenticacao } from './http/autenticacao.js';
import { RevogacaoRedis } from './infrastructure/redis-auth.js';
import { TokensJwt } from './infrastructure/tokens-jwt.js';
import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let seq = 0;

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  // Cada teste começa sem contadores de rate limit.
  await amb.redis.flushall();
});

/** Gera um CPF válido e único a partir de um número (calcula os dígitos verificadores). */
function cpfValido(n: number): string {
  const base = String(100_000_000 + n)
    .slice(-9)
    .split('')
    .map(Number);
  const dv = (digitos: number[]) => {
    const soma = digitos.reduce((acc, d, i) => acc + d * (digitos.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

function novoUsuario(extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    nome: `Pessoa Teste ${seq}`,
    dataNasc: '1990-05-20',
    cpf: cpfValido(seq * 7919 + (Date.now() % 1000)),
    telefone: '11987654321',
    email: `pessoa${seq}-${Date.now()}@teste.org`,
    senha: 'cavalos123',
    endereco: {
      cep: '01001-000',
      logradouro: 'Praça da Sé',
      numero: '1',
      bairro: 'Sé',
      cidade: 'São Paulo',
      uf: 'SP',
    },
    aceitouTermos: true,
    consentimentoDados: true,
    deviceId: 'aparelho-de-teste-1',
    ...extra,
  };
}

interface Sessao {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string; email: string };
}

async function cadastrar(extra: Record<string, unknown> = {}) {
  const dados = novoUsuario(extra);
  const res = await app.inject({ method: 'POST', url: '/v1/auth/cadastro', payload: dados });
  expect(res.statusCode, res.body).toBe(201);
  return { dados, sessao: res.json<Sessao>() };
}

const me = (token: string) =>
  app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });

const refresh = (refreshToken: string, deviceId = 'aparelho-de-teste-1') =>
  app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken, deviceId } });

describe('cadastro', () => {
  it('cria a conta, inicia a sessão e nunca devolve dados sensíveis', async () => {
    const { dados, sessao } = await cadastrar();

    expect(sessao.usuario.email).toBe(dados.email);
    const corpo = JSON.stringify(sessao);
    expect(corpo).not.toMatch(/senha|cpf|dataNasc|hash/i);
  });

  it('guarda CPF e data de nascimento cifrados no banco (AES-256-GCM)', async () => {
    const { dados } = await cadastrar();
    const linha = await amb.prisma.usuario.findUniqueOrThrow({ where: { email: dados.email } });

    expect(Buffer.from(linha.cpfCifrado).toString('utf8')).not.toContain(dados.cpf);
    expect(Buffer.from(linha.dataNascCifrada).toString('utf8')).not.toContain('1990');
    expect(linha.cpfIv).toHaveLength(12);
    expect(linha.cpfTag).toHaveLength(16);
    expect(linha.senhaHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
  });

  it('e-mail ou CPF repetido → 409', async () => {
    const { dados } = await cadastrar();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: { ...novoUsuario(), email: dados.email },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ codigo: 'CADASTRO_DUPLICADO' });
  });

  it('campo desconhecido no corpo é rejeitado (Zod strict) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: { ...novoUsuario(), role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('regra de domínio (menor de idade) → 422 com o campo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: novoUsuario({ dataNasc: '2015-01-01' }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      codigo: 'IDADE_MINIMA',
      erros: [{ campo: 'dataNasc' }],
    });
  });
});

describe('login, refresh e logout', () => {
  it('login → /me → refresh (rotação) → logout', async () => {
    const { dados } = await cadastrar();

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: dados.email.toUpperCase(), senha: dados.senha, deviceId: 'celular-x-123' },
    });
    expect(login.statusCode).toBe(200);
    const s1 = login.json<Sessao>();

    expect((await me(s1.accessToken)).json()).toMatchObject({
      email: dados.email,
      role: 'USUARIO',
    });

    const r = await refresh(s1.refreshToken, 'celular-x-123');
    expect(r.statusCode).toBe(200);
    const s2 = r.json<Sessao>();
    expect(s2.refreshToken).not.toBe(s1.refreshToken);

    const sair = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${s2.accessToken}` },
    });
    expect(sair.statusCode).toBe(204);

    // Depois do logout: access token e refresh deixam de valer.
    expect((await me(s2.accessToken)).statusCode).toBe(401);
    expect((await refresh(s2.refreshToken, 'celular-x-123')).statusCode).toBe(401);
  });

  it('senha errada → 401 com a mesma resposta de e-mail inexistente', async () => {
    const { dados } = await cadastrar();
    const errada = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: dados.email, senha: 'errada123', deviceId: 'aparelho-1234' },
    });
    const inexistente = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'ninguem@teste.org', senha: 'errada123', deviceId: 'aparelho-1234' },
    });
    expect(errada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(errada.json()).toEqual(inexistente.json());
  });
});

describe('segurança de tokens (seção 9)', () => {
  it('token reutilizado após rotação → 401 e revoga a família inteira', async () => {
    const { sessao } = await cadastrar();
    const rotacionado = (await refresh(sessao.refreshToken)).json<Sessao>();

    // Reuso do token antigo (simula roubo)
    const reuso = await refresh(sessao.refreshToken);
    expect(reuso.statusCode).toBe(401);
    expect(reuso.json()).toMatchObject({ codigo: 'REFRESH_REUTILIZADO' });

    // A família foi revogada: o refresh legítimo e o access token da sessão morreram.
    expect((await refresh(rotacionado.refreshToken)).statusCode).toBe(401);
    expect((await me(rotacionado.accessToken)).statusCode).toBe(401);
  });

  it('token expirado → 401', async () => {
    const { sessao } = await cadastrar();
    const claims = JSON.parse(
      Buffer.from(sessao.accessToken.split('.')[1]!, 'base64url').toString(),
    ) as { sub: string; sid: string };

    // Mesmas chaves, mas emitido "há 1 hora" com validade de 15 min.
    const passado = new TokensJwt(
      {
        chavePrivadaPem: amb.chaves.privada,
        chavePublicaPem: amb.chaves.publica,
        emissor: amb.config.JWT_ISSUER,
        audiencia: amb.config.JWT_AUDIENCE,
        ttlSegundos: 900,
      },
      new RelogioFake(new Date(Date.now() - 3600_000)),
    );
    const expirado = passado.emitirAcesso({ sub: claims.sub, role: 'USUARIO', sid: claims.sid });

    const res = await me(expirado.token);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('alg "none" → 401', async () => {
    const { sessao } = await cadastrar();
    const [, payload] = sessao.accessToken.split('.');
    const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );

    expect((await me(`${cabecalho}.${payload}.`)).statusCode).toBe(401);
  });

  it('confusão de algoritmo (HS256 assinado com a chave pública) → 401', async () => {
    const { sessao } = await cadastrar();
    const claims = JSON.parse(
      Buffer.from(sessao.accessToken.split('.')[1]!, 'base64url').toString(),
    ) as Record<string, unknown>;
    const forjado = createSigner({ key: amb.chaves.publica, algorithm: 'HS256' })(claims);

    expect((await me(forjado)).statusCode).toBe(401);
  });

  it('assinatura adulterada (payload trocado para ADMIN) → 401', async () => {
    const { sessao } = await cadastrar();
    const [cab, payload, assinatura] = sessao.accessToken.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const adulterado = Buffer.from(JSON.stringify({ ...claims, role: 'ADMIN' })).toString(
      'base64url',
    );

    expect((await me(`${cab}.${adulterado}.${assinatura}`)).statusCode).toBe(401);
  });

  it('audiência ou emissor errados → 401', async () => {
    const { sessao } = await cadastrar();
    const claims = JSON.parse(
      Buffer.from(sessao.accessToken.split('.')[1]!, 'base64url').toString(),
    ) as Record<string, unknown>;
    const outraAudiencia = createSigner({ key: amb.chaves.privada, algorithm: 'EdDSA' })({
      ...claims,
      aud: 'outro-sistema',
    });
    const outroEmissor = createSigner({ key: amb.chaves.privada, algorithm: 'EdDSA' })({
      ...claims,
      iss: 'https://atacante.example',
    });

    expect((await me(outraAudiencia)).statusCode).toBe(401);
    expect((await me(outroEmissor)).statusCode).toBe(401);
  });

  it('sem token ou com esquema errado → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
    const basic = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(basic.statusCode).toBe(401);
  });
});

describe('RBAC (seção 5)', () => {
  let appAdmin: FastifyInstance;

  beforeAll(async () => {
    // Rota /admin/* de teste protegida pelo mesmo guard que o painel usará.
    appAdmin = await amb.criarApp();
    const tokens = new TokensJwt(
      {
        chavePrivadaPem: amb.chaves.privada,
        chavePublicaPem: amb.chaves.publica,
        emissor: amb.config.JWT_ISSUER,
        audiencia: amb.config.JWT_AUDIENCE,
        ttlSegundos: 900,
      },
      { agora: () => new Date() },
    );
    const { autenticar, exigirRole } = criarAutenticacao(tokens, new RevogacaoRedis(amb.redis));
    appAdmin.get('/v1/admin/teste', { preHandler: [autenticar, exigirRole('ADMIN')] }, () => ({
      ok: true,
    }));
    await appAdmin.ready();
  });

  afterAll(async () => {
    await appAdmin.close();
  });

  it('usuário comum em rota /admin/* → 403', async () => {
    const res = await appAdmin.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: novoUsuario(),
    });
    const { accessToken } = res.json<Sessao>();

    const admin = await appAdmin.inject({
      method: 'GET',
      url: '/v1/admin/teste',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(admin.statusCode).toBe(403);
    expect(admin.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
  });

  it('ADMIN acessa a rota /admin/*', async () => {
    const res = await appAdmin.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: novoUsuario(),
    });
    const { usuario } = res.json<Sessao>();
    await amb.prisma.usuario.update({ where: { publicId: usuario.id }, data: { role: 'ADMIN' } });

    // A role vem do token: é preciso entrar de novo para receber o claim ADMIN.
    const email = usuario.email;
    const login = await appAdmin.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, senha: 'cavalos123', deviceId: 'aparelho-admin-1' },
    });
    const admin = await appAdmin.inject({
      method: 'GET',
      url: '/v1/admin/teste',
      headers: { authorization: `Bearer ${login.json<Sessao>().accessToken}` },
    });
    expect(admin.statusCode).toBe(200);
  });
});

describe('rate limiting (seção 6)', () => {
  it('login: 5 tentativas por IP; a 6ª → 429 com Retry-After', async () => {
    const tentativa = () =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'alvo@teste.org', senha: 'chute1234', deviceId: 'aparelho-1234' },
      });

    for (let i = 0; i < 5; i++) expect((await tentativa()).statusCode).toBe(401);
    const bloqueada = await tentativa();

    expect(bloqueada.statusCode).toBe(429);
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThanOrEqual(900);
  });

  it('bloqueio progressivo: o segundo bloqueio dura o dobro', async () => {
    const tentativa = () =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'alvo@teste.org', senha: 'chute1234', deviceId: 'aparelho-1234' },
      });
    for (let i = 0; i < 6; i++) await tentativa();
    // Simula o fim do primeiro bloqueio
    const chaves = await amb.redis.keys('rl:login:bloqueio:*');
    await amb.redis.del(...chaves);

    for (let i = 0; i < 5; i++) await tentativa();
    const segundo = await tentativa();
    expect(segundo.statusCode).toBe(429);
    expect(Number(segundo.headers['retry-after'])).toBeGreaterThanOrEqual(1800);
  });

  it('recuperação de senha: 3 por hora por e-mail', async () => {
    const pedir = () =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/recuperar-senha/solicitar',
        payload: { email: 'qualquer@teste.org' },
      });
    for (let i = 0; i < 3; i++) expect((await pedir()).statusCode).toBe(202);
    expect((await pedir()).statusCode).toBe(429);
  });

  it('o Redis não guarda e-mail nem IP em claro nas chaves', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/recuperar-senha/solicitar',
      payload: { email: 'privado@teste.org' },
    });
    const chaves = await amb.redis.keys('*');
    expect(chaves.join(' ')).not.toContain('privado@teste.org');
    expect(chaves.join(' ')).not.toContain('127.0.0.1');
  });
});

describe('recuperação de senha (3 etapas)', () => {
  it('código por e-mail → token → nova senha; sessões antigas encerradas', async () => {
    const { dados, sessao } = await cadastrar();

    const pedido = await app.inject({
      method: 'POST',
      url: '/v1/auth/recuperar-senha/solicitar',
      payload: { email: dados.email },
    });
    expect(pedido.statusCode).toBe(202);

    // O banco guarda só o HMAC do código.
    const registro = await amb.prisma.recuperacaoSenha.findFirstOrThrow({
      where: { usuario: { email: dados.email } },
    });
    const codigo = amb.emails.ultimoCodigo(dados.email);
    expect(registro.codigoHash).not.toContain(codigo);

    const verificado = await app.inject({
      method: 'POST',
      url: '/v1/auth/recuperar-senha/verificar-codigo',
      payload: { email: dados.email, codigo },
    });
    expect(verificado.statusCode).toBe(200);
    const { tokenRedefinicao } = verificado.json<{ tokenRedefinicao: string }>();

    const redefinido = await app.inject({
      method: 'POST',
      url: '/v1/auth/recuperar-senha/redefinir',
      payload: { tokenRedefinicao, novaSenha: 'novaSenha2026' },
    });
    expect(redefinido.statusCode).toBe(204);

    // Sessão anterior derrubada (access e refresh)
    expect((await me(sessao.accessToken)).statusCode).toBe(401);
    expect((await refresh(sessao.refreshToken)).statusCode).toBe(401);

    // Senha nova funciona, antiga não
    const login = (senha: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: dados.email, senha, deviceId: 'aparelho-1234' },
      });
    expect((await login('cavalos123')).statusCode).toBe(401);
    expect((await login('novaSenha2026')).statusCode).toBe(200);
  });

  it('e-mail inexistente também recebe 202 (sem enumeração)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/recuperar-senha/solicitar',
      payload: { email: 'nao-existe@teste.org' },
    });
    expect(res.statusCode).toBe(202);
  });
});

describe('prontidão', () => {
  it('/health/ready confere Postgres e Redis reais', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', dependencias: { postgres: 'ok', redis: 'ok' } });
  });
});
