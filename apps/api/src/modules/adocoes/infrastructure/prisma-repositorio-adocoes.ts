import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type { AnimalRegistro } from '../../animais/application/portas.js';
import {
  paraResumoAnimal,
  SELECAO_RESUMO_ANIMAL,
} from '../../animais/infrastructure/prisma-repositorio-animais.js';
import type { Triagem } from '../domain/adocao.js';
import type {
  AdocaoDetalhada,
  AdocaoRegistro,
  CursorAdocoes,
  Encerrada,
  FiltroAdocoes,
  RepositorioAdocoes,
} from '../application/portas.js';

type Tx = PrismaGerado.TransactionClient;

const CAMPOS = {
  id: true,
  publicId: true,
  status: true,
  tipoMoradia: true,
  possuiEspacoAdequado: true,
  outrosAnimais: true,
  motivo: true,
  termoAceitoEm: true,
  analisadoEm: true,
  motivoRecusa: true,
  recusaAutomatica: true,
  criadoEm: true,
  animal: { select: SELECAO_RESUMO_ANIMAL },
  usuario: { select: { publicId: true } },
} as const satisfies PrismaGerado.AdocaoSelect;

// Só o necessário para a análise: CPF e data de nascimento cifrados nunca saem daqui.
const CAMPOS_DETALHE = {
  ...CAMPOS,
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
  analisadoPor: { select: { nome: true } },
} as const satisfies PrismaGerado.AdocaoSelect;

type Linha = PrismaGerado.AdocaoGetPayload<{ select: typeof CAMPOS }>;
type LinhaDetalhe = PrismaGerado.AdocaoGetPayload<{ select: typeof CAMPOS_DETALHE }>;

function registro(l: Linha | LinhaDetalhe): AdocaoRegistro {
  return {
    id: l.id,
    publicId: l.publicId,
    status: l.status,
    solicitanteId: l.usuario?.publicId ?? null,
    animal: paraResumoAnimal(l.animal),
    tipoMoradia: l.tipoMoradia,
    possuiEspacoAdequado: l.possuiEspacoAdequado,
    outrosAnimais: l.outrosAnimais,
    motivo: l.motivo,
    termoAceitoEm: l.termoAceitoEm,
    analisadoEm: l.analisadoEm,
    motivoRecusa: l.motivoRecusa,
    recusaAutomatica: l.recusaAutomatica,
    criadoEm: l.criadoEm,
  };
}

function detalhada(l: LinhaDetalhe): AdocaoDetalhada {
  const u = l.usuario;
  return {
    ...registro(l),
    solicitante: u
      ? {
          publicId: u.publicId,
          nome: u.nome,
          email: u.email,
          telefone: u.telefone,
          endereco: {
            cep: u.cep,
            logradouro: u.logradouro,
            numero: u.numero,
            complemento: u.complemento,
            bairro: u.bairro,
            cidade: u.cidade,
            uf: u.uf,
          },
        }
      : null,
    analisadoPor: l.analisadoPor?.nome ?? null,
  };
}

const adocaoAlterada = () =>
  new ErroDominio(
    'CONFLITO',
    'ADOCAO_ALTERADA',
    'Esta solicitação foi analisada por outra pessoa. Recarregue a lista.',
  );

const animalIndisponivel = () =>
  new ErroDominio(
    'CONFLITO',
    'ANIMAL_NAO_DISPONIVEL',
    'Este animal não está disponível para adoção no momento',
  );

async function idInternoDoAdmin(tx: Tx, publicId: string): Promise<number> {
  const admin = await tx.usuario.findUniqueOrThrow({ where: { publicId }, select: { id: true } });
  return admin.id;
}

const notificacao = (usuarioId: number, entidadeId: string, n: ConteudoNotificacao) => ({
  usuarioId,
  entidadeId,
  tipo: n.tipo,
  titulo: n.titulo,
  corpo: n.corpo,
});

export class PrismaRepositorioAdocoes implements RepositorioAdocoes {
  constructor(private readonly prisma: Prisma) {}

  async criar(d: {
    solicitanteId: string;
    animal: AnimalRegistro;
    triagem: Triagem;
    termoAceitoEm: Date;
  }): Promise<AdocaoDetalhada> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // FOR SHARE: se uma aprovação (ou remoção) deste animal estiver em curso, espera
        // ela terminar e lê o status novo. Sem isso, uma solicitação criada no mesmo
        // instante da aprovação ficaria PENDENTE para um animal já adotado.
        const [animal] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM animais
          WHERE id = ${d.animal.id} AND "removidoEm" IS NULL
          FOR SHARE`;
        if (animal?.status !== 'DISPONIVEL') throw animalIndisponivel();

        const linha = await tx.adocao.create({
          data: {
            usuario: { connect: { publicId: d.solicitanteId } },
            animal: { connect: { id: d.animal.id } },
            ...d.triagem,
            termoAceitoEm: d.termoAceitoEm,
          },
          select: CAMPOS_DETALHE,
        });
        return detalhada(linha);
      });
    } catch (erro) {
      // Índice único parcial adocoes_pendente_unica (usuário, animal) WHERE PENDENTE.
      if (violouUnicidade(erro)) {
        throw new ErroDominio(
          'CONFLITO',
          'ADOCAO_PENDENTE_EXISTENTE',
          'Você já tem uma solicitação em análise para este animal',
        );
      }
      throw erro;
    }
  }

  async buscar(publicId: string): Promise<AdocaoDetalhada | null> {
    const linha = await this.prisma.adocao.findFirst({
      where: { publicId, removidoEm: null },
      select: CAMPOS_DETALHE,
    });
    return linha ? detalhada(linha) : null;
  }

  async listar(
    filtro: FiltroAdocoes,
    cursor: CursorAdocoes | undefined,
    limite: number,
  ): Promise<AdocaoRegistro[]> {
    const linhas = await this.prisma.adocao.findMany({
      where: {
        removidoEm: null,
        ...(filtro.solicitanteId ? { usuario: { publicId: filtro.solicitanteId } } : {}),
        ...(filtro.status ? { status: filtro.status } : {}),
        ...(filtro.animalId ? { animal: { publicId: filtro.animalId } } : {}),
        ...(filtro.de || filtro.ate
          ? {
              criadoEm: {
                ...(filtro.de ? { gte: filtro.de } : {}),
                ...(filtro.ate ? { lt: filtro.ate } : {}),
              },
            }
          : {}),
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
    adocao: AdocaoRegistro,
    d: {
      em: Date;
      auditoria: EntradaAuditoria;
      notificacaoAprovada: ConteudoNotificacao;
      notificacaoEncerrada: ConteudoNotificacao;
      motivoEncerrada: string;
    },
  ): Promise<Encerrada[]> {
    return this.prisma.$transaction(async (tx) => {
      // 1º o animal: trava a linha. Duas aprovações simultâneas do mesmo animal
      // se enfileiram aqui, e a segunda encontra o animal já ADOTADO.
      const animal = await tx.animal.updateMany({
        where: { id: adocao.animal.id, status: 'DISPONIVEL', removidoEm: null },
        data: { status: 'ADOTADO' },
      });
      if (animal.count === 0) throw animalIndisponivel();

      const adminId = await idInternoDoAdmin(tx, d.auditoria.adminId);
      const aprovada = await tx.adocao.updateMany({
        where: { id: adocao.id, status: 'PENDENTE', removidoEm: null },
        data: { status: 'APROVADA', analisadoEm: d.em, analisadoPorId: adminId },
      });
      if (aprovada.count === 0) throw adocaoAlterada();

      const outras = await tx.adocao.findMany({
        where: {
          animalId: adocao.animal.id,
          status: 'PENDENTE',
          removidoEm: null,
          id: { not: adocao.id },
        },
        select: {
          id: true,
          publicId: true,
          usuarioId: true,
          usuario: { select: { nome: true, email: true } },
        },
      });
      if (outras.length > 0) {
        await tx.adocao.updateMany({
          where: { id: { in: outras.map((o) => o.id) } },
          data: {
            status: 'RECUSADA',
            recusaAutomatica: true,
            motivoRecusa: d.motivoEncerrada,
            analisadoEm: d.em,
            analisadoPorId: adminId,
          },
        });
      }

      const dono = await tx.adocao.findUniqueOrThrow({
        where: { id: adocao.id },
        select: { usuarioId: true },
      });
      await tx.notificacao.createMany({
        data: [
          ...(dono.usuarioId !== null
            ? [notificacao(dono.usuarioId, adocao.publicId, d.notificacaoAprovada)]
            : []),
          ...outras.flatMap((o) =>
            o.usuarioId !== null
              ? [notificacao(o.usuarioId, o.publicId, d.notificacaoEncerrada)]
              : [],
          ),
        ],
      });

      await gravarAuditoria(tx, 'Adocao', adocao.publicId, {
        ...d.auditoria,
        detalhe: { ...d.auditoria.detalhe, encerradas: outras.map((o) => o.publicId) },
      });

      return outras.map((o) => ({ publicId: o.publicId, solicitante: o.usuario }));
    });
  }

  async recusar(
    adocao: AdocaoRegistro,
    d: { em: Date; motivo: string; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const adminId = await idInternoDoAdmin(tx, d.auditoria.adminId);
      const r = await tx.adocao.updateMany({
        where: { id: adocao.id, status: 'PENDENTE', removidoEm: null },
        data: {
          status: 'RECUSADA',
          motivoRecusa: d.motivo,
          analisadoEm: d.em,
          analisadoPorId: adminId,
        },
      });
      if (r.count === 0) throw adocaoAlterada();

      const dono = await tx.adocao.findUniqueOrThrow({
        where: { id: adocao.id },
        select: { usuarioId: true },
      });
      if (dono.usuarioId !== null) {
        await tx.notificacao.create({
          data: notificacao(dono.usuarioId, adocao.publicId, d.notificacao),
        });
      }
      await gravarAuditoria(tx, 'Adocao', adocao.publicId, d.auditoria);
    });
  }
}
