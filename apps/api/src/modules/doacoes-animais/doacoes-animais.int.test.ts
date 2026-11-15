/**
 * Integração da doação de animais com Postgres, Redis e S3 (SeaweedFS) reais:
 * envio com fotos → aprovar → receber cria o Animal EM_TRATAMENTO.
 */
import { randomUUID } from 'node:crypto';

import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;
let admin2: UsuarioTeste;
let maria: UsuarioTeste;
let joao: UsuarioTeste;
let jpeg: Buffer;

interface Doacao {
  id: string;
  status: string;
  animalCriadoId: string | null;
  fotos: { id: string; url: string }[];
  doador?: { nome: string } | null;
}

const dados = (extra: Record<string, unknown> = {}) => ({
  nomeAnimal: 'Pipoca',
  tipo: 'CANINO',
  raca: 'SRD',
  idadeAprox: 24,
  sexo: 'FEMEA',
  porte: 'MEDIO',
  descricao: 'Muito carinhosa e sociável.',
  motivoDoacao: 'Vou me mudar para um apartamento pequeno e não poderei ficar com ela.',
  enderecoRetirada: 'Rua das Flores, 123 — Centro, Campinas/SP',
  ...extra,
});

interface Parte {
  campo: string;
  conteudo: Buffer | string;
  arquivo?: string;
}

function multipart(partes: Parte[]) {
  const f = `----abraco${randomUUID()}`;
  const corpo = partes.flatMap((p) => [
    Buffer.from(
      `--${f}\r\nContent-Disposition: form-data; name="${p.campo}"` +
        (p.arquivo ? `; filename="${p.arquivo}"\r\nContent-Type: image/jpeg` : '') +
        '\r\n\r\n',
    ),
    Buffer.isBuffer(p.conteudo) ? p.conteudo : Buffer.from(p.conteudo),
    Buffer.from('\r\n'),
  ]);
  return {
    payload: Buffer.concat([...corpo, Buffer.from(`--${f}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${f}` },
  };
}

const foto = (conteudo = jpeg): Parte => ({ campo: 'fotos', conteudo, arquivo: 'pipoca.jpg' });
const campoDados = (d: unknown = dados()): Parte => ({
  campo: 'dados',
  conteudo: typeof d === 'string' ? d : JSON.stringify(d),
});

function enviar(partes: Parte[], u: UsuarioTeste = maria) {
  const m = multipart(partes);
  return app.inject({
    method: 'POST',
    url: '/v1/doacoes-animais',
    headers: { ...bearer(u.token), ...m.headers },
    payload: m.payload,
  });
}

async function doar(u: UsuarioTeste = maria): Promise<Doacao> {
  const r = await enviar([campoDados(), foto(), foto()], u);
  expect(r.statusCode, r.body).toBe(201);
  return r.json<Doacao>();
}

const acao = (id: string, verbo: 'aprovar' | 'receber', quem = admin) =>
  app.inject({
    method: 'POST',
    url: `/v1/admin/doacoes-animais/${id}/${verbo}`,
    headers: bearer(quem.token),
  });

async function chavesComPrefixo(prefixo: string): Promise<string[]> {
  const r = await amb.s3.cliente.send(
    new ListObjectsV2Command({ Bucket: amb.s3.config.bucket, Prefix: prefixo }),
  );
  return (r.Contents ?? []).map((o) => o.Key ?? '');
}

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Karina Admin' });
  admin2 = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Outra Admin' });
  maria = await criarUsuario(app, amb.prisma, { nome: 'Maria Souza' });
  joao = await criarUsuario(app, amb.prisma, { nome: 'João Lima' });
  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#a16207' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' } })
    .toBuffer();
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.prisma.$executeRawUnsafe(
    'TRUNCATE doacoes_animais, notificacoes, audit_logs, animais RESTART IDENTITY CASCADE',
  );
  await amb.redis.flushall();
});

describe('fluxo completo', () => {
  it('doar → aprovar → receber cria o animal EM_TRATAMENTO com cópias das fotos', async () => {
    const doacao = await doar();
    expect(doacao).toMatchObject({ status: 'PENDENTE', animalCriadoId: null });
    expect(doacao.fotos).toHaveLength(2);
    // Fotos da doação: servidas por URL assinada, sem EXIF.
    const img = await fetch(doacao.fotos[0]?.url ?? '');
    expect(img.status).toBe(200);
    expect((await sharp(Buffer.from(await img.arrayBuffer())).metadata()).exif).toBeUndefined();

    expect((await acao(doacao.id, 'aprovar')).statusCode).toBe(200);
    const recebida = await acao(doacao.id, 'receber');
    expect(recebida.statusCode, recebida.body).toBe(200);
    const r = recebida.json<Doacao>();
    expect(r.status).toBe('RECEBIDA');

    // O animal existe, EM_TRATAMENTO, visível no detalhe público, com 2 fotos próprias.
    const animal = await app.inject({
      method: 'GET',
      url: `/v1/animais/${r.animalCriadoId ?? ''}`,
    });
    expect(animal.statusCode).toBe(200);
    const a = animal.json<{
      nome: string;
      status: string;
      historiaResgate: string;
      fotos: unknown[];
    }>();
    expect(a).toMatchObject({ nome: 'Pipoca', status: 'EM_TRATAMENTO' });
    expect(a.fotos).toHaveLength(2);
    expect(a.historiaResgate).not.toContain('apartamento');
    expect(await chavesComPrefixo(`animais/${r.animalCriadoId ?? ''}/`)).toHaveLength(2);

    // Apagar uma foto do animal não afeta a doação (são cópias).
    const fotoAnimal = await amb.prisma.animalFoto.findFirstOrThrow();
    await app.inject({
      method: 'DELETE',
      url: `/v1/admin/animais/${r.animalCriadoId ?? ''}/fotos/${fotoAnimal.publicId}`,
      headers: bearer(admin.token),
    });
    const fotoDoacao = await amb.prisma.doacaoAnimalFoto.findFirstOrThrow();
    await expect(
      amb.s3.cliente.send(
        new HeadObjectCommand({ Bucket: amb.s3.config.bucket, Key: fotoDoacao.url }),
      ),
    ).resolves.toBeDefined();

    // Notificações para a doadora e auditoria.
    const notifs = await amb.prisma.notificacao.findMany({ orderBy: { id: 'asc' } });
    expect(notifs.map((n) => n.titulo)).toEqual([
      'Sua doação foi aceita 💛',
      'Pipoca chegou à ONG!',
    ]);
    const acoes = (await amb.prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).map(
      (l) => l.acao,
    );
    expect(acoes).toEqual([
      'DOACAO_ANIMAL_APROVADA',
      'DOACAO_ANIMAL_RECEBIDA',
      'ANIMAL_CRIADO',
      'ANIMAL_FOTO_REMOVIDA',
    ]);
    expect(amb.emails.adocoes.filter((e) => e.para === maria.email).map((e) => e.tipo)).toEqual(
      expect.arrayContaining(['doacao-enviada', 'doacao-aprovada', 'doacao-concluida']),
    );
  });

  it('receber é idempotente, mesmo com duas admins ao mesmo tempo: um animal só', async () => {
    const { id } = await doar();
    await acao(id, 'aprovar');
    const antes = (await chavesComPrefixo('animais/')).length;
    const respostas = await Promise.all([acao(id, 'receber', admin), acao(id, 'receber', admin2)]);
    expect(respostas.map((r) => r.statusCode)).toEqual([200, 200]);
    const [r1, r2] = respostas.map((r) => r.json<Doacao>());
    expect(r1?.animalCriadoId).toBe(r2?.animalCriadoId);
    expect(await amb.prisma.animal.count()).toBe(1);
    // As cópias da tentativa perdedora foram apagadas.
    expect((await chavesComPrefixo('animais/')).length - antes).toBe(2);

    expect((await acao(id, 'receber')).json<Doacao>().animalCriadoId).toBe(r1?.animalCriadoId);
    expect(await amb.prisma.animal.count()).toBe(1);
  });

  it('receber sem aprovar → 409', async () => {
    const { id } = await doar();
    expect((await acao(id, 'receber')).statusCode).toBe(409);
  });
});

describe('segurança e validação do envio', () => {
  it('.exe disfarçado de .jpg → 422 e nada fica no bucket', async () => {
    const exe = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(300)]);
    // O bucket não é limpo entre testes: compara com o que já havia.
    const antes = (await chavesComPrefixo('doacoes-animais/')).length;
    const r = await enviar([campoDados(), foto(), foto(exe)]);
    expect(r.statusCode).toBe(422);
    expect(r.json<{ codigo: string }>().codigo).toBe('IMAGEM_INVALIDA');
    expect(await chavesComPrefixo('doacoes-animais/')).toHaveLength(antes);
    expect(await amb.prisma.doacaoAnimal.count()).toBe(0);
  });

  it('sem foto → 422; sem "dados" → 400; JSON inválido → 400; campo extra → 400', async () => {
    expect((await enviar([campoDados()])).statusCode).toBe(422);
    expect((await enviar([foto()])).statusCode).toBe(400);
    expect((await enviar([campoDados('{nao é json'), foto()])).statusCode).toBe(400);
    const extra = await enviar([campoDados(dados({ status: 'RECEBIDA' })), foto()]);
    expect(extra.statusCode).toBe(400);
    expect(await amb.prisma.doacaoAnimal.count()).toBe(0);
  });

  it('sem login → 401; corpo JSON em vez de multipart → 400', async () => {
    const m = multipart([campoDados(), foto()]);
    const anonimo = await app.inject({
      method: 'POST',
      url: '/v1/doacoes-animais',
      headers: m.headers,
      payload: m.payload,
    });
    expect(anonimo.statusCode).toBe(401);
    const json = await app.inject({
      method: 'POST',
      url: '/v1/doacoes-animais',
      headers: bearer(maria.token),
      payload: dados(),
    });
    expect([400, 415]).toContain(json.statusCode);
  });

  it('IDOR: outro usuário → 403; admin vê com contato do doador', async () => {
    const { id } = await doar();
    const ver = (u: UsuarioTeste) =>
      app.inject({ method: 'GET', url: `/v1/doacoes-animais/${id}`, headers: bearer(u.token) });
    expect((await ver(joao)).statusCode).toBe(403);
    expect((await ver(maria)).statusCode).toBe(200);
    const detalhe = await app.inject({
      method: 'GET',
      url: `/v1/admin/doacoes-animais/${id}`,
      headers: bearer(admin.token),
    });
    expect(detalhe.json<Doacao>().doador).toMatchObject({ nome: 'Maria Souza' });
    expect(detalhe.body).not.toMatch(/cpf|dataNasc/i);
  });

  it('usuário comum em /admin/doacoes-animais → 403', async () => {
    const { id } = await doar();
    for (const [method, url] of [
      ['GET', '/v1/admin/doacoes-animais'],
      ['GET', `/v1/admin/doacoes-animais/${id}`],
      ['POST', `/v1/admin/doacoes-animais/${id}/aprovar`],
      ['POST', `/v1/admin/doacoes-animais/${id}/receber`],
    ] as const) {
      expect((await app.inject({ method, url, headers: bearer(maria.token) })).statusCode).toBe(
        403,
      );
    }
  });

  it('"minhas doações" só traz as do usuário', async () => {
    await doar(maria);
    await doar(joao);
    const r = await app.inject({
      method: 'GET',
      url: '/v1/me/doacoes-animais',
      headers: bearer(joao.token),
    });
    expect(r.json<{ itens: unknown[] }>().itens).toHaveLength(1);
  });

  it('rate limit: a 11ª doação na hora → 429, antes de ler as fotos', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await enviar([campoDados(), foto()])).statusCode).toBe(201);
    }
    expect((await enviar([campoDados(), foto()])).statusCode).toBe(429);
    expect(await amb.prisma.doacaoAnimal.count()).toBe(10);
  });

  it('recusar depois de aprovada: motivo para a doadora, sem animal criado', async () => {
    const { id } = await doar();
    await acao(id, 'aprovar');
    const r = await app.inject({
      method: 'POST',
      url: `/v1/admin/doacoes-animais/${id}/recusar`,
      headers: bearer(admin.token),
      payload: { motivoRecusa: 'Não foi possível combinar a retirada.' },
    });
    expect(r.statusCode).toBe(200);
    const vista = await app.inject({
      method: 'GET',
      url: `/v1/doacoes-animais/${id}`,
      headers: bearer(maria.token),
    });
    expect(vista.json<{ status: string; motivoRecusa: string }>()).toMatchObject({
      status: 'RECUSADA',
      motivoRecusa: 'Não foi possível combinar a retirada.',
    });
    expect(await amb.prisma.animal.count()).toBe(0);
  });
});
