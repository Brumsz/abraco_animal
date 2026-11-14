import type { Porte, Sexo, StatusAnimal, TipoAnimal } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { DadosAnimal } from '../domain/animal.js';

export interface FotoRegistro {
  readonly publicId: string;
  /** Chave do objeto no bucket (coluna `url` do schema). */
  readonly chave: string;
  readonly ordem: number;
}

export interface AnimalRegistro extends DadosAnimal {
  readonly id: number;
  readonly publicId: string;
  readonly status: StatusAnimal;
  readonly criadoEm: Date;
}

export interface AnimalCompleto extends AnimalRegistro {
  /** Em ordem crescente de `ordem`. */
  readonly fotos: readonly FotoRegistro[];
  readonly totalPadrinhos: number;
}

export interface AnimalResumoRegistro extends AnimalRegistro {
  readonly fotoCapa: FotoRegistro | null;
}

export interface FiltroAnimais {
  /** Busca por nome (contém, sem diferenciar maiúsculas). */
  readonly q?: string;
  readonly tipo?: TipoAnimal;
  readonly porte?: Porte;
  readonly sexo?: Sexo;
  /** `undefined` = todos os status. */
  readonly status?: readonly StatusAnimal[];
}

/** Posição na ordenação (criadoEm DESC, publicId DESC). */
export interface CursorAnimais {
  readonly criadoEm: Date;
  readonly publicId: string;
}

/**
 * Animais removidos (soft delete) nunca são retornados. Toda escrita recebe a
 * entrada de auditoria e a grava na mesma transação.
 */
export interface RepositorioAnimais {
  criar(
    dados: DadosAnimal & { status: StatusAnimal },
    auditoria: EntradaAuditoria,
  ): Promise<AnimalCompleto>;
  buscar(publicId: string): Promise<AnimalCompleto | null>;
  atualizar(animal: AnimalRegistro, dados: DadosAnimal, auditoria: EntradaAuditoria): Promise<void>;
  alterarStatus(
    animal: AnimalRegistro,
    status: StatusAnimal,
    auditoria: EntradaAuditoria,
  ): Promise<void>;
  remover(animal: AnimalRegistro, em: Date, auditoria: EntradaAuditoria): Promise<void>;
  /** Retorna até `limite` itens a partir do cursor (exclusivo). */
  listar(
    filtro: FiltroAnimais,
    cursor: CursorAnimais | undefined,
    limite: number,
  ): Promise<AnimalResumoRegistro[]>;
  /**
   * Acrescenta as fotos ao fim da galeria. Lança CONFLITO se outro envio
   * simultâneo ocupar as mesmas posições.
   */
  adicionarFotos(
    animal: AnimalRegistro,
    chaves: readonly string[],
    auditoria: EntradaAuditoria,
  ): Promise<FotoRegistro[]>;
  removerFoto(
    animal: AnimalRegistro,
    foto: FotoRegistro,
    auditoria: EntradaAuditoria,
  ): Promise<void>;
  /** `ids` = publicIds de TODAS as fotos do animal, na nova ordem. */
  reordenarFotos(
    animal: AnimalRegistro,
    ids: readonly string[],
    auditoria: EntradaAuditoria,
  ): Promise<void>;
}
