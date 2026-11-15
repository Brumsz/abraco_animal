import type { StatusDoacaoAnimal } from '@abraco/shared';

import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import type { Prisma } from '../../../shared/infra/prisma.js';
import type { DadosAnimal } from '../../animais/domain/animal.js';
import type { DadosDoacao } from '../domain/doacao-animal.js';
import type {
  CursorDoacoes,
  DoacaoDetalhada,
  DoacaoRegistro,
  FiltroDoacoes,
  RepositorioDoacoesAnimais,
} from '../application/portas.js';

type Tx = PrismaGerado.TransactionClient;

const CAMPOS = {
  id: true,
  publicId: true,
  status: true,
  nomeAnimal: true,
  tipo: true,
  raca: true,
  idadeAprox: true,
  sexo: true,
  porte: true,
  descricao: true,
  motivoDoacao: true,
  enderecoRetirada: true,
  motivoRecusa: true,
  analisadoEm: true,
  recebidoEm: true,
  criadoEm: true,
  usuario: { select: { publicId: true } },
  animalCriado: { select: { publicId: true } },
  fotos: { select: { publicId: true, url: true, ordem: true }, orderBy: { ordem: 'asc' } },
} as const satisfies PrismaGerado.DoacaoAnimalSelect;

// Contato para combinar a retirada; CPF e data de nascimento nunca saem daqui.
const CAMPOS_DETALHE = {
  ...CAMPOS,
  usuario: { select: { publicId: true, nome: true, email: true, telefone: true } },
  analisadoPor: { select: { nome: true } },
} as const satisfies PrismaGerado.DoacaoAnimalSelect;

type Linha = PrismaGerado.DoacaoAnimalGetPayload<{ select: typeof CAMPOS }>;
type LinhaDetalhe = PrismaGerado.DoacaoAnimalGetPayload<{ select: typeof CAMPOS_DETALHE }>;

function registro(l: Linha | LinhaDetalhe): DoacaoRegistro {
  const { usuario, animalCriado, fotos, ...resto } = l;
  return {
    ...resto,
    doadorId: usuario?.publicId ?? null,
    animalCriadoId: animalCriado?.publicId ?? null,
    fotos: fotos.map((f) => ({ publicId: f.publicId, chave: f.url, ordem: f.ordem })),
  };
}

function detalhada(l: LinhaDetalhe): DoacaoDetalhada {
  return {
    ...registro(l),
    doador: l.usuario
      ? {
          publicId: l.usuario.publicId,
          nome: l.usuario.nome,
          email: l.usuario.email,
          telefone: l.usuario.telefone,
        }
      : null,
    analisadoPor: l.analisadoPor?.nome ?? null,
  };
}

const alterada = () =>
  new ErroDominio(
    'CONFLITO',
    'DOACAO_ALTERADA',
    'Esta doação foi alterada por outra pessoa. Recarregue a lista.',
  );

async function idInterno(tx: Tx, publicId: string): Promise<number> {
  return (await tx.usuario.findUniqueOrThrow({ where: { publicId }, select: { id: true } })).id;
}

/** Transição condicional + notificação + auditoria, tudo na transação `tx`. */
async function transicionar(
  tx: Tx,
  doacao: DoacaoRegistro,
  de: readonly StatusDoacaoAnimal[],
  dados: PrismaGerado.DoacaoAnimalUncheckedUpdateManyInput,
  a: EntradaAuditoria,
  n: ConteudoNotificacao,
): Promise<void> {
  const r = await tx.doacaoAnimal.updateMany({
    where: { id: doacao.id, status: { in: [...de] } },
    data: { ...dados, analisadoPorId: await idInterno(tx, a.adminId) },
  });
  if (r.count === 0) throw alterada();

  const { usuarioId } = await tx.doacaoAnimal.findUniqueOrThrow({
    where: { id: doacao.id },
    select: { usuarioId: true },
  });
  if (usuarioId !== null) {
    await tx.notificacao.create({
      data: {
        usuarioId,
        entidadeId: doacao.publicId,
        tipo: n.tipo,
        titulo: n.titulo,
        corpo: n.corpo,
      },
    });
  }
  await gravarAuditoria(tx, 'DoacaoAnimal', doacao.publicId, a);
}

export class PrismaRepositorioDoacoesAnimais implements RepositorioDoacoesAnimais {
  constructor(private readonly prisma: Prisma) {}

  async criar(d: {
    doadorId: string;
    dados: DadosDoacao;
    chavesFotos: readonly string[];
  }): Promise<DoacaoDetalhada> {
    const linha = await this.prisma.doacaoAnimal.create({
      data: {
        ...d.dados,
        usuario: { connect: { publicId: d.doadorId } },
        fotos: { create: d.chavesFotos.map((url, ordem) => ({ url, ordem })) },
      },
      select: CAMPOS_DETALHE,
    });
    return detalhada(linha);
  }

  async buscar(publicId: string): Promise<DoacaoDetalhada | null> {
    const linha = await this.prisma.doacaoAnimal.findUnique({
      where: { publicId },
      select: CAMPOS_DETALHE,
    });
    return linha ? detalhada(linha) : null;
  }

  async listar(
    filtro: FiltroDoacoes,
    cursor: CursorDoacoes | undefined,
    limite: number,
  ): Promise<DoacaoRegistro[]> {
    const linhas = await this.prisma.doacaoAnimal.findMany({
      where: {
        ...(filtro.doadorId ? { usuario: { publicId: filtro.doadorId } } : {}),
        ...(filtro.status ? { status: filtro.status } : {}),
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
    doacao: DoacaoRegistro,
    d: { em: Date; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      transicionar(
        tx,
        doacao,
        ['PENDENTE'],
        { status: 'APROVADA', analisadoEm: d.em },
        d.auditoria,
        d.notificacao,
      ),
    );
  }

  async recusar(
    doacao: DoacaoRegistro,
    d: { em: Date; motivo: string; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      transicionar(
        tx,
        doacao,
        ['PENDENTE', 'APROVADA'],
        { status: 'RECUSADA', analisadoEm: d.em, motivoRecusa: d.motivo },
        d.auditoria,
        d.notificacao,
      ),
    );
  }

  async receber(
    doacao: DoacaoRegistro,
    d: {
      em: Date;
      auditoria: EntradaAuditoria;
      notificacao: ConteudoNotificacao;
      animalPublicId: string;
      animal: DadosAnimal;
      chavesFotosAnimal: readonly string[];
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // A transição vem primeiro: trava a doação. Uma segunda chamada simultânea
      // espera aqui, encontra RECEBIDA e falha com DOACAO_ALTERADA (sem criar animal).
      await transicionar(
        tx,
        doacao,
        ['APROVADA'],
        { status: 'RECEBIDA', recebidoEm: d.em },
        d.auditoria,
        d.notificacao,
      );
      const animal = await tx.animal.create({
        data: {
          ...d.animal,
          publicId: d.animalPublicId,
          status: 'EM_TRATAMENTO',
          fotos: { create: d.chavesFotosAnimal.map((url, ordem) => ({ url, ordem })) },
        },
        select: { id: true },
      });
      // animalCriadoId é UNIQUE: mesmo num caminho inesperado, uma doação gera um animal só.
      await tx.doacaoAnimal.update({
        where: { id: doacao.id },
        data: { animalCriadoId: animal.id },
      });
      await gravarAuditoria(tx, 'Animal', d.animalPublicId, {
        adminId: d.auditoria.adminId,
        acao: 'ANIMAL_CRIADO',
        detalhe: { status: 'EM_TRATAMENTO', origem: 'DOACAO', doacaoId: doacao.publicId },
      });
    });
  }
}
