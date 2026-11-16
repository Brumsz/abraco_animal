/** Jornal Abraço Animal: notícias em Markdown sanitizado, com capa opcional. */
import { randomUUID } from 'node:crypto';

import {
  removerSemFalhar,
  type ArmazenamentoObjetos,
} from '../../../shared/aplicacao/armazenamento.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { prepararImagens, type ProcessadorImagens } from '../../../shared/aplicacao/imagens.js';
import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import { FORMATO_SLUG, sanitizarMarkdown, slugDe } from '../domain/conteudo.js';

export const LIMITES_NOTICIA = { titulo: 160, resumo: 300, conteudo: 50_000 } as const;

function texto(valor: string, campo: keyof typeof LIMITES_NOTICIA, rotulo: string) {
  const limpo = valor.trim();
  if (limpo.length === 0)
    throw erroValidacao('CAMPO_OBRIGATORIO', `${rotulo} é obrigatório`, campo);
  if (limpo.length > LIMITES_NOTICIA[campo]) {
    throw erroValidacao('CAMPO_MUITO_LONGO', `${rotulo} longo demais`, campo);
  }
  return limpo;
}

// ── Portas ───────────────────────────────────────────────────────────────

export interface DadosNoticia {
  readonly titulo: string;
  readonly resumo: string;
  readonly conteudo: string;
}

export interface NoticiaRegistro extends DadosNoticia {
  readonly id: number;
  readonly publicId: string;
  readonly slug: string;
  readonly imagemChave: string | null;
  readonly publicado: boolean;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

export interface CursorNoticias {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export interface RepositorioNoticias {
  slugEmUso(slug: string, excetoId?: number): Promise<boolean>;
  /** Slug duplicado numa corrida → CONFLITO `SLUG_EM_USO`. */
  criar(d: DadosNoticia & { slug: string }, a: EntradaAuditoria): Promise<NoticiaRegistro>;
  buscar(publicId: string): Promise<NoticiaRegistro | null>;
  buscarPorSlug(slug: string): Promise<NoticiaRegistro | null>;
  listar(
    filtro: { publicado?: boolean },
    cursor: CursorNoticias | undefined,
    limite: number,
  ): Promise<NoticiaRegistro[]>;
  atualizar(
    n: NoticiaRegistro,
    d: DadosNoticia & { slug: string },
    a: EntradaAuditoria,
  ): Promise<NoticiaRegistro>;
  alterarPublicacao(n: NoticiaRegistro, publicado: boolean, a: EntradaAuditoria): Promise<void>;
  definirImagem(n: NoticiaRegistro, chave: string | null): Promise<void>;
  remover(n: NoticiaRegistro, a: EntradaAuditoria): Promise<void>;
}

interface Deps {
  readonly noticias: RepositorioNoticias;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly imagens: ProcessadorImagens;
  readonly gerarId?: () => string;
}

// ── Saídas ───────────────────────────────────────────────────────────────

async function saida(n: NoticiaRegistro, armazenamento: ArmazenamentoObjetos, completa: boolean) {
  return {
    id: n.publicId,
    slug: n.slug,
    titulo: n.titulo,
    resumo: n.resumo,
    // A listagem não carrega o texto inteiro.
    ...(completa ? { conteudo: n.conteudo } : {}),
    imagem: n.imagemChave ? await armazenamento.urlAssinada(n.imagemChave) : null,
    publicado: n.publicado,
    criadoEm: n.criadoEm,
    atualizadoEm: n.atualizadoEm,
  };
}

export type NoticiaSaida = Awaited<ReturnType<typeof saida>>;

const naoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'NOTICIA_NAO_ENCONTRADA', 'Notícia não encontrada');

function validar(e: { titulo: string; resumo: string; conteudo: string }): DadosNoticia {
  const conteudo = sanitizarMarkdown(texto(e.conteudo, 'conteudo', 'Conteúdo'));
  // Conteúdo que era só HTML vira vazio depois de sanitizar.
  if (conteudo.trim().length === 0) {
    throw erroValidacao(
      'CAMPO_OBRIGATORIO',
      'O conteúdo ficou vazio depois de remover o HTML',
      'conteudo',
    );
  }
  return {
    titulo: texto(e.titulo, 'titulo', 'Título'),
    resumo: texto(e.resumo, 'resumo', 'Resumo'),
    conteudo,
  };
}

/** Slug informado pelo admin (validado e exclusivo) ou gerado do título (com sufixo -2, -3…). */
async function escolherSlug(
  repo: RepositorioNoticias,
  titulo: string,
  pedido: string | undefined,
  excetoId?: number,
): Promise<string> {
  if (pedido !== undefined) {
    const slug = pedido.trim();
    if (!FORMATO_SLUG.test(slug) || slug.length > 80) {
      throw erroValidacao('SLUG_INVALIDO', 'Use só letras minúsculas, números e hífens', 'slug');
    }
    if (await repo.slugEmUso(slug, excetoId)) {
      throw new ErroDominio(
        'CONFLITO',
        'SLUG_EM_USO',
        'Já existe uma notícia com este endereço',
        'slug',
      );
    }
    return slug;
  }
  const base = slugDe(titulo);
  for (let n = 1; n <= 50; n++) {
    const candidato = n === 1 ? base : `${base.slice(0, 76)}-${String(n)}`;
    if (!(await repo.slugEmUso(candidato, excetoId))) return candidato;
  }
  throw new ErroDominio(
    'CONFLITO',
    'SLUG_EM_USO',
    'Informe um endereço (slug) para esta notícia',
    'slug',
  );
}

export const LIMITE_PAGINA_NOTICIAS = { padrao: 10, maximo: 30 } as const;

async function pagina(
  deps: Deps,
  filtro: { publicado?: boolean },
  cursor?: CursorNoticias,
  limite?: number,
) {
  const n = Math.min(
    Math.max(Math.trunc(limite ?? LIMITE_PAGINA_NOTICIAS.padrao), 1),
    LIMITE_PAGINA_NOTICIAS.maximo,
  );
  const registros = await deps.noticias.listar(filtro, cursor, n + 1);
  const itens = registros.slice(0, n);
  const ultimo = itens.at(-1);
  return {
    itens: await Promise.all(itens.map((x) => saida(x, deps.armazenamento, false))),
    proximoCursor:
      registros.length > n && ultimo
        ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
        : null,
  };
}

async function exigir(deps: Deps, id: string) {
  const n = await deps.noticias.buscar(id);
  if (!n) throw naoEncontrada();
  return n;
}

// ── Público ──────────────────────────────────────────────────────────────

export class ListarNoticias {
  constructor(private readonly deps: Deps) {}
  executar(entrada: { cursor?: CursorNoticias; limite?: number }) {
    return pagina(this.deps, { publicado: true }, entrada.cursor, entrada.limite);
  }
}

export class ObterNoticia {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { slug: string }): Promise<NoticiaSaida> {
    const n = await this.deps.noticias.buscarPorSlug(entrada.slug);
    if (!n?.publicado) throw naoEncontrada();
    return saida(n, this.deps.armazenamento, true);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

export class AdminListarNoticias {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: {
    ator: Ator;
    publicado?: boolean;
    cursor?: CursorNoticias;
    limite?: number;
  }) {
    exigirAdmin(entrada.ator);
    return pagina(
      this.deps,
      entrada.publicado === undefined ? {} : { publicado: entrada.publicado },
      entrada.cursor,
      entrada.limite,
    );
  }
}

export class AdminObterNoticia {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string }): Promise<NoticiaSaida> {
    exigirAdmin(entrada.ator);
    return saida(await exigir(this.deps, entrada.id), this.deps.armazenamento, true);
  }
}

export class CriarNoticia {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: {
    ator: Ator;
    titulo: string;
    resumo: string;
    conteudo: string;
    slug?: string | undefined;
  }): Promise<NoticiaSaida> {
    exigirAdmin(entrada.ator);
    const dados = validar(entrada);
    const slug = await escolherSlug(this.deps.noticias, dados.titulo, entrada.slug);
    const n = await this.deps.noticias.criar(
      { ...dados, slug },
      { adminId: entrada.ator.id, acao: 'NOTICIA_CRIADA', detalhe: { slug } },
    );
    return saida(n, this.deps.armazenamento, true);
  }
}

export class EditarNoticia {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: {
    ator: Ator;
    id: string;
    titulo: string;
    resumo: string;
    conteudo: string;
    slug?: string | undefined;
  }): Promise<NoticiaSaida> {
    exigirAdmin(entrada.ator);
    const dados = validar(entrada);
    const atual = await exigir(this.deps, entrada.id);
    // O endereço NÃO muda quando o título muda (links compartilhados continuam valendo).
    const slug =
      entrada.slug === undefined || entrada.slug === atual.slug
        ? atual.slug
        : await escolherSlug(this.deps.noticias, dados.titulo, entrada.slug, atual.id);
    const n = await this.deps.noticias.atualizar(
      atual,
      { ...dados, slug },
      { adminId: entrada.ator.id, acao: 'NOTICIA_EDITADA', detalhe: { slug } },
    );
    return saida(n, this.deps.armazenamento, true);
  }
}

export class PublicarNoticia {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; publicado: boolean }): Promise<void> {
    exigirAdmin(entrada.ator);
    const n = await exigir(this.deps, entrada.id);
    if (n.publicado === entrada.publicado) return;
    await this.deps.noticias.alterarPublicacao(n, entrada.publicado, {
      adminId: entrada.ator.id,
      acao: entrada.publicado ? 'NOTICIA_PUBLICADA' : 'NOTICIA_DESPUBLICADA',
    });
  }
}

export class DefinirCapaNoticia {
  constructor(private readonly deps: Deps) {}

  /** `arquivo` = null remove a capa. */
  async executar(entrada: {
    ator: Ator;
    id: string;
    arquivo: Buffer | null;
  }): Promise<NoticiaSaida> {
    exigirAdmin(entrada.ator);
    const n = await exigir(this.deps, entrada.id);
    let chave: string | null = null;
    if (entrada.arquivo) {
      const [img] = await prepararImagens([entrada.arquivo], this.deps.imagens);
      if (!img) throw erroValidacao('FOTO_OBRIGATORIA', 'Envie a imagem de capa', 'imagem');
      chave = `noticias/${(this.deps.gerarId ?? randomUUID)()}.${img.extensao}`;
      await this.deps.armazenamento.enviar(chave, img.conteudo, img.tipoConteudo);
    }
    try {
      await this.deps.noticias.definirImagem(n, chave);
    } catch (erro) {
      if (chave) await removerSemFalhar(this.deps.armazenamento, [chave]);
      throw erro;
    }
    // A capa antiga sai do bucket depois do commit.
    if (n.imagemChave) await removerSemFalhar(this.deps.armazenamento, [n.imagemChave]);
    return saida({ ...n, imagemChave: chave }, this.deps.armazenamento, true);
  }
}

export class RemoverNoticia {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const n = await exigir(this.deps, entrada.id);
    await this.deps.noticias.remover(n, {
      adminId: entrada.ator.id,
      acao: 'NOTICIA_REMOVIDA',
      detalhe: { slug: n.slug, titulo: n.titulo },
    });
    if (n.imagemChave) await removerSemFalhar(this.deps.armazenamento, [n.imagemChave]);
  }
}
