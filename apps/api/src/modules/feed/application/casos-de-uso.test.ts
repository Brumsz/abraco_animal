import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  ArmazenamentoFake,
  EXE,
  JPEG_FALSO,
  ProcessadorFake,
} from '../../animais/application/testes/fakes.js';
import {
  AdminListarPosts,
  CriarPost,
  Curtir,
  EditarPost,
  ListarPosts,
  ObterPost,
  PublicarPost,
  RemoverPost,
  type CursorPosts,
  type PostRegistro,
  type RepositorioPosts,
} from './casos-de-uso.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

class PostsFake implements RepositorioPosts {
  readonly lista: (Mutavel<Omit<PostRegistro, 'totalCurtidas' | 'curtidoPorMim'>> & {
    curtidas: Set<string>;
  })[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  private t = Date.parse('2026-11-01T12:00:00Z');

  private montar(p: (typeof this.lista)[number], usuarioId?: string): PostRegistro {
    const { curtidas, ...resto } = p;
    return {
      ...resto,
      totalCurtidas: curtidas.size,
      curtidoPorMim: usuarioId ? curtidas.has(usuarioId) : false,
    };
  }
  criar(d: { legenda: string; chaves: readonly string[] }, a: EntradaAuditoria) {
    this.t += 1000;
    const p = {
      id: this.lista.length + 1,
      publicId: randomUUID(),
      legenda: d.legenda,
      publicado: false,
      criadoEm: new Date(this.t),
      imagens: d.chaves.map((chave, ordem) => ({ publicId: randomUUID(), chave, ordem })),
      curtidas: new Set<string>(),
    };
    this.lista.push(p);
    this.auditoria.push(a);
    return Promise.resolve(this.montar(p));
  }
  buscar(publicId: string, usuarioId?: string) {
    const p = this.lista.find((x) => x.publicId === publicId);
    return Promise.resolve(p ? this.montar(p, usuarioId) : null);
  }
  listar(
    f: { somentePublicados: boolean },
    usuarioId: string | undefined,
    cursor: CursorPosts | undefined,
    limite: number,
  ) {
    return Promise.resolve(
      this.lista
        .filter((p) => !f.somentePublicados || p.publicado)
        .filter((p) => !cursor || p.criadoEm < cursor.criadoEm)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite)
        .map((p) => this.montar(p, usuarioId)),
    );
  }
  private achar(post: PostRegistro) {
    const p = this.lista.find((x) => x.id === post.id);
    if (!p) throw new Error('post inexistente');
    return p;
  }
  editarLegenda(post: PostRegistro, legenda: string, a: EntradaAuditoria) {
    this.achar(post).legenda = legenda;
    this.auditoria.push(a);
    return Promise.resolve();
  }
  alterarPublicacao(post: PostRegistro, publicado: boolean, a: EntradaAuditoria) {
    this.achar(post).publicado = publicado;
    this.auditoria.push(a);
    return Promise.resolve();
  }
  remover(post: PostRegistro, a: EntradaAuditoria) {
    this.lista.splice(this.lista.indexOf(this.achar(post)), 1);
    this.auditoria.push(a);
    return Promise.resolve();
  }
  curtir(post: PostRegistro, usuarioId: string) {
    this.achar(post).curtidas.add(usuarioId);
    return Promise.resolve();
  }
  descurtir(post: PostRegistro, usuarioId: string) {
    this.achar(post).curtidas.delete(usuarioId);
    return Promise.resolve();
  }
}

const ADMIN: Ator = { id: 'admin', role: 'ADMIN' };
const MARIA: Ator = { id: 'maria', role: 'USUARIO' };
const JOAO: Ator = { id: 'joao', role: 'USUARIO' };

let posts: PostsFake;
let armazenamento: ArmazenamentoFake;
let deps: { posts: PostsFake; armazenamento: ArmazenamentoFake; imagens: ProcessadorFake };

beforeEach(() => {
  posts = new PostsFake();
  armazenamento = new ArmazenamentoFake();
  deps = { posts, armazenamento, imagens: new ProcessadorFake() };
});

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return 'SEM_ERRO';
}

const criar = (legenda = '  Trovão ganhou baia nova!  ', arquivos = [JPEG_FALSO, JPEG_FALSO]) =>
  new CriarPost(deps).executar({ ator: ADMIN, legenda, arquivos });

const publicar = (id: string, publicado = true) =>
  new PublicarPost(deps).executar({ ator: ADMIN, id, publicado });

describe('feed', () => {
  it('admin cria rascunho com carrossel; o público só vê depois de publicar', async () => {
    const p = await criar();
    expect(p).toMatchObject({
      legenda: 'Trovão ganhou baia nova!',
      publicado: false,
      totalCurtidas: 0,
    });
    expect(p.imagens.map((i) => i.ordem)).toEqual([0, 1]);
    expect([...armazenamento.objetos.keys()].every((k) => k.startsWith('posts/'))).toBe(true);

    expect((await new ListarPosts(deps).executar({})).itens).toHaveLength(0);
    expect(await codigoDe(new ObterPost(deps).executar({ id: p.id }))).toBe('POST_NAO_ENCONTRADO');
    // Admin enxerga o rascunho.
    expect((await new ObterPost(deps).executar({ ator: ADMIN, id: p.id })).publicado).toBe(false);

    await publicar(p.id);
    const publico = await new ListarPosts(deps).executar({});
    expect(publico.itens.map((i) => i.id)).toEqual([p.id]);
    // O público não recebe o campo `publicado`.
    expect(publico.itens[0]).not.toHaveProperty('publicado');
  });

  it('curtidas: idempotentes, contam por usuário e não valem para rascunho', async () => {
    const p = await criar();
    expect(await codigoDe(new Curtir(deps).executar({ ator: MARIA, id: p.id, curtir: true }))).toBe(
      'POST_NAO_ENCONTRADO',
    );
    await publicar(p.id);
    const curtir = (ator: Ator, c = true) =>
      new Curtir(deps).executar({ ator, id: p.id, curtir: c });
    await curtir(MARIA);
    await curtir(MARIA);
    await curtir(JOAO);
    expect(await new ObterPost(deps).executar({ ator: MARIA, id: p.id })).toMatchObject({
      totalCurtidas: 2,
      curtidoPorMim: true,
    });
    await curtir(MARIA, false);
    await curtir(MARIA, false);
    expect(await new ObterPost(deps).executar({ ator: MARIA, id: p.id })).toMatchObject({
      totalCurtidas: 1,
      curtidoPorMim: false,
    });
    expect((await new ObterPost(deps).executar({ id: p.id })).curtidoPorMim).toBe(false);
  });

  it('upload: magic bytes falsos → nada enviado; sem imagem ou 11 imagens → erro', async () => {
    expect(await codigoDe(criar('Legenda', [JPEG_FALSO, EXE]))).toBe('IMAGEM_INVALIDA');
    expect(armazenamento.objetos.size).toBe(0);
    expect(await codigoDe(criar('Legenda', []))).toBe('FOTO_OBRIGATORIA');
    expect(
      await codigoDe(
        criar(
          'Legenda',
          Array.from({ length: 11 }, () => JPEG_FALSO),
        ),
      ),
    ).toBe('LIMITE_FOTOS');
    expect(await codigoDe(criar('   '))).toBe('CAMPO_OBRIGATORIO');
    expect(await codigoDe(criar('x'.repeat(2201)))).toBe('CAMPO_MUITO_LONGO');
  });

  it('banco falhou → apaga as imagens enviadas', async () => {
    posts.criar = () => Promise.reject(new Error('banco fora'));
    await expect(criar()).rejects.toThrow('banco fora');
    expect(armazenamento.objetos.size).toBe(0);
  });

  it('editar, despublicar e remover (apaga do bucket) com auditoria', async () => {
    const p = await criar();
    await publicar(p.id);
    await publicar(p.id); // sem mudança: não audita
    const editado = await new EditarPost(deps).executar({
      ator: ADMIN,
      id: p.id,
      legenda: 'Nova legenda',
    });
    expect(editado.legenda).toBe('Nova legenda');
    await publicar(p.id, false);
    await new RemoverPost(deps).executar({ ator: ADMIN, id: p.id });
    expect(armazenamento.objetos.size).toBe(0);
    expect(posts.auditoria.map((a) => a.acao)).toEqual([
      'POST_CRIADO',
      'POST_PUBLICADO',
      'POST_EDITADO',
      'POST_DESPUBLICADO',
      'POST_REMOVIDO',
    ]);
    expect(await codigoDe(new RemoverPost(deps).executar({ ator: ADMIN, id: p.id }))).toBe(
      'POST_NAO_ENCONTRADO',
    );
  });

  it('só ADMIN gerencia (validado no caso de uso)', async () => {
    const p = await criar();
    const voluntario: Ator = { id: 'ana', role: 'VOLUNTARIO' };
    for (const x of [
      new CriarPost(deps).executar({ ator: MARIA, legenda: 'x', arquivos: [JPEG_FALSO] }),
      new EditarPost(deps).executar({ ator: voluntario, id: p.id, legenda: 'x' }),
      new PublicarPost(deps).executar({ ator: MARIA, id: p.id, publicado: true }),
      new RemoverPost(deps).executar({ ator: voluntario, id: p.id }),
      new AdminListarPosts(deps).executar({ ator: MARIA }),
    ]) {
      expect(await codigoDe(x)).toBe('ACESSO_NEGADO');
    }
  });

  it('paginação: mais novos primeiro; admin vê rascunhos', async () => {
    const a = await criar('A');
    const b = await criar('B');
    const c = await criar('C');
    await publicar(a.id);
    await publicar(c.id);
    const p1 = await new ListarPosts(deps).executar({ limite: 1 });
    expect(p1.itens.map((i) => i.legenda)).toEqual(['C']);
    const p2 = await new ListarPosts(deps).executar({
      limite: 1,
      ...(p1.proximoCursor ? { cursor: p1.proximoCursor } : {}),
    });
    expect(p2.itens.map((i) => i.legenda)).toEqual(['A']);
    expect(p2.proximoCursor).toBeNull();
    const admin = await new AdminListarPosts(deps).executar({ ator: ADMIN });
    expect(admin.itens.map((i) => i.id)).toEqual([c.id, b.id, a.id]);
  });
});
