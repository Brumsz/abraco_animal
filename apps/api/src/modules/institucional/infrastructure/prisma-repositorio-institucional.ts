import type { SecaoPerfilOng } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import type { Prisma } from '../../../shared/infra/prisma.js';
import type {
  DadosFaq,
  FaqRegistro,
  RepositorioInstitucional,
  SecaoRegistro,
} from '../application/casos-de-uso.js';

const CAMPOS_SECAO = {
  secao: true,
  titulo: true,
  conteudo: true,
  publicado: true,
  atualizadoEm: true,
} as const;

const CAMPOS_FAQ = {
  id: true,
  publicId: true,
  pergunta: true,
  resposta: true,
  ordem: true,
  publicado: true,
  atualizadoEm: true,
} as const;

export class PrismaRepositorioInstitucional implements RepositorioInstitucional {
  constructor(private readonly prisma: Prisma) {}

  listarSecoes(somentePublicadas: boolean): Promise<SecaoRegistro[]> {
    return this.prisma.perfilOng.findMany({
      where: somentePublicadas ? { publicado: true } : {},
      select: CAMPOS_SECAO,
    });
  }

  async salvarSecao(
    d: { secao: SecaoPerfilOng; titulo: string; conteudo: string; publicado: boolean },
    a: EntradaAuditoria,
  ): Promise<SecaoRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.perfilOng.upsert({
        where: { secao: d.secao },
        create: d,
        update: { titulo: d.titulo, conteudo: d.conteudo, publicado: d.publicado },
        select: { ...CAMPOS_SECAO, publicId: true },
      });
      await gravarAuditoria(tx, 'PerfilOng', s.publicId, a);
      return {
        secao: s.secao,
        titulo: s.titulo,
        conteudo: s.conteudo,
        publicado: s.publicado,
        atualizadoEm: s.atualizadoEm,
      };
    });
  }

  listarFaq(somentePublicadas: boolean): Promise<FaqRegistro[]> {
    return this.prisma.faq.findMany({
      where: somentePublicadas ? { publicado: true } : {},
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      select: CAMPOS_FAQ,
    });
  }

  buscarFaq(publicId: string): Promise<FaqRegistro | null> {
    return this.prisma.faq.findUnique({ where: { publicId }, select: CAMPOS_FAQ });
  }

  async criarFaq(d: DadosFaq, a: EntradaAuditoria): Promise<FaqRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.faq.aggregate({ _max: { ordem: true } });
      const f = await tx.faq.create({
        data: { ...d, ordem: (_max.ordem ?? -1) + 1 },
        select: CAMPOS_FAQ,
      });
      await gravarAuditoria(tx, 'Faq', f.publicId, a);
      return f;
    });
  }

  async atualizarFaq(faq: FaqRegistro, d: DadosFaq, a: EntradaAuditoria): Promise<FaqRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const f = await tx.faq.update({ where: { id: faq.id }, data: d, select: CAMPOS_FAQ });
      await gravarAuditoria(tx, 'Faq', f.publicId, a);
      return f;
    });
  }

  async removerFaq(faq: FaqRegistro, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.faq.deleteMany({ where: { id: faq.id } });
      await gravarAuditoria(tx, 'Faq', faq.publicId, a);
    });
  }

  async reordenarFaq(ids: readonly string[], a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Sem UNIQUE em `ordem`: uma passada basta.
      for (const [ordem, publicId] of ids.entries()) {
        await tx.faq.updateMany({ where: { publicId }, data: { ordem } });
      }
      await gravarAuditoria(tx, 'Faq', ids[0] ?? '', { ...a, detalhe: { ids: [...ids] } });
    });
  }
}
