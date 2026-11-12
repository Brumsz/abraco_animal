import type { Prisma } from '../../../shared/infra/prisma.js';
import type {
  NovoRefresh,
  RefreshArmazenado,
  RepositorioRecuperacao,
  RepositorioSessoes,
  Sessao,
} from '../application/portas.js';

const paraSessao = (s: {
  id: number;
  sid: string;
  usuarioId: number;
  deviceId: string;
  revogadaEm: Date | null;
}): Sessao => ({
  id: s.id,
  sid: s.sid,
  usuarioId: s.usuarioId,
  deviceId: s.deviceId,
  revogada: s.revogadaEm !== null,
});

export class PrismaRepositorioSessoes implements RepositorioSessoes {
  constructor(private readonly prisma: Prisma) {}

  async criarSessao(usuarioId: number, deviceId: string) {
    return paraSessao(await this.prisma.sessao.create({ data: { usuarioId, deviceId } }));
  }

  async buscarSessaoPorSid(sid: string) {
    const s = await this.prisma.sessao.findUnique({ where: { sid } });
    return s ? paraSessao(s) : null;
  }

  async salvarRefresh(dados: NovoRefresh) {
    await this.prisma.refreshToken.create({ data: dados });
  }

  async buscarRefreshPorHash(tokenHash: string): Promise<RefreshArmazenado | null> {
    const r = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { sessao: true },
    });
    if (!r) return null;
    return {
      id: r.id,
      familiaId: r.familiaId,
      expiraEm: r.expiraEm,
      usado: r.usadoEm !== null,
      revogado: r.revogadoEm !== null,
      sessao: paraSessao(r.sessao),
    };
  }

  async rotacionar(antigoId: number, novo: NovoRefresh): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // UPDATE condicional: só um dos concorrentes consegue marcar o token como usado.
      const marcado = await tx.refreshToken.updateMany({
        where: { id: antigoId, usadoEm: null, revogadoEm: null },
        data: { usadoEm: new Date() },
      });
      if (marcado.count === 0) return false;
      const criado = await tx.refreshToken.create({ data: novo });
      await tx.refreshToken.update({
        where: { id: antigoId },
        data: { substituidoPorId: criado.id },
      });
      await tx.sessao.update({ where: { id: novo.sessaoId }, data: { ultimoUso: new Date() } });
      return true;
    });
  }

  async revogarFamilia(familiaId: string, sessaoId: number) {
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { familiaId, revogadoEm: null },
        data: { revogadoEm: agora },
      }),
      this.prisma.sessao.updateMany({
        where: { id: sessaoId, revogadaEm: null },
        data: { revogadaEm: agora },
      }),
    ]);
  }

  async revogarSessao(sid: string) {
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { sessao: { sid }, revogadoEm: null },
        data: { revogadoEm: agora },
      }),
      this.prisma.sessao.updateMany({
        where: { sid, revogadaEm: null },
        data: { revogadaEm: agora },
      }),
    ]);
  }

  async revogarTodasDoUsuario(usuarioId: number) {
    const ativas = await this.prisma.sessao.findMany({
      where: { usuarioId, revogadaEm: null },
      select: { sid: true },
    });
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { sessao: { usuarioId }, revogadoEm: null },
        data: { revogadoEm: agora },
      }),
      this.prisma.sessao.updateMany({
        where: { usuarioId, revogadaEm: null },
        data: { revogadaEm: agora },
      }),
    ]);
    return ativas.map((s) => s.sid);
  }
}

export class PrismaRepositorioRecuperacao implements RepositorioRecuperacao {
  constructor(private readonly prisma: Prisma) {}

  async criar(usuarioId: number, codigoHash: string, expiraEm: Date) {
    await this.prisma.$transaction([
      this.prisma.recuperacaoSenha.updateMany({
        where: { usuarioId, usadoEm: null },
        data: { usadoEm: new Date() },
      }),
      this.prisma.recuperacaoSenha.create({ data: { usuarioId, codigoHash, expiraEm } }),
    ]);
  }

  async buscarAtiva(usuarioId: number, agora: Date) {
    return this.prisma.recuperacaoSenha.findFirst({
      where: { usuarioId, usadoEm: null, expiraEm: { gt: agora } },
      orderBy: { criadoEm: 'desc' },
      select: { id: true, usuarioId: true, codigoHash: true, tentativas: true, expiraEm: true },
    });
  }

  async incrementarTentativas(id: number) {
    const r = await this.prisma.recuperacaoSenha.update({
      where: { id },
      data: { tentativas: { increment: 1 } },
      select: { tentativas: true },
    });
    return r.tentativas;
  }

  async marcarUsada(id: number, agora: Date) {
    await this.prisma.recuperacaoSenha.updateMany({
      where: { id, usadoEm: null },
      data: { usadoEm: agora },
    });
  }
}
