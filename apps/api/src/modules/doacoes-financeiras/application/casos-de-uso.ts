/**
 * Casos de uso da doação via Pix. Regra central (seção 6): o status só vira
 * CONFIRMADA depois de reconsultar o PSP — nem o app nem o corpo do webhook
 * são fonte de verdade.
 */
import { randomUUID } from 'node:crypto';

import type { StatusDoacaoFinanceira } from '@abraco/shared';

import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import type { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  exigirValorIgual,
  statusEfetivo,
  validarDoador,
  validarValor,
} from '../domain/doacao-financeira.js';
import type {
  CursorDoacoesFinanceiras,
  DoacaoFinanceiraRegistro,
  EmailsDoacaoFinanceira,
  GatewayPix,
  RepositorioDoacoesFinanceiras,
} from './portas.js';

export interface DepsPix {
  readonly doacoes: RepositorioDoacoesFinanceiras;
  readonly gateway: GatewayPix;
  readonly emails: EmailsDoacaoFinanceira;
  readonly relogio: Relogio;
  readonly expiracaoMinutos: number;
  readonly gerarId?: () => string;
  /** Falhas que não podem derrubar a operação (e-mail, cancelamento no PSP). Só o tipo vai para o log. */
  readonly aoFalhar?: (contexto: string, erro: unknown) => void;
}

export interface DoacaoFinanceiraSaida {
  readonly id: string;
  readonly valor: string;
  readonly status: StatusDoacaoFinanceira;
  readonly anonima: boolean;
  readonly pixCopiaCola: string;
  readonly expiresAt: Date;
  readonly paidAt: Date | null;
  readonly criadoEm: Date;
}

const saida = (d: DoacaoFinanceiraRegistro, agora: Date): DoacaoFinanceiraSaida => ({
  id: d.publicId,
  valor: d.valor.paraTexto(),
  status: statusEfetivo(d.status, d.expiraEm, agora),
  anonima: d.anonima,
  pixCopiaCola: d.pixCopiaCola,
  expiresAt: d.expiraEm,
  paidAt: d.pagoEm,
  criadoEm: d.criadoEm,
});

const notificacaoConfirmada = (valor: Dinheiro): ConteudoNotificacao => ({
  tipo: 'DOACAO_FINANCEIRA_CONFIRMADA',
  titulo: 'Recebemos sua doação 💛',
  corpo: `Sua doação de ${valor.formatado()} chegou. Obrigado por ajudar os animais da Abraço Animal!`,
});

async function semFalhar(deps: DepsPix, contexto: string, acao: () => Promise<void>) {
  try {
    await acao();
  } catch (erro) {
    deps.aoFalhar?.(contexto, erro);
  }
}

/**
 * Confirma no banco (idempotente) e envia o comprovante. Usado pelo webhook e
 * pelo botão "Já paguei" — sempre DEPOIS de o PSP dizer que foi pago.
 */
async function confirmarPagamento(
  deps: DepsPix,
  doacao: DoacaoFinanceiraRegistro,
  evento?: { eventoId: string; tipo: string },
): Promise<'confirmada' | 'duplicado' | 'ja_confirmada'> {
  const pagoEm = deps.relogio.agora();
  const r = await deps.doacoes.confirmar(doacao, {
    pagoEm,
    notificacao: notificacaoConfirmada(doacao.valor),
    ...(evento ? { evento: { provedor: 'ASAAS', ...evento } } : {}),
  });
  if (r.resultado === 'confirmada' && r.comprovante) {
    const { email, nome } = r.comprovante;
    await semFalhar(deps, 'comprovante', () =>
      deps.emails.comprovanteDoacao({
        para: email,
        nome,
        valor: doacao.valor.formatado(),
        data: pagoEm,
      }),
    );
  }
  return r.resultado;
}

const naoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada');

// ── Gerar o Pix ──────────────────────────────────────────────────────────

export class GerarPix {
  constructor(private readonly deps: DepsPix) {}

  async executar(entrada: {
    ator?: Ator;
    idempotencyKey: string;
    valor: string;
    anonima: boolean;
    nomeDoador?: string;
    emailDoador?: string;
  }): Promise<DoacaoFinanceiraSaida> {
    const valor = validarValor(entrada.valor);
    const doador = validarDoador(entrada.ator !== undefined, entrada);
    const usuarioId = entrada.ator?.id ?? null;
    const agora = this.deps.relogio.agora();

    // Idempotency-Key repetida (toque duplo, retry de rede) → a MESMA cobrança.
    const existente = await this.deps.doacoes.buscarPorIdempotencia(entrada.idempotencyKey);
    if (existente)
      return saida(this.mesmaRequisicao(existente, usuarioId, valor, entrada.anonima), agora);

    const publicId = (this.deps.gerarId ?? randomUUID)();
    const expiraEm = new Date(agora.getTime() + this.deps.expiracaoMinutos * 60_000);
    const cobranca = await this.deps.gateway.criarCobranca({
      referencia: publicId,
      valor,
      descricao: 'Doação para a Abraço Animal',
      expiraEm,
    });

    try {
      const criada = await this.deps.doacoes.criar({
        publicId,
        usuarioId,
        anonima: entrada.anonima,
        ...doador,
        valor,
        pixCopiaCola: cobranca.copiaCola,
        pspTxId: cobranca.pspTxId,
        idempotencyKey: entrada.idempotencyKey,
        expiraEm,
      });
      return saida(criada, agora);
    } catch (erro) {
      // A cobrança deste pedido não será usada: cancela no PSP para ninguém pagá-la.
      await semFalhar(this.deps, 'cancelar-cobranca', () =>
        this.deps.gateway.cancelarCobranca(cobranca.pspTxId),
      );
      // Duas requisições simultâneas com a mesma chave: devolve a que venceu.
      if (erro instanceof ErroDominio && erro.codigo === 'IDEMPOTENCIA_EM_USO') {
        const vencedora = await this.deps.doacoes.buscarPorIdempotencia(entrada.idempotencyKey);
        if (vencedora) {
          return saida(this.mesmaRequisicao(vencedora, usuarioId, valor, entrada.anonima), agora);
        }
      }
      throw erro;
    }
  }

  /** A chave só vale para a mesma requisição (mesmo dono, valor e anonimato). */
  private mesmaRequisicao(
    d: DoacaoFinanceiraRegistro,
    usuarioId: string | null,
    valor: Dinheiro,
    anonima: boolean,
  ): DoacaoFinanceiraRegistro {
    if (d.usuarioId !== usuarioId || !d.valor.igual(valor) || d.anonima !== anonima) {
      throw new ErroDominio(
        'CONFLITO',
        'IDEMPOTENCY_KEY_REUSADA',
        'Esta Idempotency-Key já foi usada em outra doação. Gere uma nova.',
      );
    }
    return d;
  }
}

// ── "Já paguei" ──────────────────────────────────────────────────────────

export class ConsultarStatusPix {
  constructor(private readonly deps: DepsPix) {}

  async executar(entrada: { id: string }): Promise<{
    id: string;
    status: StatusDoacaoFinanceira;
    paidAt: Date | null;
  }> {
    const d = await this.deps.doacoes.buscar(entrada.id);
    if (!d) throw naoEncontrada();
    const resposta = (status: StatusDoacaoFinanceira, paidAt: Date | null) => ({
      id: d.publicId,
      status,
      paidAt,
    });
    if (d.status === 'CONFIRMADA') return resposta('CONFIRMADA', d.pagoEm);

    let consulta;
    try {
      consulta = await this.deps.gateway.consultarCobranca(d.pspTxId);
    } catch (erro) {
      // PSP fora do ar: responde com o que o banco sabe (o webhook ainda pode chegar).
      this.deps.aoFalhar?.('consultar-cobranca', erro);
      return resposta(statusEfetivo(d.status, d.expiraEm, this.deps.relogio.agora()), null);
    }

    if (consulta.situacao === 'PAGA' && consulta.valor.igual(d.valor)) {
      await confirmarPagamento(this.deps, d);
      const atual = await this.deps.doacoes.buscar(d.publicId);
      return resposta('CONFIRMADA', atual?.pagoEm ?? null);
    }

    const status = statusEfetivo(d.status, d.expiraEm, this.deps.relogio.agora());
    if (status === 'EXPIRADA' && d.status === 'PENDENTE') {
      await this.deps.doacoes.marcarExpirada(d);
      // Ninguém mais paga um QR vencido.
      await semFalhar(this.deps, 'cancelar-cobranca', () =>
        this.deps.gateway.cancelarCobranca(d.pspTxId),
      );
    }
    return resposta(status, null);
  }
}

// ── Webhook do PSP ───────────────────────────────────────────────────────

/** Eventos do Asaas que indicam pagamento (os demais só são registrados). */
export const EVENTOS_DE_PAGAMENTO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);

export type ResultadoWebhook =
  | 'confirmada'
  | 'duplicado'
  | 'ja_confirmada'
  | 'ignorado'
  | 'nao_pago_no_psp'
  | 'valor_divergente'
  | 'cobranca_desconhecida';

export class ProcessarWebhookPix {
  constructor(private readonly deps: DepsPix) {}

  /**
   * O corpo do webhook só fornece QUAL cobrança olhar. Se o PSP disser que não
   * foi paga, nada muda — mesmo com o token certo (token vazado, evento forjado).
   */
  async executar(entrada: {
    eventoId: string;
    tipo: string;
    pspTxId: string | undefined;
  }): Promise<ResultadoWebhook> {
    const evento = { provedor: 'ASAAS' as const, eventoId: entrada.eventoId, tipo: entrada.tipo };
    if (!EVENTOS_DE_PAGAMENTO.has(entrada.tipo) || !entrada.pspTxId) {
      return (await this.deps.doacoes.registrarEvento(evento)) ? 'ignorado' : 'duplicado';
    }

    const d = await this.deps.doacoes.buscarPorPspTxId(entrada.pspTxId);
    // Outra cobrança da mesma conta Asaas (não é doação do app).
    if (!d) return 'cobranca_desconhecida';

    // Falha aqui sobe como 502: o Asaas reenvia o webhook mais tarde.
    const consulta = await this.deps.gateway.consultarCobranca(d.pspTxId);
    if (consulta.situacao !== 'PAGA') return 'nao_pago_no_psp';

    try {
      exigirValorIgual(d.valor, consulta.valor);
    } catch (erro) {
      this.deps.aoFalhar?.('valor-divergente', erro);
      await this.deps.doacoes.registrarEvento(evento);
      return 'valor_divergente';
    }
    return confirmarPagamento(this.deps, d, { eventoId: entrada.eventoId, tipo: entrada.tipo });
  }
}

// ── Histórico ────────────────────────────────────────────────────────────

export const LIMITE_PAGINA_PIX = { padrao: 20, maximo: 50 } as const;

export class ListarMinhasDoacoesFinanceiras {
  constructor(private readonly deps: DepsPix) {}

  async executar(entrada: { ator: Ator; cursor?: CursorDoacoesFinanceiras; limite?: number }) {
    const n = Math.min(
      Math.max(Math.trunc(entrada.limite ?? LIMITE_PAGINA_PIX.padrao), 1),
      LIMITE_PAGINA_PIX.maximo,
    );
    const registros = await this.deps.doacoes.listarDoUsuario(
      entrada.ator.id,
      entrada.cursor,
      n + 1,
    );
    const itens = registros.slice(0, n);
    const ultimo = itens.at(-1);
    const agora = this.deps.relogio.agora();
    return {
      itens: itens.map((d) => saida(d, agora)),
      proximoCursor:
        registros.length > n && ultimo
          ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
          : null,
    };
  }
}
