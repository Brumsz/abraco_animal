import type { StatusAnimal } from '@abraco/shared';

import type { Prisma as PrismaGerado } from '../../../generated/prisma/client.js';
import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { gravarAuditoria } from '../../../shared/infra/auditoria-prisma.js';
import { violouUnicidade, type Prisma } from '../../../shared/infra/prisma.js';
import type { DadosAnimal } from '../domain/animal.js';
import type {
  AnimalCompleto,
  AnimalRegistro,
  AnimalResumoRegistro,
  CursorAnimais,
  FiltroAnimais,
  FotoRegistro,
  RepositorioAnimais,
} from '../application/portas.js';

type Tx = PrismaGerado.TransactionClient;

export const CAMPOS_ANIMAL = {
  id: true,
  publicId: true,
  nome: true,
  tipo: true,
  raca: true,
  idadeAprox: true,
  sexo: true,
  porte: true,
  descricao: true,
  historiaResgate: true,
  vacinado: true,
  castrado: true,
  status: true,
  criadoEm: true,
} as const satisfies PrismaGerado.AnimalSelect;

export const CAMPOS_FOTO = { publicId: true, url: true, ordem: true } as const;

type LinhaFoto = PrismaGerado.AnimalFotoGetPayload<{ select: typeof CAMPOS_FOTO }>;

export const foto = (f: LinhaFoto): FotoRegistro => ({
  publicId: f.publicId,
  chave: f.url,
  ordem: f.ordem,
});

/** Seleção do resumo (com a capa) para quem mostra o animal junto de outra coisa (ex.: adoção). */
export const SELECAO_RESUMO_ANIMAL = {
  ...CAMPOS_ANIMAL,
  fotos: { select: CAMPOS_FOTO, orderBy: { ordem: 'asc' }, take: 1 },
} as const satisfies PrismaGerado.AnimalSelect;

type LinhaResumo = PrismaGerado.AnimalGetPayload<{ select: typeof SELECAO_RESUMO_ANIMAL }>;

export function paraResumoAnimal({ fotos, ...animal }: LinhaResumo): AnimalResumoRegistro {
  return { ...animal, fotoCapa: fotos[0] ? foto(fotos[0]) : null };
}

const conflito = () =>
  new ErroDominio(
    'CONFLITO',
    'ANIMAL_ALTERADO',
    'O animal foi alterado por outra pessoa. Recarregue e tente novamente.',
  );

/**
 * O `contains` do Prisma vira ILIKE sem escapar curingas: "%" listaria tudo e
 * padrões como "%_%_%" custam CPU. A busca é por texto literal.
 */
export const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

const auditar = (tx: Tx, animalPublicId: string, a: EntradaAuditoria) =>
  gravarAuditoria(tx, 'Animal', animalPublicId, a);

export class PrismaRepositorioAnimais implements RepositorioAnimais {
  constructor(private readonly prisma: Prisma) {}

  async criar(
    dados: DadosAnimal & { status: StatusAnimal },
    a: EntradaAuditoria,
  ): Promise<AnimalCompleto> {
    return this.prisma.$transaction(async (tx) => {
      const criado = await tx.animal.create({ data: dados, select: CAMPOS_ANIMAL });
      await auditar(tx, criado.publicId, a);
      return { ...criado, fotos: [], totalPadrinhos: 0 };
    });
  }

  async buscar(publicId: string): Promise<AnimalCompleto | null> {
    const linha = await this.prisma.animal.findFirst({
      where: { publicId, removidoEm: null },
      select: {
        ...CAMPOS_ANIMAL,
        fotos: { select: CAMPOS_FOTO, orderBy: { ordem: 'asc' } },
        _count: { select: { apadrinhamentos: { where: { ativo: true } } } },
      },
    });
    if (!linha) return null;
    const { fotos, _count, ...animal } = linha;
    return { ...animal, fotos: fotos.map(foto), totalPadrinhos: _count.apadrinhamentos };
  }

  async atualizar(animal: AnimalRegistro, dados: DadosAnimal, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.animal.updateMany({
        where: { id: animal.id, removidoEm: null },
        data: dados,
      });
      if (r.count === 0) throw conflito();
      await auditar(tx, animal.publicId, a);
    });
  }

  async alterarStatus(
    animal: AnimalRegistro,
    status: StatusAnimal,
    a: EntradaAuditoria,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Concorrência otimista: só troca se o status ainda for o que o caso de uso validou.
      const r = await tx.animal.updateMany({
        where: { id: animal.id, status: animal.status, removidoEm: null },
        data: { status },
      });
      if (r.count === 0) throw conflito();
      await auditar(tx, animal.publicId, a);
    });
  }

  async remover(animal: AnimalRegistro, em: Date, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // O UPDATE trava a linha do animal ANTES da contagem: uma solicitação nova
      // (que lê o animal com FOR SHARE) espera esta transação e então vê o animal removido.
      const r = await tx.animal.updateMany({
        where: { id: animal.id, removidoEm: null },
        data: { removidoEm: em },
      });
      if (r.count === 0) throw conflito();
      const pendentes = await tx.adocao.count({
        where: { animalId: animal.id, status: 'PENDENTE', removidoEm: null },
      });
      if (pendentes > 0) {
        throw new ErroDominio(
          'CONFLITO',
          'ANIMAL_COM_ADOCOES_PENDENTES',
          'Este animal tem solicitações de adoção pendentes. Analise-as antes de removê-lo.',
        );
      }
      await auditar(tx, animal.publicId, a);
    });
  }

  async listar(
    filtro: FiltroAnimais,
    cursor: CursorAnimais | undefined,
    limite: number,
  ): Promise<AnimalResumoRegistro[]> {
    const linhas = await this.prisma.animal.findMany({
      where: {
        removidoEm: null,
        ...(filtro.q ? { nome: { contains: escaparLike(filtro.q), mode: 'insensitive' } } : {}),
        ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
        ...(filtro.porte ? { porte: filtro.porte } : {}),
        ...(filtro.sexo ? { sexo: filtro.sexo } : {}),
        ...(filtro.status ? { status: { in: [...filtro.status] } } : {}),
        // Keyset: tudo que vem DEPOIS do cursor na ordenação (criadoEm DESC, publicId DESC).
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
      select: SELECAO_RESUMO_ANIMAL,
    });
    return linhas.map(paraResumoAnimal);
  }

  async adicionarFotos(
    animal: AnimalRegistro,
    chaves: readonly string[],
    a: EntradaAuditoria,
  ): Promise<FotoRegistro[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { _max } = await tx.animalFoto.aggregate({
          where: { animalId: animal.id },
          _max: { ordem: true },
        });
        const inicio = (_max.ordem ?? -1) + 1;
        // Dois envios simultâneos calculam as mesmas posições: o UNIQUE(animalId, ordem) barra um.
        const criadas = await tx.animalFoto.createManyAndReturn({
          data: chaves.map((url, i) => ({ animalId: animal.id, url, ordem: inicio + i })),
          select: CAMPOS_FOTO,
        });
        await auditar(tx, animal.publicId, a);
        return criadas.sort((x, y) => x.ordem - y.ordem).map(foto);
      });
    } catch (erro) {
      if (violouUnicidade(erro)) {
        throw new ErroDominio(
          'CONFLITO',
          'ENVIO_SIMULTANEO',
          'Outro envio de fotos deste animal está em andamento. Tente novamente.',
        );
      }
      throw erro;
    }
  }

  async removerFoto(animal: AnimalRegistro, f: FotoRegistro, a: EntradaAuditoria): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.animalFoto.deleteMany({
        where: { publicId: f.publicId, animalId: animal.id },
      });
      if (r.count === 0) throw conflito();
      await auditar(tx, animal.publicId, a);
    });
  }

  async reordenarFotos(
    animal: AnimalRegistro,
    ids: readonly string[],
    a: EntradaAuditoria,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Duas passadas: posições negativas temporárias evitam colidir no UNIQUE(animalId, ordem).
      for (const [i, publicId] of ids.entries()) {
        const r = await tx.animalFoto.updateMany({
          where: { publicId, animalId: animal.id },
          data: { ordem: -(i + 1) },
        });
        // Foto removida por outra pessoa no meio do caminho.
        if (r.count === 0) throw conflito();
      }
      for (const [i, publicId] of ids.entries()) {
        await tx.animalFoto.updateMany({
          where: { publicId, animalId: animal.id },
          data: { ordem: i },
        });
      }
      await auditar(tx, animal.publicId, a);
    });
  }
}
