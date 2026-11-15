/**
 * Integração da Etapa 8a com Postgres, Redis e S3 reais: apadrinhamentos,
 * voluntariado (promoção a VOLUNTARIO) e conteúdo institucional.
 */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;
let maria: UsuarioTeste;
let joao: UsuarioTeste;

const TEXTO_OFICIAL_INICIO = 'Aqui na Abraço Animal, resgatamos cavalos e outros animais';

async function criarAnimal(status?: string): Promise<string> {
  const r = await app.inject({
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
      ...(status ? { status } : {}),
    },
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<{ id: string }>().id;
}

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token?: string,
  payload?: Record<string, unknown>,
) =>
  app.inject({
    method,
    url,
    headers: bearer(token),
    ...(payload !== undefined ? { payload } : {}),
  });

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Karina Admin' });
  maria = await criarUsuario(app, amb.prisma, { nome: 'Maria Aparecida Souza' });
  joao = await criarUsuario(app, amb.prisma, { nome: 'João Lima' });
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.redis.flushall();
});

describe('apadrinhamentos', () => {
  it('apadrinhar → aparece em "meus" e na lista pública só com o primeiro nome', async () => {
    const animal = await criarAnimal();
    const r = await req('POST', '/v1/apadrinhamentos', maria.token, {
      animalId: animal,
      mensagemPadrinho: 'Força, Trovão!',
    });
    expect(r.statusCode, r.body).toBe(201);

    const meus = await req('GET', '/v1/me/apadrinhamentos', maria.token);
    expect(meus.json<{ animal: { id: string } }[]>().map((a) => a.animal.id)).toEqual([animal]);

    const publico = await req('GET', `/v1/animais/${animal}/padrinhos`);
    expect(publico.json()).toEqual([
      { nome: 'Maria', fotoUrl: null, mensagemPadrinho: 'Força, Trovão!' },
    ]);
    expect(publico.body).not.toMatch(/Aparecida|Souza|@/);

    const detalhe = await req('GET', `/v1/animais/${animal}`);
    expect(detalhe.json<{ totalPadrinhos: number }>().totalPadrinhos).toBe(1);
  });

  it('D6: EM_TRATAMENTO → 422; duplicado → 409 (também em paralelo)', async () => {
    const tratamento = await criarAnimal('EM_TRATAMENTO');
    const r = await req('POST', '/v1/apadrinhamentos', joao.token, { animalId: tratamento });
    expect(r.statusCode).toBe(422);
    expect(r.json<{ codigo: string }>().codigo).toBe('ANIMAL_NAO_APADRINHAVEL');

    const animal = await criarAnimal();
    const respostas = await Promise.all(
      [1, 2, 3].map(() => req('POST', '/v1/apadrinhamentos', joao.token, { animalId: animal })),
    );
    expect(respostas.map((x) => x.statusCode).sort()).toEqual([201, 409, 409]);
  });

  it('encerrar: só o padrinho (403 para outro); depois pode apadrinhar de novo', async () => {
    const animal = await criarAnimal();
    const { id } = (
      await req('POST', '/v1/apadrinhamentos', maria.token, { animalId: animal })
    ).json<{ id: string }>();
    expect((await req('DELETE', `/v1/apadrinhamentos/${id}`, joao.token)).statusCode).toBe(403);
    expect((await req('DELETE', `/v1/apadrinhamentos/${id}`, maria.token)).statusCode).toBe(204);
    expect((await req('GET', `/v1/animais/${animal}/padrinhos`)).json()).toEqual([]);
    expect(
      (await req('POST', '/v1/apadrinhamentos', maria.token, { animalId: animal })).statusCode,
    ).toBe(201);
    expect(await amb.prisma.apadrinhamento.count({ where: { animal: { publicId: animal } } })).toBe(
      1,
    );
  });

  it('sem login → 401; campo extra → 400', async () => {
    const animal = await criarAnimal();
    expect(
      (await req('POST', '/v1/apadrinhamentos', undefined, { animalId: animal })).statusCode,
    ).toBe(401);
    expect(
      (await req('POST', '/v1/apadrinhamentos', maria.token, { animalId: animal, ativo: false }))
        .statusCode,
    ).toBe(400);
  });
});

describe('voluntariado', () => {
  const candidatura = {
    areasInteresse: ['CUIDADO_ANIMAIS', 'TRANSPORTE'],
    disponibilidadeDias: ['SABADO'],
    turnos: ['MANHA', 'TARDE'],
    motivacao: 'Cresci no interior cuidando de cavalos e quero ajudar a ONG.',
    habilidades: 'Tenho carro e carteira de motorista.',
  };

  it('candidatar → admin aprova → o usuário vira VOLUNTARIO (e passa a ver animais em tratamento)', async () => {
    const u = await criarUsuario(app, amb.prisma, { nome: 'Ana Candidata' });
    const c = await req('POST', '/v1/voluntariado/candidaturas', u.token, candidatura);
    expect(c.statusCode, c.body).toBe(201);
    const { id } = c.json<{ id: string }>();
    expect(
      (await req('POST', '/v1/voluntariado/candidaturas', u.token, candidatura)).statusCode,
    ).toBe(409);

    const detalhe = await req('GET', `/v1/admin/voluntarios/${id}`, admin.token);
    expect(detalhe.json<{ candidato: { nome: string } }>().candidato.nome).toBe('Ana Candidata');
    expect(detalhe.body).not.toMatch(/cpf|dataNasc/i);

    const aprovar = await req('POST', `/v1/admin/voluntarios/${id}/aprovar`, admin.token, {
      cargo: 'Motorista',
    });
    expect(aprovar.statusCode, aprovar.body).toBe(200);
    expect(aprovar.json()).toMatchObject({ status: 'APROVADO', cargo: 'Motorista' });

    const usuario = await amb.prisma.usuario.findUniqueOrThrow({ where: { email: u.email } });
    expect(usuario.role).toBe('VOLUNTARIO');
    expect(
      await amb.prisma.notificacao.count({
        where: { usuarioId: usuario.id, tipo: 'VOLUNTARIADO_ATUALIZADO' },
      }),
    ).toBe(1);
    expect(amb.emails.voluntariado.filter((e) => e.para === u.email).map((e) => e.tipo)).toEqual([
      'recebida',
      'aprovado',
    ]);
    expect(
      await amb.prisma.auditLog.count({ where: { entidadeId: id, acao: 'VOLUNTARIO_APROVADO' } }),
    ).toBe(1);

    // Novo login carrega a role nova: agora vê animais EM_TRATAMENTO.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: u.email, senha: 'cavalos123', deviceId: 'aparelho-de-teste-1' },
    });
    const tokenVoluntario = login.json<{ accessToken: string }>().accessToken;
    await criarAnimal('EM_TRATAMENTO');
    const lista = await req('GET', '/v1/animais?status=EM_TRATAMENTO', tokenVoluntario);
    expect(lista.json<{ itens: unknown[] }>().itens.length).toBeGreaterThan(0);
    // Já é da equipe: não se candidata de novo.
    expect(
      (await req('POST', '/v1/voluntariado/candidaturas', tokenVoluntario, candidatura)).statusCode,
    ).toBe(409);
  });

  it('recusa com motivo; o candidato vê o motivo e pode tentar de novo', async () => {
    const u = await criarUsuario(app, amb.prisma, { nome: 'Pedro Candidato' });
    const { id } = (await req('POST', '/v1/voluntariado/candidaturas', u.token, candidatura)).json<{
      id: string;
    }>();
    const r = await req('POST', `/v1/admin/voluntarios/${id}/recusar`, admin.token, {
      motivoRecusa: 'No momento só precisamos de voluntários à tarde.',
    });
    expect(r.statusCode).toBe(200);
    const minha = await req('GET', '/v1/me/voluntariado', u.token);
    expect(minha.json()).toMatchObject({
      status: 'RECUSADO',
      motivoRecusa: expect.stringContaining('tarde') as string,
    });
    const reenvio = await req('POST', '/v1/voluntariado/candidaturas', u.token, {
      ...candidatura,
      turnos: ['TARDE'],
    });
    expect(reenvio.json()).toMatchObject({
      id,
      status: 'PENDENTE',
      turnos: ['TARDE'],
      motivoRecusa: null,
    });
    expect((await amb.prisma.usuario.findUniqueOrThrow({ where: { email: u.email } })).role).toBe(
      'USUARIO',
    );
  });

  it('usuário comum em /admin/voluntarios → 403; minha candidatura inexistente → 404', async () => {
    expect((await req('GET', '/v1/admin/voluntarios', maria.token)).statusCode).toBe(403);
    expect(
      (await req('POST', `/v1/admin/voluntarios/${randomUUID()}/aprovar`, maria.token, {}))
        .statusCode,
    ).toBe(403);
    expect((await req('GET', '/v1/me/voluntariado', joao.token)).statusCode).toBe(404);
  });

  it('OUTROS sem descrição → 422; dia inválido → 400', async () => {
    const r = await req('POST', '/v1/voluntariado/candidaturas', joao.token, {
      ...candidatura,
      areasInteresse: ['OUTROS'],
    });
    expect(r.statusCode).toBe(422);
    const dia = await req('POST', '/v1/voluntariado/candidaturas', joao.token, {
      ...candidatura,
      disponibilidadeDias: ['FERIADO'],
    });
    expect(dia.statusCode).toBe(400);
  });
});

describe('institucional', () => {
  it('"Sobre nós" já vem com o texto oficial da migração, com cache público', async () => {
    const r = await req('GET', '/v1/institucional/perfil');
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=300');
    const [sobre] = r.json<{ secao: string; conteudo: string }[]>();
    expect(sobre?.secao).toBe('SOBRE_NOS');
    expect(sobre?.conteudo.startsWith(TEXTO_OFICIAL_INICIO)).toBe(true);
    expect(sobre?.conteudo).toContain('Karina Somaggio');
  });

  it('admin edita seções; rascunho não aparece para o público', async () => {
    const fundacao = await req('PUT', '/v1/admin/perfil-ong/FUNDACAO', admin.token, {
      titulo: 'Nossa fundação',
      conteudo: 'Texto da fundação.',
      publicado: false,
    });
    expect(fundacao.statusCode, fundacao.body).toBe(200);
    const publico = (await req('GET', '/v1/institucional/perfil')).json<{ secao: string }[]>();
    expect(publico.map((s) => s.secao)).not.toContain('FUNDACAO');
    const todas = (await req('GET', '/v1/admin/perfil-ong', admin.token)).json<
      { secao: string }[]
    >();
    expect(todas.map((s) => s.secao)).toContain('FUNDACAO');
    expect(
      (await req('PUT', '/v1/admin/perfil-ong/OUTRA', admin.token, { titulo: 'x', conteudo: 'y' }))
        .statusCode,
    ).toBe(400);
  });

  it('FAQ: criar, reordenar, despublicar e remover; usuário comum → 403', async () => {
    const criar = async (pergunta: string) =>
      (
        await req('POST', '/v1/admin/faq', admin.token, {
          pergunta,
          resposta: `Resposta de ${pergunta}`,
        })
      ).json<{ id: string }>().id;
    const a = await criar('Como adotar?');
    const b = await criar('Como doar?');
    const c = await criar('Posso visitar?');
    expect(
      (await req('PUT', '/v1/admin/faq/ordem', admin.token, { ids: [c, a, b] })).statusCode,
    ).toBe(204);
    await req('PUT', `/v1/admin/faq/${b}`, admin.token, {
      pergunta: 'Como doar?',
      resposta: 'Pix.',
      publicado: false,
    });
    expect((await req('DELETE', `/v1/admin/faq/${a}`, admin.token)).statusCode).toBe(204);

    const publico = (await req('GET', '/v1/institucional/faq')).json<{ pergunta: string }[]>();
    expect(publico.map((f) => f.pergunta)).toEqual(['Posso visitar?']);

    expect(
      (await req('POST', '/v1/admin/faq', maria.token, { pergunta: 'P', resposta: 'R' }))
        .statusCode,
    ).toBe(403);
    expect((await req('PUT', '/v1/admin/faq/ordem', admin.token, { ids: [c] })).statusCode).toBe(
      422,
    );
    const acoes = (await amb.prisma.auditLog.findMany({ where: { entidade: 'Faq' } })).map(
      (l) => l.acao,
    );
    expect(acoes).toEqual(
      expect.arrayContaining(['FAQ_CRIADA', 'FAQ_REORDENADA', 'FAQ_ATUALIZADA', 'FAQ_REMOVIDA']),
    );
  });
});
