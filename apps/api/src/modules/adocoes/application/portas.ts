import type { StatusAdocao } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { AnimalRegistro, AnimalResumoRegistro } from '../../animais/application/portas.js';
import type { Triagem } from '../domain/adocao.js';

export interface EnderecoSolicitante {
  readonly cep: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string | null;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
}

/** Dados de contato que o admin precisa para analisar (sem CPF: minimização, LGPD). */
export interface Solicitante {
  readonly publicId: string;
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly endereco: EnderecoSolicitante;
}

export interface AdocaoRegistro extends Triagem {
  readonly id: number;
  readonly publicId: string;
  readonly status: StatusAdocao;
  /** publicId do solicitante; `null` depois da anonimização (LGPD). */
  readonly solicitanteId: string | null;
  readonly animal: AnimalResumoRegistro;
  readonly termoAceitoEm: Date;
  readonly analisadoEm: Date | null;
  readonly motivoRecusa: string | null;
  readonly recusaAutomatica: boolean;
  readonly criadoEm: Date;
}

export interface AdocaoDetalhada extends AdocaoRegistro {
  readonly solicitante: Solicitante | null;
  /** Nome de quem analisou. */
  readonly analisadoPor: string | null;
}

export interface FiltroAdocoes {
  readonly solicitanteId?: string;
  readonly status?: StatusAdocao;
  readonly animalId?: string;
  /** Intervalo de criadoEm: [de, ate). */
  readonly de?: Date;
  readonly ate?: Date;
}

export interface CursorAdocoes {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export interface Encerrada {
  readonly publicId: string;
  readonly solicitante: { readonly nome: string; readonly email: string } | null;
}

export interface RepositorioAdocoes {
  /**
   * Cria a solicitação PENDENTE. Lança CONFLITO `ADOCAO_PENDENTE_EXISTENTE`
   * se já houver uma pendente do mesmo usuário para o animal (índice parcial).
   */
  criar(d: {
    solicitanteId: string;
    animal: AnimalRegistro;
    triagem: Triagem;
    termoAceitoEm: Date;
  }): Promise<AdocaoDetalhada>;
  buscar(publicId: string): Promise<AdocaoDetalhada | null>;
  listar(
    filtro: FiltroAdocoes,
    cursor: CursorAdocoes | undefined,
    limite: number,
  ): Promise<AdocaoRegistro[]>;
  /**
   * Numa transação: animal DISPONIVEL → ADOTADO, esta adoção → APROVADA, as
   * demais PENDENTE do animal → RECUSADA (recusaAutomatica), notificações e
   * auditoria (com `encerradas` = ids recusados automaticamente acrescentado
   * ao detalhe). Lança CONFLITO se o animal deixou de estar disponível ou a
   * adoção deixou de estar pendente no meio do caminho.
   */
  aprovar(
    adocao: AdocaoRegistro,
    d: {
      em: Date;
      auditoria: EntradaAuditoria;
      notificacaoAprovada: ConteudoNotificacao;
      notificacaoEncerrada: ConteudoNotificacao;
      motivoEncerrada: string;
    },
  ): Promise<Encerrada[]>;
  recusar(
    adocao: AdocaoRegistro,
    d: {
      em: Date;
      motivo: string;
      auditoria: EntradaAuditoria;
      notificacao: ConteudoNotificacao;
    },
  ): Promise<void>;
}
