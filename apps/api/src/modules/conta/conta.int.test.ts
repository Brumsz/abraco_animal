/**
 * Integração + segurança de "minha conta" (perfil, senha, LGPD) com Postgres,
 * Redis e S3 reais. Exige Docker.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;

const SENHA = 'cavalos123';

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN' });
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.redis.flushall();
});

const login = (email: string, senha: string, deviceId = 'aparelho-de-teste-1') =>
  app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, senha, deviceId } });

const me = (token: string) => app.inject({ method: 'GET', url: '/v1/me', headers: bearer(token) });

async function criarAnimal(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/animais',
    headers: bearer(admin.token),
    payload: {
      nome: 'Trovão',
      tipo: 'EQUINO',
      raca: 'Crioulo',
      idadeAprox: 96,
      sexo: 'MACHO',
      porte: 'GRANDE',
      descricao: 'Dócil.',
      historiaResgate: 'Resgatado.',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ id: string }>().id;
}

describe('editar perfil (PATCH /me)', () => {
  it('altera nome, telefone e endereço; e-mail e CPF não mudam por aqui', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: bearer(u.token),
      payload: {
        nome: '  Karina   Somaggio ',
        telefone: '(21) 98888-7777',
        endereco: {
          cep: '20040-020',
          logradouro: 'Av. Rio Branco',
          numero: '100',
          complemento: '',
          bairro: 'Centro',
          cidade: 'Rio de Janeiro',
          uf: 'rj',
        },
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      nome: 'Karina Somaggio',
      telefone: '21988887777',
      email: u.email,
      endereco: { cep: '20040020', uf: 'RJ', complemento: null, cidade: 'Rio de Janeiro' },
    });

    const comEmail = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: bearer(u.token),
      payload: { email: 'outro@teste.org' },
    });
    expect(comEmail.statusCode).toBe(400);
  });

  it('recusa nome que é e-mail, telefone inválido e corpo vazio', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const patch = (payload: object) =>
      app.inject({ method: 'PATCH', url: '/v1/me', headers: bearer(u.token), payload });

    const nome = await patch({ nome: u.email });
    expect(nome.statusCode).toBe(422);
    expect(nome.json()).toMatchObject({ codigo: 'NOME_INVALIDO' });
    expect((await patch({ telefone: '123' })).statusCode).toBe(422);
    expect((await patch({})).statusCode).toBe(400);
  });

  it('sem token: 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { nome: 'Ana Paula' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('resumo do perfil (GET /me/resumo)', () => {
  it('conta só o que é da pessoa: apadrinhamento ativo entra', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const resumo = () =>
      app.inject({ method: 'GET', url: '/v1/me/resumo', headers: bearer(u.token) });
    expect((await resumo()).json()).toEqual({ adocoes: 0, doacoes: 0, apadrinhados: 0 });

    const animalId = await criarAnimal();
    const ap = await app.inject({
      method: 'POST',
      url: '/v1/apadrinhamentos',
      headers: bearer(u.token),
      payload: { animalId },
    });
    expect(ap.statusCode, ap.body).toBe(201);
    expect((await resumo()).json()).toEqual({ adocoes: 0, doacoes: 0, apadrinhados: 1 });
  });
});

describe('trocar senha (POST /me/senha)', () => {
  it('confere a atual, mantém ESTA sessão e derruba as outras', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const outro = await login(u.email, SENHA, 'tablet-antigo');
    const refreshOutro = outro.json<{ refreshToken: string }>().refreshToken;

    const errada = await app.inject({
      method: 'POST',
      url: '/v1/me/senha',
      headers: bearer(u.token),
      payload: { senhaAtual: 'naoesta123', novaSenha: 'potros2027' },
    });
    expect(errada.statusCode).toBe(422);
    expect(errada.json()).toMatchObject({
      codigo: 'SENHA_INCORRETA',
      erros: [{ campo: 'senhaAtual' }],
    });

    const fraca = await app.inject({
      method: 'POST',
      url: '/v1/me/senha',
      headers: bearer(u.token),
      payload: { senhaAtual: SENHA, novaSenha: 'curta' },
    });
    expect(fraca.json()).toMatchObject({ codigo: 'SENHA_FRACA' });

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/me/senha',
      headers: bearer(u.token),
      payload: { senhaAtual: SENHA, novaSenha: 'potros2027' },
    });
    expect(ok.statusCode, ok.body).toBe(204);

    expect((await me(u.token)).statusCode).toBe(200);
    const renovarOutro = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: refreshOutro, deviceId: 'tablet-antigo' },
    });
    expect(renovarOutro.statusCode).toBe(401);
    expect((await login(u.email, SENHA)).statusCode).toBe(401);
    expect((await login(u.email, 'potros2027')).statusCode).toBe(200);
    expect(amb.emails.alteracoes).toContain(u.email);
  });

  it('chutar a senha atual tem limite por usuário', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const tentar = () =>
      app.inject({
        method: 'POST',
        url: '/v1/me/senha',
        headers: bearer(u.token),
        payload: { senhaAtual: 'chute12345', novaSenha: 'potros2027' },
      });
    for (let i = 0; i < 5; i++) expect((await tentar()).statusCode).toBe(422);
    const bloqueado = await tentar();
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.headers['retry-after']).toBeDefined();
  });
});

describe('exportar dados — LGPD (GET /me/exportacao)', () => {
  it('traz CPF e nascimento decifrados, consentimentos e nunca o hash da senha', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/exportacao',
      headers: bearer(u.token),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const corpo = res.json<{
      titular: { cpf: string; dataNasc: string; email: string };
      consentimentos: { termosDeUsoEm: string };
    }>();
    expect(corpo.titular.email).toBe(u.email);
    expect(corpo.titular.cpf).toMatch(/^\d{11}$/);
    expect(corpo.titular.dataNasc).toBe('1990-05-20');
    expect(corpo.consentimentos.termosDeUsoEm).toBeTruthy();
    expect(res.body).not.toMatch(/senhaHash|argon2/i);
  });

  it('sem login: 401 (a única rota que devolve CPF exige o próprio titular)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/exportacao' });
    expect(res.statusCode).toBe(401);
  });
});

describe('excluir conta — LGPD (DELETE /me)', () => {
  it('pede a senha, anonimiza, derruba as sessões e libera e-mail e CPF', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const animalId = await criarAnimal();
    await app.inject({
      method: 'POST',
      url: '/v1/apadrinhamentos',
      headers: bearer(u.token),
      payload: { animalId },
    });
    const exportado = await app.inject({
      method: 'GET',
      url: '/v1/me/exportacao',
      headers: bearer(u.token),
    });
    const cpf = exportado.json<{ titular: { cpf: string } }>().titular.cpf;

    const errada = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: bearer(u.token),
      payload: { senha: 'errada1234' },
    });
    expect(errada.statusCode).toBe(422);

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: bearer(u.token),
      payload: { senha: SENHA },
    });
    expect(res.statusCode, res.body).toBe(204);

    expect((await me(u.token)).statusCode).toBe(401);
    expect((await login(u.email, SENHA)).statusCode).toBe(401);

    const linha = await amb.prisma.usuario.findUniqueOrThrow({
      where: { publicId: u.id },
      select: { nome: true, email: true, telefone: true, cep: true, ativo: true, removidoEm: true },
    });
    expect(linha).toMatchObject({ nome: 'Conta removida', telefone: '', cep: '', ativo: false });
    expect(linha.email).toMatch(/^removido\+.+@anon\.invalid$/);
    expect(linha.removidoEm).not.toBeNull();
    expect(await amb.prisma.apadrinhamento.count({ where: { usuario: { publicId: u.id } } })).toBe(
      0,
    );

    // E-mail e CPF livres para um novo cadastro da mesma pessoa.
    const recadastro = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: {
        nome: 'De Volta',
        dataNasc: '1990-05-20',
        cpf,
        telefone: '11987654321',
        email: u.email,
        senha: SENHA,
        endereco: {
          cep: '01001000',
          logradouro: 'Praça da Sé',
          numero: '1',
          bairro: 'Sé',
          cidade: 'São Paulo',
          uf: 'SP',
        },
        aceitouTermos: true,
        consentimentoDados: true,
        deviceId: 'aparelho-de-teste-1',
      },
    });
    expect(recadastro.statusCode, recadastro.body).toBe(201);
  });

  it('o único admin não pode se excluir', async () => {
    const unico = await criarUsuario(app, amb.prisma, { role: 'ADMIN' });
    await amb.prisma.usuario.updateMany({
      where: { role: 'ADMIN', publicId: { not: unico.id } },
      data: { role: 'USUARIO' },
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: bearer(unico.token),
      payload: { senha: SENHA },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ codigo: 'ULTIMO_ADMIN' });
  });
});
