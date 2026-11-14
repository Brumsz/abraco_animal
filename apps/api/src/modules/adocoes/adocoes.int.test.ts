/**
 * Integração + segurança do fluxo de adoção (seção 9: "criar → admin aprovar
 * → animal vira ADOTADO" e IDOR) com Postgres, Redis e S3 reais.
 */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;
let admin2: UsuarioTeste;
let maria: UsuarioTeste;
let joao: UsuarioTeste;
let ana: UsuarioTeste;

interface Adocao {
  id: string;
  status: string;
  recusaAutomatica: boolean;
  motivoRecusa: string | null;
  animal: { id: string; status: string };
  timeline: { etapa: string; em: string | null }[];
  solicitante?: { nome: string; email: string } | null;
  analisadoPor?: string | null;
}

const MOTIVO = 'Tenho um sítio com pasto, baia coberta e experiência com cavalos resgatados.';

const triagem = (animalId: string, extra: Record<string, unknown> = {}) => ({
  animalId,
  tipoMoradia: 'CHACARA',
  possuiEspacoAdequado: true,
  outrosAnimais: 'Dois cães',
  motivo: MOTIVO,
  aceitouTermo: true,
  ...extra,
});

async function criarAnimal(nome = 'Trovão'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/animais',
    headers: bearer(admin.token),
    payload: {
      nome,
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

const solicitar = (u: UsuarioTeste, animalId: string, extra: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/adocoes',
    headers: bearer(u.token),
    payload: triagem(animalId, extra),
  });

async function solicitarOk(u: UsuarioTeste, animalId: string): Promise<Adocao> {
  const res = await solicitar(u, animalId);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Adocao>();
}

const aprovar = (id: string, quem = admin) =>
  app.inject({
    method: 'POST',
    url: `/v1/admin/adocoes/${id}/aprovar`,
    headers: bearer(quem.token),
  });

const recusar = (id: string, motivoRecusa: string, quem = admin) =>
  app.inject({
    method: 'POST',
    url: `/v1/admin/adocoes/${id}/recusar`,
    headers: bearer(quem.token),
    payload: { motivoRecusa },
  });

const ver = (id: string, u: UsuarioTeste) =>
  app.inject({ method: 'GET', url: `/v1/adocoes/${id}`, headers: bearer(u.token) });

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Karina Admin' });
  admin2 = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Outra Admin' });
  maria = await criarUsuario(app, amb.prisma, { nome: 'Maria Souza' });
  joao = await criarUsuario(app, amb.prisma, { nome: 'João Lima' });
  ana = await criarUsuario(app, amb.prisma, { role: 'VOLUNTARIO', nome: 'Ana Voluntária' });
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.prisma.$executeRawUnsafe(
    'TRUNCATE adocoes, notificacoes, audit_logs, animais RESTART IDENTITY CASCADE',
  );
  await amb.redis.flushall();
  amb.emails.adocoes.length = 0;
});

describe('fluxo completo', () => {
  it('criar → admin aprovar → animal ADOTADO, demais encerradas e todos avisados', async () => {
    const animalId = await criarAnimal('Trovão');
    const daMaria = await solicitarOk(maria, animalId);
    const doJoao = await solicitarOk(joao, animalId);
    expect(daMaria).toMatchObject({ status: 'PENDENTE', animal: { id: animalId } });
    expect(amb.emails.adocoes.map((e) => e.tipo)).toEqual(['recebida', 'recebida']);

    const res = await aprovar(daMaria.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<Adocao>()).toMatchObject({
      status: 'APROVADA',
      analisadoPor: 'Karina Admin',
      animal: { status: 'ADOTADO' },
    });

    // O animal sai da listagem pública.
    const lista = await app.inject({ method: 'GET', url: '/v1/animais' });
    expect(lista.json<{ itens: unknown[] }>().itens).toHaveLength(0);

    // A do João foi encerrada automaticamente.
    const encerrada = (await ver(doJoao.id, joao)).json<Adocao>();
    expect(encerrada).toMatchObject({ status: 'RECUSADA', recusaAutomatica: true });
    expect(encerrada.timeline.at(-1)?.etapa).toBe('RECUSADA');

    // Notificações no sino de cada um.
    const sino = async (u: UsuarioTeste) =>
      (
        await app.inject({ method: 'GET', url: '/v1/notificacoes', headers: bearer(u.token) })
      ).json<{ itens: { tipo: string; entidadeId: string }[] }>().itens;
    expect(await sino(maria)).toEqual([
      expect.objectContaining({ tipo: 'ADOCAO_APROVADA', entidadeId: daMaria.id }),
    ]);
    expect(await sino(joao)).toEqual([
      expect.objectContaining({ tipo: 'ADOCAO_ANIMAL_ADOTADO', entidadeId: doJoao.id }),
    ]);

    expect(amb.emails.adocoes.slice(2).map((e) => [e.tipo, e.para])).toEqual([
      ['aprovada', maria.email],
      ['encerrada', joao.email],
    ]);

    const audit = await amb.prisma.auditLog.findFirstOrThrow({
      where: { acao: 'ADOCAO_APROVADA' },
    });
    expect(audit).toMatchObject({ entidade: 'Adocao', entidadeId: daMaria.id });
    expect(audit.detalhe).toEqual({ animalId, encerradas: [doJoao.id] });
  });

  it('recusa com motivo: o dono vê o motivo; o animal continua disponível; pode pedir de novo', async () => {
    const animalId = await criarAnimal();
    const { id } = await solicitarOk(maria, animalId);

    const res = await recusar(id, 'O espaço informado não comporta um cavalo de grande porte.');
    expect(res.statusCode, res.body).toBe(200);

    const vista = (await ver(id, maria)).json<Adocao>();
    expect(vista).toMatchObject({ status: 'RECUSADA', recusaAutomatica: false });
    expect(vista.motivoRecusa).toContain('grande porte');
    expect((await solicitar(maria, animalId)).statusCode).toBe(201);

    const notif = await amb.prisma.notificacao.findFirstOrThrow();
    expect(notif.corpo).not.toContain('grande porte');
  });
});

describe('segurança', () => {
  it('IDOR: usuário A tenta ver a adoção do usuário B → 403', async () => {
    const { id } = await solicitarOk(maria, await criarAnimal());
    expect((await ver(id, joao)).statusCode).toBe(403);
    expect((await ver(id, ana)).statusCode).toBe(403);
    expect((await ver(id, maria)).statusCode).toBe(200);
    expect((await ver(id, admin)).statusCode).toBe(200);
  });

  it('"minhas adoções" nunca traz as de outra pessoa', async () => {
    const animalId = await criarAnimal();
    await solicitarOk(maria, animalId);
    await solicitarOk(joao, animalId);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/adocoes',
      headers: bearer(joao.token),
    });
    expect(res.json<{ itens: Adocao[] }>().itens).toHaveLength(1);
  });

  it('usuário comum e voluntário em /admin/adocoes → 403', async () => {
    const { id } = await solicitarOk(maria, await criarAnimal());
    for (const u of [maria, ana]) {
      for (const [method, url] of [
        ['GET', '/v1/admin/adocoes'],
        ['GET', `/v1/admin/adocoes/${id}`],
        ['POST', `/v1/admin/adocoes/${id}/aprovar`],
      ] as const) {
        const r = await app.inject({ method, url, headers: bearer(u.token) });
        expect(r.statusCode, `${u.nome} ${method} ${url}`).toBe(403);
      }
    }
    expect((await recusar(id, 'Motivo suficiente aqui.', maria)).statusCode).toBe(403);
  });

  it('admin não aprova a própria solicitação; outra admin pode', async () => {
    const { id } = await solicitarOk(admin, await criarAnimal());
    const propria = await aprovar(id, admin);
    expect(propria.statusCode).toBe(403);
    expect(propria.json<{ codigo: string }>().codigo).toBe('AUTOAPROVACAO_PROIBIDA');
    expect((await aprovar(id, admin2)).statusCode).toBe(200);
  });

  it('o cliente não escolhe status nem dono: campos extras → 400', async () => {
    const animalId = await criarAnimal();
    for (const extra of [
      { status: 'APROVADA' },
      { usuarioId: joao.id },
      { termoAceitoEm: '2020-01-01' },
    ]) {
      expect((await solicitar(maria, animalId, extra)).statusCode).toBe(400);
    }
  });

  it('rate limit: 10 solicitações por hora por usuário → a 11ª é 429', async () => {
    const animais = await Promise.all(
      Array.from({ length: 11 }, (_, i) => criarAnimal(`A${String(i)}`)),
    );
    for (const a of animais.slice(0, 10)) expect((await solicitar(maria, a)).statusCode).toBe(201);
    const excedida = await solicitar(maria, animais[10] ?? '');
    expect(excedida.statusCode).toBe(429);
    expect(excedida.headers['retry-after']).toBeDefined();
    // O limite é por usuário: o João não é afetado.
    expect((await solicitar(joao, animais[10] ?? '')).statusCode).toBe(201);
  });

  it('o detalhe do admin não expõe CPF nem data de nascimento', async () => {
    const { id } = await solicitarOk(maria, await criarAnimal());
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/adocoes/${id}`,
      headers: bearer(admin.token),
    });
    expect(res.json<Adocao>().solicitante).toMatchObject({
      nome: 'Maria Souza',
      email: maria.email,
    });
    expect(res.body).not.toMatch(/cpf|dataNasc|senha/i);
  });
});

describe('regras e concorrência', () => {
  it('segunda solicitação pendente do mesmo usuário para o mesmo animal → 409', async () => {
    const animalId = await criarAnimal();
    await solicitarOk(maria, animalId);
    const res = await solicitar(maria, animalId);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ codigo: string }>().codigo).toBe('ADOCAO_PENDENTE_EXISTENTE');
  });

  it('duas solicitações simultâneas do mesmo usuário: só uma entra (índice parcial)', async () => {
    const animalId = await criarAnimal();
    const respostas = await Promise.all(
      Array.from({ length: 5 }, () => solicitar(maria, animalId)),
    );
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('duas admins aprovando pedidos diferentes do mesmo animal ao mesmo tempo: só um vence', async () => {
    const animalId = await criarAnimal();
    const a = await solicitarOk(maria, animalId);
    const b = await solicitarOk(joao, animalId);

    const [ra, rb] = await Promise.all([aprovar(a.id, admin), aprovar(b.id, admin2)]);
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([200, 409]);

    const status = await amb.prisma.adocao.findMany({ select: { status: true } });
    expect(status.map((s) => s.status).sort()).toEqual(['APROVADA', 'RECUSADA']);
  });

  it('animal que não está DISPONIVEL → 409 ao pedir e ao aprovar', async () => {
    const animalId = await criarAnimal();
    const { id } = await solicitarOk(maria, animalId);
    await app.inject({
      method: 'PATCH',
      url: `/v1/admin/animais/${animalId}/status`,
      headers: bearer(admin.token),
      payload: { status: 'EM_TRATAMENTO' },
    });
    expect((await solicitar(joao, animalId)).statusCode).toBe(409);
    const r = await aprovar(id);
    expect(r.statusCode).toBe(409);
    expect(r.json<{ codigo: string }>().codigo).toBe('ANIMAL_NAO_DISPONIVEL');
  });

  it('não dá para remover um animal com adoções pendentes', async () => {
    const animalId = await criarAnimal();
    await solicitarOk(maria, animalId);
    const r = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/animais/${animalId}`,
      headers: bearer(admin.token),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json<{ codigo: string }>().codigo).toBe('ANIMAL_COM_ADOCOES_PENDENTES');
    expect(await amb.prisma.animal.count({ where: { removidoEm: null } })).toBe(1);
  });

  it('aprovar duas vezes → 409 na segunda', async () => {
    const { id } = await solicitarOk(maria, await criarAnimal());
    expect((await aprovar(id)).statusCode).toBe(200);
    expect((await aprovar(id)).statusCode).toBe(409);
  });
});

describe('listagem admin e notificações', () => {
  it('filtros por status e animal; período inválido → 400', async () => {
    const a1 = await criarAnimal('A');
    const a2 = await criarAnimal('B');
    const x = await solicitarOk(maria, a1);
    await solicitarOk(joao, a2);
    const listar = async (q: string) =>
      (
        await app.inject({
          method: 'GET',
          url: `/v1/admin/adocoes${q}`,
          headers: bearer(admin.token),
        })
      )
        .json<{ itens: Adocao[] }>()
        .itens.map((i) => i.id);

    expect(await listar(`?animalId=${a1}`)).toEqual([x.id]);
    expect(await listar('?status=APROVADA')).toEqual([]);
    expect(await listar('')).toHaveLength(2);
    const invalido = await app.inject({
      method: 'GET',
      url: '/v1/admin/adocoes?de=2026-12-01T00:00:00Z&ate=2026-11-01T00:00:00Z',
      headers: bearer(admin.token),
    });
    expect(invalido.statusCode).toBe(400);
  });

  it('contador do sino, marcar lida e IDOR de notificação', async () => {
    const { id } = await solicitarOk(maria, await criarAnimal());
    await aprovar(id);
    const contar = async (u: UsuarioTeste) =>
      (
        await app.inject({
          method: 'GET',
          url: '/v1/notificacoes/nao-lidas',
          headers: bearer(u.token),
        })
      ).json<{ total: number }>().total;

    expect(await contar(maria)).toBe(1);
    const notif = await amb.prisma.notificacao.findFirstOrThrow();

    // O João não consegue marcar a notificação da Maria.
    const alheia = await app.inject({
      method: 'POST',
      url: `/v1/notificacoes/${notif.publicId}/lida`,
      headers: bearer(joao.token),
    });
    expect(alheia.statusCode).toBe(404);
    expect(await contar(maria)).toBe(1);

    const propria = await app.inject({
      method: 'POST',
      url: `/v1/notificacoes/${notif.publicId}/lida`,
      headers: bearer(maria.token),
    });
    expect(propria.statusCode).toBe(204);
    expect(await contar(maria)).toBe(0);

    expect((await app.inject({ method: 'GET', url: '/v1/notificacoes' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/notificacoes/${randomUUID()}/lida`,
          headers: bearer(maria.token),
        })
      ).statusCode,
    ).toBe(404);
  });
});
