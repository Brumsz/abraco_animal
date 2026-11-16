import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import type { Prisma } from '../../../shared/infra/prisma.js';
import type { CursorPosts, PostRegistro, RepositorioPosts } from '../application/casos-de-uso.js';

/** `curtidoPorMim`: traz no máximo a curtida do próprio usuário (nunca a lista de quem curtiu). */
const campos = (usuarioId: string | undefined) =>
  ({
    id: true,
    publicId: true,
    legenda: true,
    publicado: true,
    criadoEm: true,
    imagens: { select: { publicId: true, url: true, ordem: true }, orderBy: { ordem: 'asc' } },
    _count: { select: { curtidas: true } },
    curtidas: usuarioId
      ? { where: { usuario: { publicId: usuarioId } }, select: { id: true }, take: 1 }
      : { where: { id: -1 }, select: { id: true }, take: 0 },
  }) as const satisfies PrismaGerado.PostSelect;

type Linha = PrismaGerado.PostGetPayload<{ select: ReturnType<typeof campos> }>;

const registro = (l: Linha): PostRegistro => ({
  id: l.id,
  publicId: l.publicId,
  legenda: l.legenda,
  publicado: l.publicado,
  criadoEm: l.criadoEm,
  imagens: l.imagens.map((i) => ({ publicId: i.publicId, chave: i.url, ordem: i.ordem })),
  totalCurtidas: l._count.curtidas,
  curtidoPorMim: l.curtidas.length > 0,
});

async function idUsuario(prisma: Prisma, publicId: string): Promise<number> {
  return (await prisma.usuario.findUniqueOrThrow({ where: { publicId }, select: { id: true } })).id;
}

export class PrismaRepositorioPosts implements RepositorioPosts {
  constructor(private readonly prisma: Prisma) {}

  async criar(
    d: { legenda: string; chaves: readonly string[] },
    a: EntradaAuditoria,
  ): Promise<PostRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.post.create({
        data: {
          legenda: d.legenda,
          imagens: { create: d.chaves.map((url, ordem) => ({ url, ordem })) },
        },
        select: campos(undefined),
      });
      await gravarAuditoria(tx, 'Post', l.publicId, a);
      return registro(l);
    });
  }

  async buscar(publicId: string, usuarioId?: string): Promise<PostRegistro | null> {
    const l = await this.prisma.post.findUnique({ where: { publicId }, select: campos(usuarioId) });
    return l ? registro(l) : null;
  }

  async listar(
    filtro: { somentePublicados: boolean },
    usuarioId: string | undefined,
    cursor: CursorPosts | undefined,
    limite: number,
  ): Promise<PostRegistro[]> {
    const linhas = await this.prisma.post.findMany({
      where: {
        ...(filtro.somentePublicados ? { publicado: true } : {}),
        ...(cursor
          ? {
              OR: [
                { criadoEm: { lt: cursor.criadoEm } },
                { criadoEm: cursor.criadoEm, publicId: { lt: cursor.publicId } },
              ],
            }
          : {}),
      },
      orderBy: [{ criadoEm: 'desc' }, { publicId: 'desc' }],
      take: limite,
      select: campos(usuarioId),
    });
    return linhas.map(registro);
  }

  private async escrever(
    post: PostRegistro,
    data: PrismaGerado.PostUpdateInput,
    a: EntradaAuditoria,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: post.id }, data });
      await gravarAuditoria(tx, 'Post', post.publicId, a);
    });
  }

  editarLegenda(post: PostRegistro, legenda: string, a: EntradaAuditoria) {
    return this.escrever(post, { legenda }, a);
  }

  alterarPublicacao(post: PostRegistro, publicado: boolean, a: EntradaAuditoria) {
    return this.escrever(post, { publicado }, a);
  }

  async remover(post: PostRegistro, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Imagens e curtidas saem em cascata.
      await tx.post.deleteMany({ where: { id: post.id } });
      await gravarAuditoria(tx, 'Post', post.publicId, a);
    });
  }

  async curtir(post: PostRegistro, usuarioId: string): Promise<void> {
    // skipDuplicates = ON CONFLICT DO NOTHING: toque duplo não dá erro nem conta duas vezes.
    await this.prisma.curtida.createMany({
      data: [{ postId: post.id, usuarioId: await idUsuario(this.prisma, usuarioId) }],
      skipDuplicates: true,
    });
  }

  async descurtir(post: PostRegistro, usuarioId: string): Promise<void> {
    await this.prisma.curtida.deleteMany({
      where: { postId: post.id, usuario: { publicId: usuarioId } },
    });
  }
}
