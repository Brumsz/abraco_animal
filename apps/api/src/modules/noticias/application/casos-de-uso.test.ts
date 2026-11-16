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
  AdminListarNoticias,
  AdminObterNoticia,
  CriarNoticia,
  DefinirCapaNoticia,
  EditarNoticia,
  ListarNoticias,
  ObterNoticia,
  PublicarNoticia,
  RemoverNoticia,
  type CursorNoticias,
  type DadosNoticia,
  type NoticiaRegistro,
  type RepositorioNoticias,
} from './casos-de-uso.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

class NoticiasFake implements RepositorioNoticias {
  readonly lista: Mutavel<NoticiaRegistro>[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  private t = Date.parse('2026-11-01T12:00:00Z');

  slugEmUso(slug: string, excetoId?: number) {
    return Promise.resolve(this.lista.some((n) => n.slug === slug && n.id !== excetoId));
  }
  criar(d: DadosNoticia & { slug: string }, a: EntradaAuditoria) {
    this.t += 1000;
    const n = {
      ...d,
      id: this.lista.length + 1,
      publicId: randomUUID(),
      imagemChave: null,
      publicado: false,
      criadoEm: new Date(this.t),
      atualizadoEm: new Date(this.t),
    };
    this.lista.push(n);
    this.auditoria.push(a);
    return Promise.resolve({ ...n });
  }
  buscar(publicId: string) {
    const n = this.lista.find((x) => x.publicId === publicId);
    return Promise.resolve(n ? { ...n } : null);
  }
  buscarPorSlug(slug: string) {
    const n = this.lista.find((x) => x.slug === slug);
    return Promise.resolve(n ? { ...n } : null);
  }
  listar(f: { publicado?: boolean }, cursor: CursorNoticias | undefined, limite: number) {
    return Promise.resolve(
      this.lista
        .filter((n) => f.publicado === undefined || n.publicado === f.publicado)
        .filter((n) => !cursor || n.criadoEm < cursor.criadoEm)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite),
    );
  }
  private achar(n: NoticiaRegistro) {
    const x = this.lista.find((y) => y.id === n.id);
    if (!x) throw new Error('inexistente');
    return x;
  }
  atualizar(n: NoticiaRegistro, d: DadosNoticia & { slug: string }, a: EntradaAuditoria) {
    Object.assign(this.achar(n), d);
    this.auditoria.push(a);
    return Promise.resolve({ ...this.achar(n) });
  }
  alterarPublicacao(n: NoticiaRegistro, publicado: boolean, a: EntradaAuditoria) {
    this.achar(n).publicado = publicado;
    this.auditoria.push(a);
    return Promise.resolve();
  }
  definirImagem(n: NoticiaRegistro, chave: string | null) {
    this.achar(n).imagemChave = chave;
    return Promise.resolve();
  }
  remover(n: NoticiaRegistro, a: EntradaAuditoria) {
    this.lista.splice(this.lista.indexOf(this.achar(n)), 1);
    this.auditoria.push(a);
    return Promise.resolve();
  }
}

const ADMIN: Ator = { id: 'admin', role: 'ADMIN' };
const MARIA: Ator = { id: 'maria', role: 'USUARIO' };

let repo: NoticiasFake;
let armazenamento: ArmazenamentoFake;
let deps: { noticias: NoticiasFake; armazenamento: ArmazenamentoFake; imagens: ProcessadorFake };

beforeEach(() => {
  repo = new NoticiasFake();
  armazenamento = new ArmazenamentoFake();
  deps = { noticias: repo, armazenamento, imagens: new ProcessadorFake() };
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

const criar = (extra: Record<string, unknown> = {}) =>
  new CriarNoticia(deps).executar({
    ator: ADMIN,
    titulo: 'Trovão é adotado!',
    resumo: 'Depois de 2 anos, Trovão ganhou um lar.',
    conteudo: '# Que alegria\n\nTrovão foi para uma fazenda.',
    ...extra,
  });

describe('notícias', () => {
  it('cria rascunho com slug do título e conteúdo sanitizado', async () => {
    const n = await criar({ conteudo: 'Olá <script>alert(1)</script>[x](javascript:alert(1))' });
    expect(n).toMatchObject({ slug: 'trovao-e-adotado', publicado: false, imagem: null });
    expect(n.conteudo).toBe('Olá [x](#)');
    expect(await codigoDe(criar({ conteudo: '<script>só isso</script>' }))).toBe(
      'CAMPO_OBRIGATORIO',
    );
  });

  it('slug repetido ganha sufixo; slug informado inválido ou em uso → erro', async () => {
    await criar();
    expect((await criar()).slug).toBe('trovao-e-adotado-2');
    expect((await criar()).slug).toBe('trovao-e-adotado-3');
    expect(await codigoDe(criar({ slug: 'Com Espaço' }))).toBe('SLUG_INVALIDO');
    expect(await codigoDe(criar({ slug: 'trovao-e-adotado' }))).toBe('SLUG_EM_USO');
    expect((await criar({ slug: 'meu-slug' })).slug).toBe('meu-slug');
  });

  it('público só vê publicadas; detalhe por slug; listagem sem o conteúdo', async () => {
    const n = await criar();
    expect(await codigoDe(new ObterNoticia(deps).executar({ slug: n.slug }))).toBe(
      'NOTICIA_NAO_ENCONTRADA',
    );
    expect((await new ListarNoticias(deps).executar({})).itens).toHaveLength(0);
    await new PublicarNoticia(deps).executar({ ator: ADMIN, id: n.id, publicado: true });
    const lista = await new ListarNoticias(deps).executar({});
    expect(lista.itens.map((i) => i.slug)).toEqual([n.slug]);
    expect(lista.itens[0]).not.toHaveProperty('conteudo');
    expect((await new ObterNoticia(deps).executar({ slug: n.slug })).conteudo).toContain('fazenda');
  });

  it('editar o título NÃO muda o slug; trocar o slug explicitamente muda', async () => {
    const n = await criar();
    const editar = (extra: Record<string, unknown>) =>
      new EditarNoticia(deps).executar({
        ator: ADMIN,
        id: n.id,
        titulo: 'Outro título',
        resumo: 'r',
        conteudo: 'c',
        ...extra,
      });
    expect((await editar({})).slug).toBe('trovao-e-adotado');
    expect((await editar({ slug: 'novo-endereco' })).slug).toBe('novo-endereco');
    // Manter o próprio slug não conta como "em uso".
    expect((await editar({ slug: 'novo-endereco' })).slug).toBe('novo-endereco');
  });

  it('capa: magic bytes, troca apaga a antiga, remover apaga tudo', async () => {
    const n = await criar();
    const capa = (arquivo: Buffer | null) =>
      new DefinirCapaNoticia(deps).executar({ ator: ADMIN, id: n.id, arquivo });
    expect(await codigoDe(capa(EXE))).toBe('IMAGEM_INVALIDA');
    const c1 = await capa(JPEG_FALSO);
    expect(c1.imagem).toMatch(/noticias\/.+\.webp/);
    await capa(JPEG_FALSO);
    expect(armazenamento.objetos.size).toBe(1);
    await capa(null);
    expect(armazenamento.objetos.size).toBe(0);
    await capa(JPEG_FALSO);
    await new RemoverNoticia(deps).executar({ ator: ADMIN, id: n.id });
    expect(armazenamento.objetos.size).toBe(0);
    expect(repo.auditoria.map((a) => a.acao)).toEqual(['NOTICIA_CRIADA', 'NOTICIA_REMOVIDA']);
  });

  it('admin lista com filtro e vê rascunho; só ADMIN gerencia', async () => {
    const n = await criar();
    expect(
      (await new AdminListarNoticias(deps).executar({ ator: ADMIN, publicado: false })).itens,
    ).toHaveLength(1);
    expect(
      (await new AdminListarNoticias(deps).executar({ ator: ADMIN, publicado: true })).itens,
    ).toHaveLength(0);
    expect((await new AdminObterNoticia(deps).executar({ ator: ADMIN, id: n.id })).publicado).toBe(
      false,
    );
    for (const p of [
      new CriarNoticia(deps).executar({ ator: MARIA, titulo: 't', resumo: 'r', conteudo: 'c' }),
      new PublicarNoticia(deps).executar({ ator: MARIA, id: n.id, publicado: true }),
      new RemoverNoticia(deps).executar({ ator: MARIA, id: n.id }),
      new AdminListarNoticias(deps).executar({ ator: MARIA }),
    ]) {
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
  });
});
