/**
 * Feed da ONG: posts com carrossel de fotos e curtidas. Só a equipe (ADMIN)
 * publica; o público vê apenas os publicados.
 */
import { randomUUID } from 'node:crypto';

import { UPLOAD_IMAGENS } from '@abraco/shared';

import {
  removerSemFalhar,
  type ArmazenamentoObjetos,
} from '../../../shared/aplicacao/armazenamento.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { prepararImagens, type ProcessadorImagens } from '../../../shared/aplicacao/imagens.js';
import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import { fotoSaida } from '../../animais/application/apresentacao.js';
import type { FotoRegistro } from '../../animais/application/portas.js';

export const LEGENDA_MAX = 2200;

export function validarLegenda(texto: string): string {
  const limpo = texto.trim();
  if (limpo.length === 0)
    throw erroValidacao('CAMPO_OBRIGATORIO', 'Escreva uma legenda', 'legenda');
  if (limpo.length > LEGENDA_MAX) {
    throw erroValidacao(
      'CAMPO_MUITO_LONGO',
      `A legenda pode ter até ${String(LEGENDA_MAX)} caracteres`,
      'legenda',
    );
  }
  return limpo;
}

// ── Portas ───────────────────────────────────────────────────────────────

export interface PostRegistro {
  readonly id: number;
  readonly publicId: string;
  readonly legenda: string;
  readonly publicado: boolean;
  readonly criadoEm: Date;
  /** Em ordem crescente de `ordem`. */
  readonly imagens: readonly FotoRegistro[];
  readonly totalCurtidas: number;
  /** Curtido pelo usuário da consulta (false para anônimo). */
  readonly curtidoPorMim: boolean;
}

export interface CursorPosts {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export interface RepositorioPosts {
  criar(
    d: { legenda: string; chaves: readonly string[] },
    a: EntradaAuditoria,
  ): Promise<PostRegistro>;
  /** `usuarioId` (publicId) só serve para calcular `curtidoPorMim`. */
  buscar(publicId: string, usuarioId?: string): Promise<PostRegistro | null>;
  listar(
    filtro: { somentePublicados: boolean },
    usuarioId: string | undefined,
    cursor: CursorPosts | undefined,
    limite: number,
  ): Promise<PostRegistro[]>;
  editarLegenda(post: PostRegistro, legenda: string, a: EntradaAuditoria): Promise<void>;
  alterarPublicacao(post: PostRegistro, publicado: boolean, a: EntradaAuditoria): Promise<void>;
  remover(post: PostRegistro, a: EntradaAuditoria): Promise<void>;
  /** Idempotentes (UNIQUE post+usuário). */
  curtir(post: PostRegistro, usuarioId: string): Promise<void>;
  descurtir(post: PostRegistro, usuarioId: string): Promise<void>;
}

interface Deps {
  readonly posts: RepositorioPosts;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly imagens: ProcessadorImagens;
  readonly gerarId?: () => string;
}

// ── Saída ────────────────────────────────────────────────────────────────

async function saida(p: PostRegistro, armazenamento: ArmazenamentoObjetos, comStatus: boolean) {
  return {
    id: p.publicId,
    legenda: p.legenda,
    imagens: await Promise.all(p.imagens.map((f) => fotoSaida(f, armazenamento))),
    totalCurtidas: p.totalCurtidas,
    curtidoPorMim: p.curtidoPorMim,
    // `publicado` só faz sentido para a equipe.
    ...(comStatus ? { publicado: p.publicado } : {}),
    criadoEm: p.criadoEm,
  };
}

export type PostSaida = Awaited<ReturnType<typeof saida>>;

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', 'POST_NAO_ENCONTRADO', 'Post não encontrado');

export const LIMITE_PAGINA_POSTS = { padrao: 10, maximo: 30 } as const;

async function pagina(
  deps: Deps,
  filtro: { somentePublicados: boolean },
  usuarioId: string | undefined,
  cursor: CursorPosts | undefined,
  limite: number | undefined,
) {
  const n = Math.min(
    Math.max(Math.trunc(limite ?? LIMITE_PAGINA_POSTS.padrao), 1),
    LIMITE_PAGINA_POSTS.maximo,
  );
  const registros = await deps.posts.listar(filtro, usuarioId, cursor, n + 1);
  const itens = registros.slice(0, n);
  const ultimo = itens.at(-1);
  return {
    itens: await Promise.all(
      itens.map((p) => saida(p, deps.armazenamento, !filtro.somentePublicados)),
    ),
    proximoCursor:
      registros.length > n && ultimo
        ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
        : null,
  };
}

/** Post publicado para o público; a equipe enxerga também os rascunhos. */
async function exigirVisivel(deps: Deps, id: string, ator: Ator | undefined) {
  const p = await deps.posts.buscar(id, ator?.id);
  if (!p || (!p.publicado && ator?.role !== 'ADMIN')) throw naoEncontrado();
  return p;
}

// ── Público ──────────────────────────────────────────────────────────────

export class ListarPosts {
  constructor(private readonly deps: Deps) {}
  executar(entrada: { ator?: Ator; cursor?: CursorPosts; limite?: number }) {
    return pagina(
      this.deps,
      { somentePublicados: true },
      entrada.ator?.id,
      entrada.cursor,
      entrada.limite,
    );
  }
}

export class ObterPost {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator?: Ator; id: string }): Promise<PostSaida> {
    const p = await exigirVisivel(this.deps, entrada.id, entrada.ator);
    return saida(p, this.deps.armazenamento, entrada.ator?.role === 'ADMIN');
  }
}

export class Curtir {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; curtir: boolean }): Promise<void> {
    // Só posts publicados recebem curtida (rascunho não "existe" para o público).
    const p = await this.deps.posts.buscar(entrada.id);
    if (!p?.publicado) throw naoEncontrado();
    if (entrada.curtir) await this.deps.posts.curtir(p, entrada.ator.id);
    else await this.deps.posts.descurtir(p, entrada.ator.id);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

export class AdminListarPosts {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; cursor?: CursorPosts; limite?: number }) {
    exigirAdmin(entrada.ator);
    return pagina(
      this.deps,
      { somentePublicados: false },
      entrada.ator.id,
      entrada.cursor,
      entrada.limite,
    );
  }
}

export class CriarPost {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    legenda: string;
    arquivos: readonly Buffer[];
  }): Promise<PostSaida> {
    exigirAdmin(entrada.ator);
    const legenda = validarLegenda(entrada.legenda);
    if (entrada.arquivos.length === 0) {
      throw erroValidacao('FOTO_OBRIGATORIA', 'Envie ao menos uma imagem', 'imagens');
    }
    if (entrada.arquivos.length > UPLOAD_IMAGENS.arquivosPorEnvio) {
      throw erroValidacao('LIMITE_FOTOS', 'Envie no máximo 10 imagens', 'imagens');
    }
    const imagens = await prepararImagens(entrada.arquivos, this.deps.imagens);
    const gerarId = this.deps.gerarId ?? randomUUID;
    const chaves = imagens.map((i) => `posts/${gerarId()}.${i.extensao}`);
    try {
      await Promise.all(
        imagens.map((img, i) =>
          this.deps.armazenamento.enviar(chaves[i] ?? '', img.conteudo, img.tipoConteudo),
        ),
      );
      const post = await this.deps.posts.criar(
        { legenda, chaves },
        { adminId: entrada.ator.id, acao: 'POST_CRIADO', detalhe: { imagens: chaves.length } },
      );
      return await saida(post, this.deps.armazenamento, true);
    } catch (erro) {
      await removerSemFalhar(this.deps.armazenamento, chaves);
      throw erro;
    }
  }
}

export class EditarPost {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; legenda: string }): Promise<PostSaida> {
    exigirAdmin(entrada.ator);
    const legenda = validarLegenda(entrada.legenda);
    const p = await this.deps.posts.buscar(entrada.id, entrada.ator.id);
    if (!p) throw naoEncontrado();
    await this.deps.posts.editarLegenda(p, legenda, {
      adminId: entrada.ator.id,
      acao: 'POST_EDITADO',
    });
    return saida({ ...p, legenda }, this.deps.armazenamento, true);
  }
}

export class PublicarPost {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; publicado: boolean }): Promise<void> {
    exigirAdmin(entrada.ator);
    const p = await this.deps.posts.buscar(entrada.id);
    if (!p) throw naoEncontrado();
    if (p.publicado === entrada.publicado) return;
    await this.deps.posts.alterarPublicacao(p, entrada.publicado, {
      adminId: entrada.ator.id,
      acao: entrada.publicado ? 'POST_PUBLICADO' : 'POST_DESPUBLICADO',
    });
  }
}

export class RemoverPost {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const p = await this.deps.posts.buscar(entrada.id);
    if (!p) throw naoEncontrado();
    await this.deps.posts.remover(p, {
      adminId: entrada.ator.id,
      acao: 'POST_REMOVIDO',
      detalhe: { legenda: p.legenda.slice(0, 120) },
    });
    // Depois do commit: falha no bucket só deixa objeto órfão (invisível).
    await removerSemFalhar(
      this.deps.armazenamento,
      p.imagens.map((i) => i.chave),
    );
  }
}
