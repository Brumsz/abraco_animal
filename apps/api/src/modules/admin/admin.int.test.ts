/** Integração do painel administrativo com Postgres, Redis e S3 reais. */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;
let admin2: UsuarioTeste;

const req = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  token?: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    headers: { ...bearer(token), ...headers },
    ...(payload ? { payload } : {}),
  });

async function criarAnimal(nome: string): Promise<string> {
  const r = await req('POST', '/v1/admin/animais', admin.token, {
    nome,
    tipo: 'EQUINO',
    raca: 'SRD',
    idadeAprox: 60,
    sexo: 'MACHO',
    porte: 'GRANDE',
    descricao: 'Dócil.',
    historiaResgate: 'Resgatado.',
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<{ id: string }>().id;
}

const triagem = (animalId: string) => ({
  animalId,
  tipoMoradia: 'FAZENDA',
  possuiEspacoAdequado: true,
  motivo: 'Tenho uma fazenda com pasto amplo e experiência de muitos anos com cavalos.',
  aceitouTermo: true,
});

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Karina Admin' });
  admin2 = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Outra Admin' });
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.redis.flushall();
});

describe('dashboard', () => {
  it('métricas reais: pendências, disponíveis, Pix do mês e adoções aprovadas por mês', async () => {
    const maria = await criarUsuario(app, amb.prisma);
    const joao = await criarUsuario(app, amb.prisma);
    const a1 = await criarAnimal('Trovão');
    const a2 = await criarAnimal('Estrela');
    await criarAnimal('Pipoca');

    // 1 adoção aprovada (Trovão) e 1 pendente (Estrela).
    const aprovar = (await req('POST', '/v1/adocoes', maria.token, triagem(a1))).json<{
      id: string;
    }>();
    await req('POST', `/v1/admin/adocoes/${aprovar.id}/aprovar`, admin.token);
    await req('POST', '/v1/adocoes', joao.token, triagem(a2));

    // 1 Pix confirmado de R$ 50,00 e 1 pendente.
    const pix = await req(
      'POST',
      '/v1/doacoes-financeiras',
      undefined,
      { valor: '50.00' },
      { 'idempotency-key': randomUUID() },
    );
    const psp = (
      await amb.prisma.doacaoFinanceira.findUniqueOrThrow({
        where: { publicId: pix.json<{ id: string }>().id },
      })
    ).pspTxId;
    amb.psp.simularPagamento(psp);
    await req('GET', `/v1/doacoes-financeiras/${pix.json<{ id: string }>().id}/status`);
    await req(
      'POST',
      '/v1/doacoes-financeiras',
      undefined,
      { valor: '20.00' },
      { 'idempotency-key': randomUUID() },
    );

    // 1 candidatura pendente.
    await req('POST', '/v1/voluntariado/candidaturas', joao.token, {
      areasInteresse: ['EVENTOS'],
      disponibilidadeDias: ['SABADO'],
      turnos: ['MANHA'],
      motivacao: 'Quero ajudar nos eventos de arrecadação da ONG.',
    });

    const r = await req('GET', '/v1/admin/dashboard', admin.token);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json<{
      adocoesPendentes: number;
      animaisDisponiveis: number;
      doacoesFinanceirasMes: { quantidade: number; total: string };
      adocoesPorMes: { mes: string; total: number }[];
      ultimasPendencias: { tipo: string; titulo: string }[];
    }>();
    expect(d.adocoesPendentes).toBe(1);
    expect(d.animaisDisponiveis).toBe(2); // Trovão foi adotado
    expect(d.doacoesFinanceirasMes).toEqual({ quantidade: 1, total: '50.00' });
    expect(d.adocoesPorMes).toHaveLength(6);
    expect(d.adocoesPorMes.at(-1)?.total).toBe(1);
    expect(d.ultimasPendencias.map((p) => p.tipo).sort()).toEqual([
      'ADOCAO',
      'CANDIDATURA_VOLUNTARIO',
    ]);
    expect(d.ultimasPendencias.find((p) => p.tipo === 'ADOCAO')?.titulo).toBe('Adoção de Estrela');
    // Nenhum dado pessoal nos títulos.
    expect(JSON.stringify(d.ultimasPendencias)).not.toMatch(/@|Pessoa/);
  });

  it('usuário comum e voluntário → 403', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const v = await criarUsuario(app, amb.prisma, { role: 'VOLUNTARIO' });
    expect((await req('GET', '/v1/admin/dashboard', u.token)).statusCode).toBe(403);
    expect((await req('GET', '/v1/admin/dashboard', v.token)).statusCode).toBe(403);
    expect((await req('GET', '/v1/admin/dashboard')).statusCode).toBe(401);
  });
});

describe('gestão de usuários', () => {
  it('desativar derruba a sessão NA HORA; a pessoa não loga; reativar devolve o acesso', async () => {
    const u = await criarUsuario(app, amb.prisma, { nome: 'Pedro Desativado' });
    expect((await req('GET', '/v1/me', u.token)).statusCode).toBe(200);

    expect(
      (await req('PATCH', `/v1/admin/usuarios/${u.id}/ativo`, admin.token, { ativo: false }))
        .statusCode,
    ).toBe(204);
    // O access token ainda não expirou, mas já não vale.
    expect((await req('GET', '/v1/me', u.token)).statusCode).toBe(401);
    const login = await req('POST', '/v1/auth/login', undefined, {
      email: u.email,
      senha: 'cavalos123',
      deviceId: 'aparelho-de-teste-1',
    });
    expect(login.statusCode).not.toBe(200);

    await req('PATCH', `/v1/admin/usuarios/${u.id}/ativo`, admin.token, { ativo: true });
    const denovo = await req('POST', '/v1/auth/login', undefined, {
      email: u.email,
      senha: 'cavalos123',
      deviceId: 'aparelho-de-teste-1',
    });
    expect(denovo.statusCode).toBe(200);

    const acoes = (
      await amb.prisma.auditLog.findMany({ where: { entidadeId: u.id }, orderBy: { id: 'asc' } })
    ).map((l) => l.acao);
    expect(acoes).toEqual(['USUARIO_DESATIVADO', 'USUARIO_REATIVADO']);
  });

  it('promover a voluntário; rebaixar derruba a sessão (permissão cai na hora)', async () => {
    const u = await criarUsuario(app, amb.prisma);
    expect(
      (await req('PATCH', `/v1/admin/usuarios/${u.id}/role`, admin.token, { role: 'VOLUNTARIO' }))
        .statusCode,
    ).toBe(204);
    expect((await amb.prisma.usuario.findUniqueOrThrow({ where: { email: u.email } })).role).toBe(
      'VOLUNTARIO',
    );

    const v = await criarUsuario(app, amb.prisma, { role: 'VOLUNTARIO' });
    expect((await req('GET', '/v1/me', v.token)).statusCode).toBe(200);
    await req('PATCH', `/v1/admin/usuarios/${v.id}/role`, admin.token, { role: 'USUARIO' });
    expect((await req('GET', '/v1/me', v.token)).statusCode).toBe(401);
  });

  it('não promove a ADMIN, não mexe em outro ADMIN nem na própria conta', async () => {
    const u = await criarUsuario(app, amb.prisma);
    expect(
      (await req('PATCH', `/v1/admin/usuarios/${u.id}/role`, admin.token, { role: 'ADMIN' }))
        .statusCode,
    ).toBe(400);
    const outro = await req('PATCH', `/v1/admin/usuarios/${admin2.id}/ativo`, admin.token, {
      ativo: false,
    });
    expect(outro.statusCode).toBe(403);
    expect(outro.json<{ codigo: string }>().codigo).toBe('ALVO_E_ADMIN');
    const proprio = await req('PATCH', `/v1/admin/usuarios/${admin.id}/ativo`, admin.token, {
      ativo: false,
    });
    expect(proprio.json<{ codigo: string }>().codigo).toBe('ACAO_NA_PROPRIA_CONTA');
    expect((await req('GET', '/v1/me', admin2.token)).statusCode).toBe(200);
  });

  it('lista: filtro por role, busca por nome/e-mail (% literal) e sem CPF', async () => {
    await criarUsuario(app, amb.prisma, { nome: 'Zuleica Buscável' });
    const busca = await req('GET', '/v1/admin/usuarios?q=zuleica', admin.token);
    expect(busca.json<{ itens: { nome: string }[] }>().itens.map((u) => u.nome)).toEqual([
      'Zuleica Buscável',
    ]);
    expect(
      (await req('GET', '/v1/admin/usuarios?q=%25', admin.token)).json<{ itens: unknown[] }>()
        .itens,
    ).toEqual([]);
    const admins = (await req('GET', '/v1/admin/usuarios?role=ADMIN', admin.token)).json<{
      itens: { role: string }[];
    }>();
    expect(admins.itens.every((u) => u.role === 'ADMIN')).toBe(true);
    expect(busca.body).not.toMatch(/cpf|dataNasc|senha/i);
    const usuario = await criarUsuario(app, amb.prisma);
    expect((await req('GET', '/v1/admin/usuarios', usuario.token)).statusCode).toBe(403);
  });
});

describe('auditoria', () => {
  it('filtra por admin, entidade e ação; paginação; período invertido → 400', async () => {
    const u = await criarUsuario(app, amb.prisma);
    await req('PATCH', `/v1/admin/usuarios/${u.id}/role`, admin2.token, { role: 'VOLUNTARIO' });

    const porAdmin = await req('GET', `/v1/admin/auditoria?adminId=${admin2.id}`, admin.token);
    const itens = porAdmin.json<{
      itens: { admin: { nome: string }; acao: string; detalhe: unknown }[];
    }>().itens;
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      admin: { nome: 'Outra Admin' },
      acao: 'USUARIO_ROLE_ALTERADA',
      detalhe: { de: 'USUARIO', para: 'VOLUNTARIO' },
    });

    const porEntidade = await req(
      'GET',
      '/v1/admin/auditoria?entidade=Animal&limite=2',
      admin.token,
    );
    const pag = porEntidade.json<{ itens: { entidade: string }[]; proximoCursor: string | null }>();
    expect(pag.itens.every((i) => i.entidade === 'Animal')).toBe(true);
    expect(pag.proximoCursor).not.toBeNull();

    const invertido = await req(
      'GET',
      '/v1/admin/auditoria?de=2026-12-01T00:00:00Z&ate=2026-11-01T00:00:00Z',
      admin.token,
    );
    expect(invertido.statusCode).toBe(400);
    expect(JSON.stringify(itens)).not.toMatch(/cpf|senha|@/i);
  });
});
