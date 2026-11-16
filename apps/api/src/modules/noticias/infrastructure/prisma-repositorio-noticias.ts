import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type {
  CursorNoticias,
  DadosNoticia,
  NoticiaRegistro,
  RepositorioNoticias,
} from '../application/casos-de-uso.js';

const CAMPOS = {
  id: true,
  publicId: true,
  slug: true,
  titulo: true,
  resumo: true,
  conteudo: true,
  imagem: true,
  publicado: true,
  criadoEm: true,
  atualizadoEm: true,
} as const satisfies PrismaGerado.NoticiaSelect;

type Linha = PrismaGerado.NoticiaGetPayload<{ select: typeof CAMPOS }>;

const registro = ({ imagem, ...n }: Linha): NoticiaRegistro => ({ ...n, imagemChave: imagem });

const slugEmUso = () =>
  new ErroDominio('CONFLITO', 'SLUG_EM_USO', 'Já existe uma notícia com este endereço', 'slug');

async function comSlugUnico<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (erro) {
    if (violouUnicidade(erro)) throw slugEmUso();
    throw erro;
  }
}

export class PrismaRepositorioNoticias implements RepositorioNoticias {
  constructor(private readonly prisma: Prisma) {}

  async slugEmUso(slug: string, excetoId?: number): Promise<boolean> {
    const n = await this.prisma.noticia.count({
      where: { slug, ...(excetoId !== undefined ? { id: { not: excetoId } } : {}) },
    });
    return n > 0;
  }

  criar(d: DadosNoticia & { slug: string }, a: EntradaAuditoria): Promise<NoticiaRegistro> {
    return comSlugUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const l = await tx.noticia.create({ data: d, select: CAMPOS });
        await gravarAuditoria(tx, 'Noticia', l.publicId, a);
        return registro(l);
      }),
    );
  }

  async buscar(publicId: string): Promise<NoticiaRegistro | null> {
    const l = await this.prisma.noticia.findUnique({ where: { publicId }, select: CAMPOS });
    return l ? registro(l) : null;
  }

  async buscarPorSlug(slug: string): Promise<NoticiaRegistro | null> {
    const l = await this.prisma.noticia.findUnique({ where: { slug }, select: CAMPOS });
    return l ? registro(l) : null;
  }

  async listar(
    filtro: { publicado?: boolean },
    cursor: CursorNoticias | undefined,
    limite: number,
  ): Promise<NoticiaRegistro[]> {
    const linhas = await this.prisma.noticia.findMany({
      where: {
        ...(filtro.publicado === undefined ? {} : { publicado: filtro.publicado }),
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
      select: CAMPOS,
    });
    return linhas.map(registro);
  }

  atualizar(
    n: NoticiaRegistro,
    d: DadosNoticia & { slug: string },
    a: EntradaAuditoria,
  ): Promise<NoticiaRegistro> {
    return comSlugUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const l = await tx.noticia.update({ where: { id: n.id }, data: d, select: CAMPOS });
        await gravarAuditoria(tx, 'Noticia', l.publicId, a);
        return registro(l);
      }),
    );
  }

  async alterarPublicacao(
    n: NoticiaRegistro,
    publicado: boolean,
    a: EntradaAuditoria,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.noticia.update({ where: { id: n.id }, data: { publicado } });
      await gravarAuditoria(tx, 'Noticia', n.publicId, a);
    });
  }

  async definirImagem(n: NoticiaRegistro, chave: string | null): Promise<void> {
    await this.prisma.noticia.update({ where: { id: n.id }, data: { imagem: chave } });
  }

  async remover(n: NoticiaRegistro, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.noticia.deleteMany({ where: { id: n.id } });
      await gravarAuditoria(tx, 'Noticia', n.publicId, a);
    });
  }
}
