import type { Prisma } from '../../../shared/infra/prisma.js';
import type {
  CursorNotificacoes,
  NotificacaoRegistro,
  RepositorioNotificacoes,
} from '../application/casos-de-uso.js';

const CAMPOS = {
  publicId: true,
  tipo: true,
  titulo: true,
  corpo: true,
  entidadeId: true,
  lidaEm: true,
  criadoEm: true,
} as const;

/** O dono é sempre filtrado pelo publicId do token: IDOR impossível por construção. */
export class PrismaRepositorioNotificacoes implements RepositorioNotificacoes {
  constructor(private readonly prisma: Prisma) {}

  listar(
    usuarioId: string,
    cursor: CursorNotificacoes | undefined,
    limite: number,
  ): Promise<NotificacaoRegistro[]> {
    return this.prisma.notificacao.findMany({
      where: {
        usuario: { publicId: usuarioId },
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
  }

  contarNaoLidas(usuarioId: string): Promise<number> {
    return this.prisma.notificacao.count({
      where: { usuario: { publicId: usuarioId }, lidaEm: null },
    });
  }

  async marcarLida(usuarioId: string, id: string, em: Date): Promise<boolean> {
    const existe = await this.prisma.notificacao.count({
      where: { publicId: id, usuario: { publicId: usuarioId } },
    });
    if (existe === 0) return false;
    // Idempotente: a data da primeira leitura é preservada.
    await this.prisma.notificacao.updateMany({
      where: { publicId: id, usuario: { publicId: usuarioId }, lidaEm: null },
      data: { lidaEm: em },
    });
    return true;
  }

  async marcarTodasLidas(usuarioId: string, em: Date): Promise<void> {
    await this.prisma.notificacao.updateMany({
      where: { usuario: { publicId: usuarioId }, lidaEm: null },
      data: { lidaEm: em },
    });
  }
}
