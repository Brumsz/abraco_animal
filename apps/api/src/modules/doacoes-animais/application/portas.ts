import type { StatusDoacaoAnimal } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { FotoRegistro } from '../../animais/application/portas.js';
import type { DadosAnimal } from '../../animais/domain/animal.js';
import type { DadosDoacao } from '../domain/doacao-animal.js';

export interface DoacaoRegistro extends DadosDoacao {
  readonly id: number;
  readonly publicId: string;
  readonly status: StatusDoacaoAnimal;
  /** publicId do doador; `null` depois da anonimização (LGPD). */
  readonly doadorId: string | null;
  /** Em ordem crescente de `ordem`. */
  readonly fotos: readonly FotoRegistro[];
  readonly motivoRecusa: string | null;
  readonly analisadoEm: Date | null;
  readonly recebidoEm: Date | null;
  /** publicId do Animal criado ao receber. */
  readonly animalCriadoId: string | null;
  readonly criadoEm: Date;
}

export interface Doador {
  readonly publicId: string;
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
}

export interface DoacaoDetalhada extends DoacaoRegistro {
  readonly doador: Doador | null;
  readonly analisadoPor: string | null;
}

export interface FiltroDoacoes {
  readonly doadorId?: string;
  readonly status?: StatusDoacaoAnimal;
  readonly de?: Date;
  readonly ate?: Date;
}

export interface CursorDoacoes {
  readonly criadoEm: Date;
  readonly publicId: string;
}

interface Analise {
  readonly em: Date;
  readonly auditoria: EntradaAuditoria;
  readonly notificacao: ConteudoNotificacao;
}

/**
 * Toda transição é condicional ao status lido pelo caso de uso; se outra
 * pessoa mudou antes, lança CONFLITO `DOACAO_ALTERADA`.
 */
export interface RepositorioDoacoesAnimais {
  criar(d: {
    doadorId: string;
    dados: DadosDoacao;
    chavesFotos: readonly string[];
  }): Promise<DoacaoDetalhada>;
  buscar(publicId: string): Promise<DoacaoDetalhada | null>;
  listar(
    filtro: FiltroDoacoes,
    cursor: CursorDoacoes | undefined,
    limite: number,
  ): Promise<DoacaoRegistro[]>;
  aprovar(doacao: DoacaoRegistro, d: Analise): Promise<void>;
  recusar(doacao: DoacaoRegistro, d: Analise & { motivo: string }): Promise<void>;
  /**
   * Numa transação: doação APROVADA → RECEBIDA, cria o Animal (EM_TRATAMENTO,
   * com o publicId dado) e as fotos dele, liga os dois, notifica e audita.
   */
  receber(
    doacao: DoacaoRegistro,
    d: Analise & {
      animalPublicId: string;
      animal: DadosAnimal;
      chavesFotosAnimal: readonly string[];
    },
  ): Promise<void>;
}
