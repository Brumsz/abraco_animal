import type { TipoNotificacao } from '@abraco/shared';

import type { Prisma } from '../../../shared/infra/prisma.js';
import type {
  Aparelho,
  NotificacaoReservada,
  RepositorioPush,
} from '../application/casos-de-uso.js';

export class PrismaRepositorioPush implements RepositorioPush {
  constructor(private readonly prisma: Prisma) {}

  async registrar(usuarioPublicId: string, deviceId: string, token: string): Promise<void> {
    const u = await this.prisma.usuario.findUniqueOrThrow({
      where: { publicId: usuarioPublicId },
      select: { id: true },
    });
    await this.prisma.$transaction([
      // O token é do aparelho: se outra conta entrou nele antes, deixa de ser dela.
      this.prisma.dispositivoPush.deleteMany({
        where: { expoToken: token, NOT: { usuarioId: u.id, deviceId } },
      }),
      this.prisma.dispositivoPush.upsert({
        where: { usuarioId_deviceId: { usuarioId: u.id, deviceId } },
        create: { usuarioId: u.id, deviceId, expoToken: token },
        update: { expoToken: token },
      }),
    ]);
  }

  async remover(usuarioPublicId: string, deviceId: string): Promise<void> {
    await this.prisma.dispositivoPush.deleteMany({
      where: { usuario: { publicId: usuarioPublicId }, deviceId },
    });
  }

  /**
   * Reserva e marca numa só instrução. FOR UPDATE SKIP LOCKED: duas instâncias
   * da API nunca pegam a mesma notificação (cada uma pula as já travadas).
   */
  async reservarPendentes(limite: number, agora: Date): Promise<NotificacaoReservada[]> {
    const linhas = await this.prisma.$queryRaw<
      {
        publicId: string;
        usuarioId: number;
        tipo: TipoNotificacao;
        titulo: string;
        corpo: string;
        entidadeId: string | null;
        criadoEm: Date;
      }[]
    >`
      WITH reservadas AS (
        SELECT id FROM notificacoes
        WHERE "pushEnviadoEm" IS NULL
        ORDER BY "criadoEm"
        LIMIT ${limite}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notificacoes n SET "pushEnviadoEm" = ${agora}
      FROM reservadas r
      WHERE n.id = r.id
      RETURNING n."publicId"::text AS "publicId", n."usuarioId", n.tipo::text AS tipo,
        n.titulo, n.corpo, n."entidadeId"::text AS "entidadeId", n."criadoEm"`;
    return linhas.map(({ publicId, ...n }) => ({ id: publicId, ...n }));
  }

  /** Só aparelhos com sessão ativa (não revogada e usada desde `ativaDesde`) no mesmo deviceId. */
  aparelhosAtivos(usuarioIds: readonly number[], ativaDesde: Date): Promise<Aparelho[]> {
    if (usuarioIds.length === 0) return Promise.resolve([]);
    return this.prisma.$queryRaw<Aparelho[]>`
      SELECT d."usuarioId", d."expoToken" AS token
      FROM dispositivos_push d
      WHERE d."usuarioId" = ANY(${[...usuarioIds]}::int[])
        AND EXISTS (
          SELECT 1 FROM sessoes s
          WHERE s."usuarioId" = d."usuarioId"
            AND s."deviceId" = d."deviceId"
            AND s."revogadaEm" IS NULL
            AND s."ultimoUso" >= ${ativaDesde}
        )`;
  }

  async removerTokens(tokens: readonly string[]): Promise<void> {
    await this.prisma.dispositivoPush.deleteMany({ where: { expoToken: { in: [...tokens] } } });
  }
}
