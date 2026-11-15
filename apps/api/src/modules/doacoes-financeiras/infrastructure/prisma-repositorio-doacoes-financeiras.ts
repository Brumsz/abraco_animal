import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type {
  CursorDoacoesFinanceiras,
  DoacaoFinanceiraRegistro,
  EventoWebhook,
  NovaDoacaoFinanceira,
  RepositorioDoacoesFinanceiras,
} from '../application/portas.js';

const CAMPOS = {
  id: true,
  publicId: true,
  anonima: true,
  nomeDoador: true,
  emailDoador: true,
  valor: true,
  status: true,
  pixCopiaCola: true,
  pspTxId: true,
  idempotencyKey: true,
  expiresAt: true,
  paidAt: true,
  criadoEm: true,
  usuario: { select: { publicId: true } },
} as const satisfies PrismaGerado.DoacaoFinanceiraSelect;

type Linha = PrismaGerado.DoacaoFinanceiraGetPayload<{ select: typeof CAMPOS }>;

function registro(l: Linha): DoacaoFinanceiraRegistro {
  return {
    id: l.id,
    publicId: l.publicId,
    usuarioId: l.usuario?.publicId ?? null,
    anonima: l.anonima,
    nomeDoador: l.nomeDoador,
    emailDoador: l.emailDoador,
    // Decimal(10,2) → texto "50.00" → centavos: sem passar por ponto flutuante.
    valor: Dinheiro.deTexto(l.valor.toFixed(2)),
    status: l.status,
    pixCopiaCola: l.pixCopiaCola,
    pspTxId: l.pspTxId,
    idempotencyKey: l.idempotencyKey,
    expiraEm: l.expiresAt,
    pagoEm: l.paidAt,
    criadoEm: l.criadoEm,
  };
}

export class PrismaRepositorioDoacoesFinanceiras implements RepositorioDoacoesFinanceiras {
  constructor(private readonly prisma: Prisma) {}

  async criar(d: NovaDoacaoFinanceira): Promise<DoacaoFinanceiraRegistro> {
    try {
      const linha = await this.prisma.doacaoFinanceira.create({
        data: {
          publicId: d.publicId,
          ...(d.usuarioId ? { usuario: { connect: { publicId: d.usuarioId } } } : {}),
          anonima: d.anonima,
          nomeDoador: d.nomeDoador,
          emailDoador: d.emailDoador,
          valor: d.valor.paraTexto(),
          pixCopiaCola: d.pixCopiaCola,
          pspTxId: d.pspTxId,
          idempotencyKey: d.idempotencyKey,
          expiresAt: d.expiraEm,
        },
        select: CAMPOS,
      });
      return registro(linha);
    } catch (erro) {
      if (violouUnicidade(erro)) {
        throw new ErroDominio('CONFLITO', 'IDEMPOTENCIA_EM_USO', 'Idempotency-Key em uso');
      }
      throw erro;
    }
  }

  private async uma(where: PrismaGerado.DoacaoFinanceiraWhereUniqueInput) {
    const linha = await this.prisma.doacaoFinanceira.findUnique({ where, select: CAMPOS });
    return linha ? registro(linha) : null;
  }

  buscar(publicId: string) {
    return this.uma({ publicId });
  }

  buscarPorIdempotencia(chave: string) {
    return this.uma({ idempotencyKey: chave });
  }

  buscarPorPspTxId(pspTxId: string) {
    return this.uma({ pspTxId });
  }

  async listarDoUsuario(
    usuarioId: string,
    cursor: CursorDoacoesFinanceiras | undefined,
    limite: number,
  ): Promise<DoacaoFinanceiraRegistro[]> {
    const linhas = await this.prisma.doacaoFinanceira.findMany({
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
    return linhas.map(registro);
  }

  async marcarExpirada(doacao: DoacaoFinanceiraRegistro): Promise<void> {
    await this.prisma.doacaoFinanceira.updateMany({
      where: { id: doacao.id, status: 'PENDENTE' },
      data: { status: 'EXPIRADA' },
    });
  }

  async confirmar(
    doacao: DoacaoFinanceiraRegistro,
    d: { pagoEm: Date; evento?: EventoWebhook; notificacao: ConteudoNotificacao },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // O evento entra na MESMA transação: se a confirmação falhar, o evento não
        // fica marcado como processado e o reenvio do Asaas é aceito.
        if (d.evento) {
          await tx.webhookEvento.create({
            data: { provedor: d.evento.provedor, eventoId: d.evento.eventoId, tipo: d.evento.tipo },
          });
        }
        // EXPIRADA também confirma: pagamento depois do prazo continua sendo dinheiro recebido.
        const r = await tx.doacaoFinanceira.updateMany({
          where: { id: doacao.id, status: { in: ['PENDENTE', 'EXPIRADA'] } },
          data: { status: 'CONFIRMADA', paidAt: d.pagoEm },
        });
        if (r.count === 0) return { resultado: 'ja_confirmada' as const };

        const atual = await tx.doacaoFinanceira.findUniqueOrThrow({
          where: { id: doacao.id },
          select: {
            usuarioId: true,
            nomeDoador: true,
            emailDoador: true,
            usuario: { select: { nome: true, email: true } },
          },
        });
        if (atual.usuarioId !== null) {
          await tx.notificacao.create({
            data: {
              usuarioId: atual.usuarioId,
              entidadeId: doacao.publicId,
              tipo: d.notificacao.tipo,
              titulo: d.notificacao.titulo,
              corpo: d.notificacao.corpo,
            },
          });
        }
        const comprovante = atual.usuario
          ? { email: atual.usuario.email, nome: atual.usuario.nome }
          : atual.emailDoador
            ? { email: atual.emailDoador, nome: atual.nomeDoador ?? 'doador(a)' }
            : null;
        return { resultado: 'confirmada' as const, comprovante };
      });
    } catch (erro) {
      // UNIQUE(provedor, eventoId): o mesmo evento chegou de novo (ou em paralelo).
      if (d.evento && violouUnicidade(erro)) return { resultado: 'duplicado' as const };
      throw erro;
    }
  }

  async registrarEvento(evento: EventoWebhook): Promise<boolean> {
    try {
      await this.prisma.webhookEvento.create({
        data: { provedor: evento.provedor, eventoId: evento.eventoId, tipo: evento.tipo },
      });
      return true;
    } catch (erro) {
      if (violouUnicidade(erro)) return false;
      throw erro;
    }
  }
}
