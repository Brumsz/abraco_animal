import type { StatusVoluntario } from '@abraco/shared';

import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type { DadosCandidatura } from '../domain/candidatura.js';
import type {
  CandidaturaRegistro,
  CursorCandidaturas,
  RepositorioCandidaturas,
} from '../application/casos-de-uso.js';

type Tx = PrismaGerado.TransactionClient;

const CAMPOS = {
  id: true,
  publicId: true,
  status: true,
  areasInteresse: true,
  areaInteresseOutros: true,
  disponibilidadeDias: true,
  turnos: true,
  motivacao: true,
  habilidades: true,
  cargo: true,
  motivoRecusa: true,
  analisadoEm: true,
  criadoEm: true,
  // Contato para a equipe; CPF e data de nascimento cifrados nunca saem daqui.
  usuario: {
    select: {
      publicId: true,
      nome: true,
      email: true,
      telefone: true,
      cep: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
    },
  },
} as const satisfies PrismaGerado.VoluntarioSelect;

type Linha = PrismaGerado.VoluntarioGetPayload<{ select: typeof CAMPOS }>;

const registro = ({ usuario, ...c }: Linha): CandidaturaRegistro => ({ ...c, candidato: usuario });

const alterada = () =>
  new ErroDominio(
    'CONFLITO',
    'CANDIDATURA_ALTERADA',
    'A candidatura foi analisada por outra pessoa',
  );

async function idInterno(tx: Tx, publicId: string): Promise<number> {
  return (await tx.usuario.findUniqueOrThrow({ where: { publicId }, select: { id: true } })).id;
}

async function analisar(
  tx: Tx,
  c: CandidaturaRegistro,
  dados: PrismaGerado.VoluntarioUncheckedUpdateManyInput,
  a: EntradaAuditoria,
  n: ConteudoNotificacao,
): Promise<number> {
  const r = await tx.voluntario.updateMany({
    where: { id: c.id, status: 'PENDENTE' },
    data: { ...dados, analisadoPorId: await idInterno(tx, a.adminId) },
  });
  if (r.count === 0) throw alterada();
  const usuarioId = await idInterno(tx, c.candidato.publicId);
  await tx.notificacao.create({
    data: { usuarioId, entidadeId: c.publicId, tipo: n.tipo, titulo: n.titulo, corpo: n.corpo },
  });
  await gravarAuditoria(tx, 'Voluntario', c.publicId, a);
  return usuarioId;
}

export class PrismaRepositorioCandidaturas implements RepositorioCandidaturas {
  constructor(private readonly prisma: Prisma) {}

  async buscarDoUsuario(usuarioId: string): Promise<CandidaturaRegistro | null> {
    const l = await this.prisma.voluntario.findFirst({
      where: { usuario: { publicId: usuarioId } },
      select: CAMPOS,
    });
    return l ? registro(l) : null;
  }

  async buscar(publicId: string): Promise<CandidaturaRegistro | null> {
    const l = await this.prisma.voluntario.findUnique({ where: { publicId }, select: CAMPOS });
    return l ? registro(l) : null;
  }

  async salvar(usuarioId: string, dados: DadosCandidatura): Promise<CandidaturaRegistro> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const id = await idInterno(tx, usuarioId);
        // Reabre só uma RECUSADA (condicional): PENDENTE/APROVADO não são sobrescritos.
        const reaberta = await tx.voluntario.updateMany({
          where: { usuarioId: id, status: 'RECUSADO' },
          data: {
            ...dados,
            status: 'PENDENTE',
            motivoRecusa: null,
            analisadoEm: null,
            analisadoPorId: null,
            cargo: null,
          },
        });
        if (reaberta.count === 0) {
          await tx.voluntario.create({ data: { ...dados, usuarioId: id } });
        }
        return registro(
          await tx.voluntario.findUniqueOrThrow({ where: { usuarioId: id }, select: CAMPOS }),
        );
      });
    } catch (erro) {
      // UNIQUE(usuarioId): já existe uma candidatura PENDENTE/APROVADA (ou envio duplo).
      if (violouUnicidade(erro)) {
        throw new ErroDominio(
          'CONFLITO',
          'CANDIDATURA_EM_ANALISE',
          'Sua candidatura já está em análise',
        );
      }
      throw erro;
    }
  }

  async listar(
    filtro: { status?: StatusVoluntario },
    cursor: CursorCandidaturas | undefined,
    limite: number,
  ): Promise<CandidaturaRegistro[]> {
    const linhas = await this.prisma.voluntario.findMany({
      where: {
        ...(filtro.status ? { status: filtro.status } : {}),
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

  async aprovar(
    c: CandidaturaRegistro,
    d: {
      em: Date;
      cargo: string | null;
      auditoria: EntradaAuditoria;
      notificacao: ConteudoNotificacao;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const usuarioId = await analisar(
        tx,
        c,
        { status: 'APROVADO', analisadoEm: d.em, cargo: d.cargo },
        d.auditoria,
        d.notificacao,
      );
      // Só promove quem é USUARIO: um ADMIN nunca é rebaixado por engano.
      await tx.usuario.updateMany({
        where: { id: usuarioId, role: 'USUARIO' },
        data: { role: 'VOLUNTARIO' },
      });
    });
  }

  async recusar(
    c: CandidaturaRegistro,
    d: { em: Date; motivo: string; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      analisar(
        tx,
        c,
        { status: 'RECUSADO', analisadoEm: d.em, motivoRecusa: d.motivo },
        d.auditoria,
        d.notificacao,
      ),
    );
  }
}
