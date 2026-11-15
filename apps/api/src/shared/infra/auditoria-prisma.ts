import type { Prisma as PrismaGerado } from '../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../aplicacao/auditoria.js';

/** Grava a auditoria DENTRO da transação da alteração (`tx`). */
export async function gravarAuditoria(
  tx: PrismaGerado.TransactionClient,
  entidade: 'Animal' | 'Adocao' | 'DoacaoAnimal',
  entidadeId: string,
  a: EntradaAuditoria,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      admin: { connect: { publicId: a.adminId } },
      acao: a.acao,
      entidade,
      entidadeId,
      ...(a.detalhe ? { detalhe: a.detalhe } : {}),
    },
  });
}
