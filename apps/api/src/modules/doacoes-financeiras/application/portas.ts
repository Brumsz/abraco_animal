import type { StatusDoacaoFinanceira } from '@abraco/shared';

import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { Dinheiro } from '../../../shared/dominio/dinheiro.js';

// ── PSP (Asaas real ou simulado) ─────────────────────────────────────────

export type SituacaoCobranca = 'PENDENTE' | 'PAGA' | 'EXPIRADA' | 'CANCELADA';

export interface ConsultaCobranca {
  readonly situacao: SituacaoCobranca;
  /** Valor da cobrança SEGUNDO O PSP (conferido com o nosso antes de confirmar). */
  readonly valor: Dinheiro;
}

/**
 * Porta do PSP. Falhas de rede/HTTP viram ErroDominio `SERVICO_EXTERNO`
 * (502), sem repassar o corpo da resposta do PSP.
 */
export interface GatewayPix {
  criarCobranca(d: {
    /** publicId da doação: vai como referência externa no PSP. */
    referencia: string;
    valor: Dinheiro;
    descricao: string;
    expiraEm: Date;
  }): Promise<{ pspTxId: string; copiaCola: string }>;
  consultarCobranca(pspTxId: string): Promise<ConsultaCobranca>;
  cancelarCobranca(pspTxId: string): Promise<void>;
}

// ── Repositório ──────────────────────────────────────────────────────────

export interface DoacaoFinanceiraRegistro {
  readonly id: number;
  readonly publicId: string;
  /** publicId do usuário logado que doou; `null` = sem login. */
  readonly usuarioId: string | null;
  readonly anonima: boolean;
  readonly nomeDoador: string | null;
  readonly emailDoador: string | null;
  readonly valor: Dinheiro;
  readonly status: StatusDoacaoFinanceira;
  readonly pixCopiaCola: string;
  readonly pspTxId: string;
  readonly idempotencyKey: string;
  readonly expiraEm: Date;
  readonly pagoEm: Date | null;
  readonly criadoEm: Date;
}

export interface NovaDoacaoFinanceira {
  readonly publicId: string;
  readonly usuarioId: string | null;
  readonly anonima: boolean;
  readonly nomeDoador: string | null;
  readonly emailDoador: string | null;
  readonly valor: Dinheiro;
  readonly pixCopiaCola: string;
  readonly pspTxId: string;
  readonly idempotencyKey: string;
  readonly expiraEm: Date;
}

export interface EventoWebhook {
  readonly provedor: 'ASAAS';
  readonly eventoId: string;
  readonly tipo: string;
}

export interface CursorDoacoesFinanceiras {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export interface RepositorioDoacoesFinanceiras {
  /** Lança CONFLITO `IDEMPOTENCIA_EM_USO` se a Idempotency-Key já existe (corrida). */
  criar(d: NovaDoacaoFinanceira): Promise<DoacaoFinanceiraRegistro>;
  buscar(publicId: string): Promise<DoacaoFinanceiraRegistro | null>;
  buscarPorIdempotencia(chave: string): Promise<DoacaoFinanceiraRegistro | null>;
  buscarPorPspTxId(pspTxId: string): Promise<DoacaoFinanceiraRegistro | null>;
  listarDoUsuario(
    usuarioId: string,
    cursor: CursorDoacoesFinanceiras | undefined,
    limite: number,
  ): Promise<DoacaoFinanceiraRegistro[]>;
  /** PENDENTE → EXPIRADA (condicional; não mexe em CONFIRMADA). */
  marcarExpirada(doacao: DoacaoFinanceiraRegistro): Promise<void>;
  /**
   * Numa transação: registra o evento (se houver) e marca CONFIRMADA. Devolve
   * `duplicado` se o evento já tinha sido processado, e o destinatário do
   * comprovante quando a confirmação aconteceu agora.
   */
  confirmar(
    doacao: DoacaoFinanceiraRegistro,
    d: { pagoEm: Date; evento?: EventoWebhook; notificacao: ConteudoNotificacao },
  ): Promise<
    | {
        readonly resultado: 'confirmada';
        readonly comprovante: { email: string; nome: string } | null;
      }
    | { readonly resultado: 'duplicado' | 'ja_confirmada' }
  >;
  /** Guarda um evento que não confirma nada; `false` = já existia. */
  registrarEvento(evento: EventoWebhook): Promise<boolean>;
}

export interface EmailsDoacaoFinanceira {
  comprovanteDoacao(d: { para: string; nome: string; valor: string; data: Date }): Promise<void>;
}
