import type { StatusConversa } from '@abraco/shared';

import { Prisma as PrismaRuntime } from '../../../generated/prisma/client.js';
import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type {
  ConversaRegistro,
  ConversaResumo,
  CursorConversas,
  MensagemRegistro,
  RepositorioChat,
} from '../application/casos-de-uso.js';

const CAMPOS_CONVERSA = {
  id: true,
  publicId: true,
  status: true,
  assunto: true,
  criadoEm: true,
  atualizadoEm: true,
  usuarioId: true,
  usuario: { select: { publicId: true, nome: true } },
  admin: { select: { nome: true } },
} as const satisfies PrismaGerado.ConversaSelect;

const CAMPOS_MENSAGEM = {
  id: true,
  publicId: true,
  conteudo: true,
  autorId: true,
  lida: true,
  lidaEm: true,
  criadoEm: true,
} as const satisfies PrismaGerado.MensagemSelect;

type LinhaConversa = PrismaGerado.ConversaGetPayload<{ select: typeof CAMPOS_CONVERSA }>;
type LinhaMensagem = PrismaGerado.MensagemGetPayload<{ select: typeof CAMPOS_MENSAGEM }>;

const conversa = (l: LinhaConversa): ConversaRegistro => ({
  id: l.id,
  publicId: l.publicId,
  status: l.status,
  assunto: l.assunto,
  usuarioId: l.usuario.publicId,
  usuarioNome: l.usuario.nome,
  atendenteNome: l.admin?.nome ?? null,
  criadoEm: l.criadoEm,
  atualizadoEm: l.atualizadoEm,
});

/** Quem não é o dono da conversa é a equipe. */
const mensagem = (m: LinhaMensagem, donoId: number): MensagemRegistro => ({
  id: m.id,
  publicId: m.publicId,
  conteudo: m.conteudo,
  autorEhEquipe: m.autorId !== donoId,
  lida: m.lida,
  lidaEm: m.lidaEm,
  criadoEm: m.criadoEm,
});

async function idUsuario(
  tx: PrismaGerado.TransactionClient | Prisma,
  publicId: string,
): Promise<number> {
  return (await tx.usuario.findUniqueOrThrow({ where: { publicId }, select: { id: true } })).id;
}

const encerrada = () =>
  new ErroDominio('CONFLITO', 'CONVERSA_ENCERRADA', 'Esta conversa foi encerrada. Abra uma nova.');

export class PrismaRepositorioChat implements RepositorioChat {
  constructor(private readonly prisma: Prisma) {}

  /** Não lidas por conversa, do lado que consulta (o OUTRO lado escreveu). */
  private async naoLidas(
    ids: readonly number[],
    paraEquipe: boolean,
  ): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const autor = paraEquipe
      ? PrismaRuntime.sql`m."autorId" = c."usuarioId"`
      : PrismaRuntime.sql`m."autorId" <> c."usuarioId"`;
    const linhas = await this.prisma.$queryRaw<{ conversaId: number; total: bigint }[]>`
      SELECT m."conversaId" AS "conversaId", COUNT(*) AS total
      FROM mensagens m JOIN conversas c ON c.id = m."conversaId"
      WHERE m."conversaId" IN (${PrismaRuntime.join([...ids])}) AND m.lida = false AND ${autor}
      GROUP BY m."conversaId"`;
    return new Map(linhas.map((l) => [l.conversaId, Number(l.total)]));
  }

  private async resumos(
    linhas: (LinhaConversa & { mensagens: LinhaMensagem[] })[],
    paraEquipe: boolean,
  ) {
    const naoLidas = await this.naoLidas(
      linhas.map((l) => l.id),
      paraEquipe,
    );
    return linhas.map((l): ConversaResumo => ({
      ...conversa(l),
      ultimaMensagem: l.mensagens[0] ? mensagem(l.mensagens[0], l.usuarioId) : null,
      naoLidas: naoLidas.get(l.id) ?? 0,
    }));
  }

  async abrir(d: { usuarioId: string; assunto: string | null; mensagem: string }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const usuarioId = await idUsuario(tx, d.usuarioId);
        const c = await tx.conversa.create({
          data: { usuarioId, assunto: d.assunto },
          select: CAMPOS_CONVERSA,
        });
        const m = await tx.mensagem.create({
          data: { conversaId: c.id, autorId: usuarioId, conteudo: d.mensagem },
          select: CAMPOS_MENSAGEM,
        });
        return { conversa: conversa(c), mensagem: mensagem(m, usuarioId) };
      });
    } catch (erro) {
      // Índice único parcial conversas_aberta_unica.
      if (violouUnicidade(erro)) {
        throw new ErroDominio(
          'CONFLITO',
          'CONVERSA_ABERTA_EXISTENTE',
          'Você já tem uma conversa aberta com a ONG. Continue por ela.',
        );
      }
      throw erro;
    }
  }

  async buscar(publicId: string): Promise<ConversaRegistro | null> {
    const l = await this.prisma.conversa.findUnique({
      where: { publicId },
      select: CAMPOS_CONVERSA,
    });
    return l ? conversa(l) : null;
  }

  async listarDoUsuario(usuarioId: string): Promise<ConversaResumo[]> {
    const linhas = await this.prisma.conversa.findMany({
      where: { usuario: { publicId: usuarioId } },
      orderBy: { atualizadoEm: 'desc' },
      take: 50,
      select: {
        ...CAMPOS_CONVERSA,
        mensagens: { select: CAMPOS_MENSAGEM, orderBy: { criadoEm: 'desc' }, take: 1 },
      },
    });
    return this.resumos(linhas, false);
  }

  async listarParaEquipe(
    filtro: { status?: StatusConversa },
    cursor: CursorConversas | undefined,
    limite: number,
  ): Promise<ConversaResumo[]> {
    const linhas = await this.prisma.conversa.findMany({
      where: {
        ...(filtro.status ? { status: filtro.status } : {}),
        ...(cursor
          ? {
              OR: [
                { atualizadoEm: { lt: cursor.data } },
                { atualizadoEm: cursor.data, publicId: { lt: cursor.publicId } },
              ],
            }
          : {}),
      },
      orderBy: [{ atualizadoEm: 'desc' }, { publicId: 'desc' }],
      take: limite,
      select: {
        ...CAMPOS_CONVERSA,
        mensagens: { select: CAMPOS_MENSAGEM, orderBy: { criadoEm: 'desc' }, take: 1 },
      },
    });
    return this.resumos(linhas, true);
  }

  async listarMensagens(
    c: ConversaRegistro,
    cursor: CursorConversas | undefined,
    limite: number,
  ): Promise<MensagemRegistro[]> {
    const { usuarioId } = await this.prisma.conversa.findUniqueOrThrow({
      where: { id: c.id },
      select: { usuarioId: true },
    });
    const linhas = await this.prisma.mensagem.findMany({
      where: {
        conversaId: c.id,
        ...(cursor
          ? {
              OR: [
                { criadoEm: { lt: cursor.data } },
                { criadoEm: cursor.data, publicId: { lt: cursor.publicId } },
              ],
            }
          : {}),
      },
      orderBy: [{ criadoEm: 'desc' }, { publicId: 'desc' }],
      take: limite,
      select: CAMPOS_MENSAGEM,
    });
    return linhas.map((m) => mensagem(m, usuarioId));
  }

  async enviar(
    c: ConversaRegistro,
    d: { autorId: string; conteudo: string; daEquipe: boolean; notificacao: ConteudoNotificacao },
  ): Promise<MensagemRegistro> {
    return this.prisma.$transaction(async (tx) => {
      // Condicional: encerrada no meio do caminho → nada é gravado.
      const r = await tx.conversa.updateMany({
        where: { id: c.id, status: 'ABERTA' },
        data: { atualizadoEm: new Date() },
      });
      if (r.count === 0) throw encerrada();
      const autorId = await idUsuario(tx, d.autorId);
      const { usuarioId: donoId } = await tx.conversa.findUniqueOrThrow({
        where: { id: c.id },
        select: { usuarioId: true },
      });

      if (d.daEquipe) {
        // Primeira resposta da equipe assume a conversa.
        await tx.conversa.updateMany({
          where: { id: c.id, adminId: null },
          data: { adminId: autorId },
        });
        // Uma notificação NÃO LIDA por conversa: novas respostas não lotam o sino.
        const pendente = await tx.notificacao.count({
          where: {
            usuarioId: donoId,
            tipo: 'CHAT_NOVA_MENSAGEM',
            entidadeId: c.publicId,
            lidaEm: null,
          },
        });
        if (pendente === 0) {
          await tx.notificacao.create({
            data: {
              usuarioId: donoId,
              entidadeId: c.publicId,
              tipo: d.notificacao.tipo,
              titulo: d.notificacao.titulo,
              corpo: d.notificacao.corpo,
            },
          });
        }
      }

      const m = await tx.mensagem.create({
        data: { conversaId: c.id, autorId, conteudo: d.conteudo },
        select: CAMPOS_MENSAGEM,
      });
      return mensagem(m, donoId);
    });
  }

  async marcarLidas(
    c: ConversaRegistro,
    d: { leitorEhEquipe: boolean; ateMensagemId: string; em: Date },
  ): Promise<number> {
    const limite = await this.prisma.mensagem.findFirst({
      where: { publicId: d.ateMensagemId, conversaId: c.id },
      select: { criadoEm: true },
    });
    if (!limite) return 0;
    const { usuarioId: donoId } = await this.prisma.conversa.findUniqueOrThrow({
      where: { id: c.id },
      select: { usuarioId: true },
    });
    const r = await this.prisma.mensagem.updateMany({
      where: {
        conversaId: c.id,
        lida: false,
        criadoEm: { lte: limite.criadoEm },
        // Quem lê marca as mensagens do OUTRO lado.
        autorId: d.leitorEhEquipe ? donoId : { not: donoId },
      },
      data: { lida: true, lidaEm: d.em },
    });
    return r.count;
  }

  async assumir(c: ConversaRegistro, adminId: string, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.conversa.update({
        where: { id: c.id },
        data: { adminId: await idUsuario(tx, adminId) },
      });
      await gravarAuditoria(tx, 'Conversa', c.publicId, a);
    });
  }

  async encerrar(c: ConversaRegistro, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.conversa.updateMany({
        where: { id: c.id, status: 'ABERTA' },
        data: { status: 'ENCERRADA' },
      });
      if (r.count > 0) await gravarAuditoria(tx, 'Conversa', c.publicId, a);
    });
  }
}
