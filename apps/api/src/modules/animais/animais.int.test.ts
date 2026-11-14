/**
 * Integração + segurança do módulo de animais com Postgres, Redis e S3
 * (SeaweedFS) reais. Exige Docker.
 */
import { randomUUID } from 'node:crypto';

import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let tokenAdmin: string;
let tokenUsuario: string;
let seq = 0;

// ── Usuários de teste ────────────────────────────────────────────────────

function cpfValido(n: number): string {
  const base = String(100_000_000 + n)
    .slice(-9)
    .split('')
    .map(Number);
  const dv = (d: number[]) => {
    const resto = (d.reduce((acc, x, i) => acc + x * (d.length + 1 - i), 0) * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join('');
}

async function sessaoDe(role: 'USUARIO' | 'ADMIN'): Promise<string> {
  seq += 1;
  const email = `animais${String(seq)}-${String(Date.now())}@teste.org`;
  const cadastro = await app.inject({
    method: 'POST',
    url: '/v1/auth/cadastro',
    payload: {
      nome: `Pessoa ${String(seq)}`,
      dataNasc: '1990-05-20',
      cpf: cpfValido(seq * 104_729 + (Date.now() % 997)),
      telefone: '11987654321',
      email,
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
    },
  });
  expect(cadastro.statusCode, cadastro.body).toBe(201);
  if (role === 'USUARIO') return cadastro.json<{ accessToken: string }>().accessToken;

  // Não existe rota para virar admin (de propósito): promove direto no banco e loga de novo.
  await amb.prisma.usuario.update({ where: { email }, data: { role: 'ADMIN' } });
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, senha: 'cavalos123', deviceId: 'aparelho-de-teste-1' },
  });
  expect(login.statusCode, login.body).toBe(200);
  return login.json<{ accessToken: string }>().accessToken;
}

// ── Helpers HTTP ─────────────────────────────────────────────────────────

const auth = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});

interface Foto {
  id: string;
  url: string;
  ordem: number;
}
interface Animal {
  id: string;
  nome: string;
  status: string;
  fotos: Foto[];
  fotoCapa: Foto | null;
}
interface Pagina {
  itens: Animal[];
  proximoCursor: string | null;
}

const dados = (extra: Record<string, unknown> = {}) => ({
  nome: 'Trovão',
  tipo: 'EQUINO',
  raca: 'Crioulo',
  idadeAprox: 96,
  sexo: 'MACHO',
  porte: 'GRANDE',
  descricao: 'Dócil e brincalhão.',
  historiaResgate: 'Resgatado de uma carroça.',
  vacinado: true,
  castrado: false,
  ...extra,
});

async function criarAnimal(extra: Record<string, unknown> = {}): Promise<Animal> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/animais',
    headers: auth(tokenAdmin),
    payload: dados(extra),
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Animal>();
}

interface Arquivo {
  nome: string;
  tipo: string;
  conteudo: Buffer;
  campo?: string;
}

/** Monta um multipart/form-data à mão (o app manda igual). */
function multipart(arquivos: Arquivo[]) {
  const fronteira = `----abraco${randomUUID()}`;
  const partes = arquivos.flatMap((a) => [
    Buffer.from(
      `--${fronteira}\r\nContent-Disposition: form-data; name="${a.campo ?? 'fotos'}"; ` +
        `filename="${a.nome}"\r\nContent-Type: ${a.tipo}\r\n\r\n`,
    ),
    a.conteudo,
    Buffer.from('\r\n'),
  ]);
  return {
    payload: Buffer.concat([...partes, Buffer.from(`--${fronteira}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${fronteira}` },
  };
}

function enviarFotos(id: string, arquivos: Arquivo[], token = tokenAdmin) {
  const corpo = multipart(arquivos);
  return app.inject({
    method: 'POST',
    url: `/v1/admin/animais/${id}/fotos`,
    headers: { ...auth(token), ...corpo.headers },
    payload: corpo.payload,
  });
}

async function jpegDeCelular(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#7c2d12' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Celular', Model: 'Modelo X' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' },
    })
    .toBuffer();
}

const foto = async (): Promise<Arquivo> => ({
  nome: 'cavalo.jpg',
  tipo: 'image/jpeg',
  conteudo: await jpegDeCelular(),
});

async function objetosDoAnimal(id: string): Promise<string[]> {
  const r = await amb.s3.cliente.send(
    new ListObjectsV2Command({ Bucket: amb.s3.config.bucket, Prefix: `animais/${id}/` }),
  );
  return (r.Contents ?? []).map((o) => o.Key ?? '');
}

// ── Ciclo de vida ────────────────────────────────────────────────────────

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  tokenAdmin = await sessaoDe('ADMIN');
  tokenUsuario = await sessaoDe('USUARIO');
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.prisma.$executeRawUnsafe('TRUNCATE animais RESTART IDENTITY CASCADE');
});

// ── Autorização ──────────────────────────────────────────────────────────

describe('autorização de /admin/animais', () => {
  it('usuário comum → 403 em todas as rotas de escrita', async () => {
    const id = randomUUID();
    const chamadas = [
      { method: 'POST' as const, url: '/v1/admin/animais', payload: dados() },
      { method: 'PUT' as const, url: `/v1/admin/animais/${id}`, payload: dados() },
      {
        method: 'PATCH' as const,
        url: `/v1/admin/animais/${id}/status`,
        payload: { status: 'DISPONIVEL' },
      },
      { method: 'DELETE' as const, url: `/v1/admin/animais/${id}` },
      { method: 'PUT' as const, url: `/v1/admin/animais/${id}/fotos`, payload: { ids: [id] } },
      { method: 'DELETE' as const, url: `/v1/admin/animais/${id}/fotos/${id}` },
    ];
    for (const c of chamadas) {
      const res = await app.inject({ ...c, headers: auth(tokenUsuario) });
      expect(res.statusCode, `${c.method} ${c.url}`).toBe(403);
    }
    expect((await enviarFotos(id, [await foto()], tokenUsuario)).statusCode).toBe(403);
    expect(await amb.prisma.animal.count()).toBe(0);
  });

  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/admin/animais', payload: dados() });
    expect(res.statusCode).toBe(401);
  });

  it('rota pública com token inválido → 401 (não vira anônimo em silêncio)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/animais',
      headers: { authorization: 'Bearer token.falso.aqui' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── CRUD + status + auditoria ────────────────────────────────────────────

describe('CRUD de animais', () => {
  it('cria, edita, troca status e remove — tudo auditado sem dados pessoais', async () => {
    const criado = await criarAnimal();
    expect(criado).toMatchObject({
      nome: 'Trovão',
      status: 'DISPONIVEL',
      fotos: [],
      fotoCapa: null,
    });

    const editado = await app.inject({
      method: 'PUT',
      url: `/v1/admin/animais/${criado.id}`,
      headers: auth(tokenAdmin),
      payload: dados({ nome: '  Trovão   Azul ', castrado: true }),
    });
    expect(editado.json<Animal>().nome).toBe('Trovão Azul');

    const status = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/animais/${criado.id}/status`,
      headers: auth(tokenAdmin),
      payload: { status: 'EM_TRATAMENTO' },
    });
    expect(status.json<Animal>().status).toBe('EM_TRATAMENTO');

    const remocao = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/animais/${criado.id}`,
      headers: auth(tokenAdmin),
    });
    expect(remocao.statusCode).toBe(204);
    const depois = await app.inject({
      method: 'GET',
      url: `/v1/animais/${criado.id}`,
      headers: auth(tokenAdmin),
    });
    expect(depois.statusCode).toBe(404);
    // Soft delete: a linha continua no banco.
    expect(await amb.prisma.animal.count({ where: { removidoEm: { not: null } } })).toBe(1);

    const logs = await amb.prisma.auditLog.findMany({
      where: { entidadeId: criado.id },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((l) => l.acao)).toEqual([
      'ANIMAL_CRIADO',
      'ANIMAL_ATUALIZADO',
      'ANIMAL_STATUS_ALTERADO',
      'ANIMAL_REMOVIDO',
    ]);
    expect(logs[1]?.detalhe).toEqual({ campos: ['nome', 'castrado'] });
    expect(logs[2]?.detalhe).toEqual({ de: 'DISPONIVEL', para: 'EM_TRATAMENTO' });
    expect(JSON.stringify(logs)).not.toMatch(/@|cpf|senha/i);
  });

  it('ADOTADO manual → 409 e nada muda', async () => {
    const { id } = await criarAnimal();
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/animais/${id}/status`,
      headers: auth(tokenAdmin),
      payload: { status: 'ADOTADO' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ codigo: string }>().codigo).toBe('TRANSICAO_STATUS_INVALIDA');
    expect((await amb.prisma.animal.findFirstOrThrow()).status).toBe('DISPONIVEL');
  });

  it('cadastrar como ADOTADO → 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/animais',
      headers: auth(tokenAdmin),
      payload: dados({ status: 'ADOTADO' }),
    });
    expect(res.statusCode).toBe(422);
  });

  it('Zod estrito: campo desconhecido → 400; PUT não aceita status', async () => {
    const extra = await app.inject({
      method: 'POST',
      url: '/v1/admin/animais',
      headers: auth(tokenAdmin),
      payload: dados({ disponivel: true }),
    });
    expect(extra.statusCode).toBe(400);

    const { id } = await criarAnimal();
    const put = await app.inject({
      method: 'PUT',
      url: `/v1/admin/animais/${id}`,
      headers: auth(tokenAdmin),
      payload: dados({ status: 'INDISPONIVEL' }),
    });
    expect(put.statusCode).toBe(400);
  });

  it('id que não é UUID → 400; UUID inexistente → 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/animais/123' })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: `/v1/animais/${randomUUID()}` })).statusCode,
    ).toBe(404);
  });
});

// ── Listagem e visibilidade ──────────────────────────────────────────────

describe('listagem pública', () => {
  const listar = async (query: string, token?: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/animais${query}`,
      headers: auth(token),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Pagina>();
  };

  it('anônimo e usuário veem só DISPONIVEL; admin vê todos e filtra', async () => {
    await criarAnimal({ nome: 'Livre' });
    await criarAnimal({ nome: 'Doente', status: 'EM_TRATAMENTO' });
    await criarAnimal({ nome: 'Oculto', status: 'INDISPONIVEL' });

    expect((await listar('?status=INDISPONIVEL')).itens.map((a) => a.nome)).toEqual(['Livre']);
    expect((await listar('', tokenUsuario)).itens.map((a) => a.nome)).toEqual(['Livre']);
    expect((await listar('', tokenAdmin)).itens).toHaveLength(3);
    expect((await listar('?status=INDISPONIVEL', tokenAdmin)).itens.map((a) => a.nome)).toEqual([
      'Oculto',
    ]);
  });

  it('detalhe: INDISPONIVEL é 404 para o público; EM_TRATAMENTO aparece', async () => {
    const oculto = await criarAnimal({ status: 'INDISPONIVEL' });
    const tratamento = await criarAnimal({ status: 'EM_TRATAMENTO' });

    expect((await app.inject({ method: 'GET', url: `/v1/animais/${oculto.id}` })).statusCode).toBe(
      404,
    );
    const admin = await app.inject({
      method: 'GET',
      url: `/v1/animais/${oculto.id}`,
      headers: auth(tokenAdmin),
    });
    expect(admin.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: `/v1/animais/${tratamento.id}` })).statusCode,
    ).toBe(200);
  });

  it('busca por nome sem diferenciar maiúsculas; % _ e \\ são texto literal', async () => {
    const especial = String.raw`Sorte_100% \o/`;
    await criarAnimal({ nome: 'Pé de Pano' });
    await criarAnimal({ nome: 'Estrela' });
    await criarAnimal({ nome: especial });
    const nomes = async (q: string) =>
      (await listar(`?q=${encodeURIComponent(q)}`)).itens.map((a) => a.nome);

    expect(await nomes('PÉ DE')).toEqual(['Pé de Pano']);
    // Sem o escape, cada um destes listaria todos os animais.
    expect(await nomes('%')).toEqual([especial]);
    expect(await nomes('_')).toEqual([especial]);
    expect(await nomes('\\')).toEqual([especial]);
    expect(await nomes('e%a')).toEqual([]);
  });

  it('filtros de tipo, porte e sexo', async () => {
    await criarAnimal({ nome: 'Trovão', tipo: 'EQUINO', porte: 'GRANDE', sexo: 'MACHO' });
    await criarAnimal({ nome: 'Pipoca', tipo: 'CANINO', porte: 'PEQUENO', sexo: 'FEMEA' });

    expect((await listar('?tipo=CANINO')).itens.map((a) => a.nome)).toEqual(['Pipoca']);
    expect((await listar('?porte=GRANDE&sexo=MACHO')).itens.map((a) => a.nome)).toEqual(['Trovão']);
    expect((await app.inject({ method: 'GET', url: '/v1/animais?tipo=GATO' })).statusCode).toBe(
      400,
    );
  });

  it('paginação por cursor percorre tudo sem repetir, mesmo com horários iguais', async () => {
    for (let i = 1; i <= 7; i++) await criarAnimal({ nome: `Animal ${String(i)}` });
    // Força empates de criadoEm: o desempate por publicId precisa funcionar.
    await amb.prisma.animal.updateMany({ data: { criadoEm: new Date('2026-11-01T10:00:00Z') } });

    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const pagina: Pagina = await listar(`?limite=3${cursor ? `&cursor=${cursor}` : ''}`);
      vistos.push(...pagina.itens.map((a) => a.id));
      cursor = pagina.proximoCursor;
      paginas += 1;
    } while (cursor && paginas < 10);

    expect(paginas).toBe(3);
    expect(new Set(vistos).size).toBe(7);
  });

  it('cursor adulterado → 400; limite acima de 50 → 400', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/animais?cursor=abc' })).statusCode).toBe(
      400,
    );
    expect((await app.inject({ method: 'GET', url: '/v1/animais?limite=51' })).statusCode).toBe(
      400,
    );
  });
});

// ── Fotos ────────────────────────────────────────────────────────────────

describe('upload de fotos', () => {
  it('JPEG de celular vira WebP sem EXIF/GPS, ≤ 1600 px, servido por URL assinada', async () => {
    const { id } = await criarAnimal();
    const res = await enviarFotos(id, [await foto()]);
    expect(res.statusCode, res.body).toBe(201);
    const [enviada] = res.json<Foto[]>();
    if (!enviada) throw new Error('sem foto na resposta');

    const [chave] = await objetosDoAnimal(id);
    expect(chave).toMatch(new RegExp(`^animais/${id}/[0-9a-f-]{36}\\.webp$`));
    const objeto = await amb.s3.cliente.send(
      new GetObjectCommand({ Bucket: amb.s3.config.bucket, Key: chave }),
    );
    expect(objeto.ContentType).toBe('image/webp');
    const meta = await sharp(Buffer.from(await objeto.Body!.transformToByteArray())).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width, meta.height)).toBe(1600);

    // A URL assinada funciona sem credenciais; sem a assinatura, o bucket recusa.
    const assinada = await fetch(enviada.url);
    expect(assinada.status).toBe(200);
    expect(assinada.headers.get('content-type')).toBe('image/webp');
    const semAssinatura = await fetch(enviada.url.split('?')[0] ?? '');
    expect(semAssinatura.status).toBe(403);

    const detalhe = await app.inject({ method: 'GET', url: `/v1/animais/${id}` });
    expect(detalhe.json<Animal>().fotoCapa?.id).toBe(enviada.id);
  });

  it('extensão .jpg com magic bytes de .exe → 422 e nada vai para o bucket', async () => {
    const { id } = await criarAnimal();
    const exe = Buffer.concat([
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'),
      Buffer.alloc(512),
    ]);
    const res = await enviarFotos(id, [
      await foto(),
      { nome: 'foto-linda.jpg', tipo: 'image/jpeg', conteudo: exe },
    ]);

    expect(res.statusCode).toBe(422);
    expect(res.json<{ codigo: string }>().codigo).toBe('IMAGEM_INVALIDA');
    expect(await objetosDoAnimal(id)).toEqual([]);
    expect(await amb.prisma.animalFoto.count()).toBe(0);
  });

  it('SVG disfarçado de PNG → 422 (SVG pode carregar script)', async () => {
    const { id } = await criarAnimal();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const res = await enviarFotos(id, [{ nome: 'x.png', tipo: 'image/png', conteudo: svg }]);
    expect(res.statusCode).toBe(422);
  });

  it('arquivo acima de 5 MB → 413', async () => {
    const { id } = await criarAnimal();
    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]);
    const res = await enviarFotos(id, [{ nome: 'g.jpg', tipo: 'image/jpeg', conteudo: grande }]);
    expect(res.statusCode).toBe(413);
    expect(res.json<{ codigo: string }>().codigo).toBe('CONTEUDO_GRANDE_DEMAIS');
    expect(await objetosDoAnimal(id)).toEqual([]);
  });

  it('mais de 10 arquivos num envio → 413', async () => {
    const { id } = await criarAnimal();
    const f = await foto();
    const res = await enviarFotos(
      id,
      Array.from({ length: 11 }, () => f),
    );
    expect(res.statusCode).toBe(413);
    expect(await amb.prisma.animalFoto.count()).toBe(0);
  });

  it('campo com outro nome → 422; corpo JSON → 422', async () => {
    const { id } = await criarAnimal();
    const res = await enviarFotos(id, [{ ...(await foto()), campo: 'arquivo' }]);
    expect(res.statusCode).toBe(422);

    const json = await app.inject({
      method: 'POST',
      url: `/v1/admin/animais/${id}/fotos`,
      headers: auth(tokenAdmin),
      payload: { fotos: [] },
    });
    expect(json.statusCode).toBe(422);
  });

  it('reordena, remove e apaga do bucket', async () => {
    const { id } = await criarAnimal();
    const f = await foto();
    const fotos = (await enviarFotos(id, [f, f, f])).json<Foto[]>();
    const [a = '', b = '', c = ''] = fotos.map((x) => x.id);

    const reordenar = await app.inject({
      method: 'PUT',
      url: `/v1/admin/animais/${id}/fotos`,
      headers: auth(tokenAdmin),
      payload: { ids: [c, a, b] },
    });
    expect(reordenar.statusCode).toBe(204);
    let detalhe = (await app.inject({ method: 'GET', url: `/v1/animais/${id}` })).json<Animal>();
    expect(detalhe.fotos.map((x) => x.id)).toEqual([c, a, b]);
    expect(detalhe.fotoCapa?.id).toBe(c);

    const chaveDeA = (await amb.prisma.animalFoto.findFirstOrThrow({ where: { publicId: a } })).url;
    const remover = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/animais/${id}/fotos/${a}`,
      headers: auth(tokenAdmin),
    });
    expect(remover.statusCode).toBe(204);
    detalhe = (await app.inject({ method: 'GET', url: `/v1/animais/${id}` })).json<Animal>();
    expect(detalhe.fotos.map((x) => x.id)).toEqual([c, b]);
    await expect(
      amb.s3.cliente.send(new HeadObjectCommand({ Bucket: amb.s3.config.bucket, Key: chaveDeA })),
    ).rejects.toMatchObject({ name: 'NotFound' });
  });

  it('limite de 10 fotos por animal no total → 422', async () => {
    const { id } = await criarAnimal();
    const f = await foto();
    expect(
      (
        await enviarFotos(
          id,
          Array.from({ length: 9 }, () => f),
        )
      ).statusCode,
    ).toBe(201);
    const excedente = await enviarFotos(id, [f, f]);
    expect(excedente.statusCode).toBe(422);
    expect(excedente.json<{ codigo: string }>().codigo).toBe('LIMITE_FOTOS');
  });
});
