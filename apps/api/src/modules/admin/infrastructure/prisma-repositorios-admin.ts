import type { Role } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import type { Prisma } from '../../../shared/infra/prisma.js';
import { escaparLike } from '../../animais/infrastructure/prisma-repositorio-animais.js';
import type {
  AuditoriaRegistro,
  CursorPainel,
  FiltroAuditoria,
  Pendencia,
  RepositorioAuditoria,
  RepositorioPainel,
  RepositorioUsuariosAdmin,
  UsuarioAdminRegistro,
} from '../application/casos-de-uso.js';

const depoisDoCursor = (cursor: CursorPainel | undefined) =>
  cursor
    ? {
        OR: [
          { criadoEm: { lt: cursor.criadoEm } },
          { criadoEm: cursor.criadoEm, publicId: { lt: cursor.publicId } },
        ],
      }
    : {};

export class PrismaRepositorioPainel implements RepositorioPainel {
  constructor(private readonly prisma: Prisma) {}

  async contar(mes: { inicio: Date; fim: Date }) {
    const [adocoesPendentes, doacoesAnimaisPendentes, animaisDisponiveis, doacoes] =
      await Promise.all([
        this.prisma.adocao.count({ where: { status: 'PENDENTE', removidoEm: null } }),
        this.prisma.doacaoAnimal.count({ where: { status: 'PENDENTE' } }),
        this.prisma.animal.count({ where: { status: 'DISPONIVEL', removidoEm: null } }),
        // Doações do mês = CONFIRMADAS com pagamento dentro do mês (fuso de São Paulo).
        this.prisma.doacaoFinanceira.aggregate({
          where: { status: 'CONFIRMADA', paidAt: { gte: mes.inicio, lt: mes.fim } },
          _count: { _all: true },
          _sum: { valor: true },
        }),
      ]);
    const total = doacoes._sum.valor;
    return {
      adocoesPendentes,
      doacoesAnimaisPendentes,
      animaisDisponiveis,
      doacoesMes: {
        quantidade: doacoes._count._all,
        // Decimal → "1250.50" → centavos, sem passar por ponto flutuante.
        totalCentavos: total ? Number(total.toFixed(2).replace('.', '')) : 0,
      },
    };
  }

  async adocoesAprovadasPorMes(desde: Date): Promise<{ mes: string; total: number }[]> {
    const linhas = await this.prisma.$queryRaw<{ mes: string; total: bigint }[]>`
      SELECT to_char(date_trunc('month', "analisadoEm" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
             COUNT(*) AS total
      FROM adocoes
      WHERE status = 'APROVADA' AND "removidoEm" IS NULL AND "analisadoEm" >= ${desde}
      GROUP BY 1`;
    return linhas.map((l) => ({ mes: l.mes, total: Number(l.total) }));
  }

  async pendenciasRecentes(limite: number): Promise<Pendencia[]> {
    // Títulos sem dado pessoal: o painel pode ficar aberto numa tela compartilhada.
    const [adocoes, doacoes, candidaturas] = await Promise.all([
      this.prisma.adocao.findMany({
        where: { status: 'PENDENTE', removidoEm: null },
        orderBy: { criadoEm: 'desc' },
        take: limite,
        select: { publicId: true, criadoEm: true, animal: { select: { nome: true } } },
      }),
      this.prisma.doacaoAnimal.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { criadoEm: 'desc' },
        take: limite,
        select: { publicId: true, criadoEm: true, nomeAnimal: true },
      }),
      this.prisma.voluntario.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { criadoEm: 'desc' },
        take: limite,
        select: { publicId: true, criadoEm: true },
      }),
    ]);
    return [
      ...adocoes.map((a) => ({
        tipo: 'ADOCAO' as const,
        id: a.publicId,
        titulo: `Adoção de ${a.animal.nome}`,
        criadoEm: a.criadoEm,
      })),
      ...doacoes.map((d) => ({
        tipo: 'DOACAO_ANIMAL' as const,
        id: d.publicId,
        titulo: `Doação de animal: ${d.nomeAnimal}`,
        criadoEm: d.criadoEm,
      })),
      ...candidaturas.map((c) => ({
        tipo: 'CANDIDATURA_VOLUNTARIO' as const,
        id: c.publicId,
        titulo: 'Candidatura de voluntariado',
        criadoEm: c.criadoEm,
      })),
    ];
  }
}

const CAMPOS_USUARIO = {
  id: true,
  publicId: true,
  nome: true,
  email: true,
  telefone: true,
  role: true,
  ativo: true,
  cidade: true,
  uf: true,
  criadoEm: true,
} as const;

export class PrismaRepositorioUsuariosAdmin implements RepositorioUsuariosAdmin {
  constructor(private readonly prisma: Prisma) {}

  listar(
    filtro: { role?: Role; q?: string },
    cursor: CursorPainel | undefined,
    limite: number,
  ): Promise<UsuarioAdminRegistro[]> {
    const q = filtro.q ? escaparLike(filtro.q) : undefined;
    return this.prisma.usuario.findMany({
      where: {
        removidoEm: null,
        ...(filtro.role ? { role: filtro.role } : {}),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { nome: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
        ...depoisDoCursor(cursor),
      },
      orderBy: [{ criadoEm: 'desc' }, { publicId: 'desc' }],
      take: limite,
      select: CAMPOS_USUARIO,
    });
  }

  buscar(publicId: string): Promise<UsuarioAdminRegistro | null> {
    return this.prisma.usuario.findFirst({
      where: { publicId, removidoEm: null },
      select: CAMPOS_USUARIO,
    });
  }

  async alterarAtivo(u: UsuarioAdminRegistro, ativo: boolean, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Condicional em `role`: mesmo numa corrida, uma conta ADMIN nunca é desativada por aqui.
      await tx.usuario.updateMany({ where: { id: u.id, role: { not: 'ADMIN' } }, data: { ativo } });
      await gravarAuditoria(tx, 'Usuario', u.publicId, a);
    });
  }

  async alterarRole(
    u: UsuarioAdminRegistro,
    role: 'USUARIO' | 'VOLUNTARIO',
    a: EntradaAuditoria,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.updateMany({ where: { id: u.id, role: { not: 'ADMIN' } }, data: { role } });
      await gravarAuditoria(tx, 'Usuario', u.publicId, a);
    });
  }
}

export class PrismaRepositorioAuditoria implements RepositorioAuditoria {
  constructor(private readonly prisma: Prisma) {}

  async listar(
    filtro: FiltroAuditoria,
    cursor: CursorPainel | undefined,
    limite: number,
  ): Promise<AuditoriaRegistro[]> {
    const linhas = await this.prisma.auditLog.findMany({
      where: {
        ...(filtro.adminId ? { admin: { publicId: filtro.adminId } } : {}),
        ...(filtro.entidade ? { entidade: filtro.entidade } : {}),
        ...(filtro.acao ? { acao: filtro.acao } : {}),
        ...(filtro.de || filtro.ate
          ? {
              criadoEm: {
                ...(filtro.de ? { gte: filtro.de } : {}),
                ...(filtro.ate ? { lt: filtro.ate } : {}),
              },
            }
          : {}),
        ...depoisDoCursor(cursor),
      },
      orderBy: [{ criadoEm: 'desc' }, { publicId: 'desc' }],
      take: limite,
      select: {
        publicId: true,
        acao: true,
        entidade: true,
        entidadeId: true,
        detalhe: true,
        criadoEm: true,
        admin: { select: { publicId: true, nome: true } },
      },
    });
    return linhas;
  }
}
