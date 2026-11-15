/**
 * Adaptador do Asaas (API v3). Docs: https://docs.asaas.com
 *
 * - Autenticação pelo header `access_token`.
 * - Cobrança Pix: POST /payments (billingType PIX) + GET /payments/{id}/pixQrCode.
 * - O Asaas exige um cliente em toda cobrança: usamos UM cliente da ONG
 *   (ASAAS_CLIENTE_ID) para todas as doações. Assim o doador não precisa
 *   informar CPF, e nenhum dado pessoal do doador vai para o Asaas.
 */
import { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { ConsultaCobranca, GatewayPix, SituacaoCobranca } from '../application/portas.js';

export interface ConfigAsaas {
  readonly url: string;
  readonly apiKey: string;
  readonly clienteId: string;
  readonly timeoutMs?: number;
}

const indisponivel = () =>
  new ErroDominio(
    'SERVICO_EXTERNO',
    'PSP_INDISPONIVEL',
    'Não foi possível falar com o serviço de pagamento. Tente novamente em instantes.',
  );

/** Status do Asaas → situação do domínio. */
export function situacaoDoAsaas(status: string): SituacaoCobranca {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'PAGA';
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS':
      return 'PENDENTE';
    case 'OVERDUE':
      return 'EXPIRADA';
    default:
      // REFUNDED, DELETED, CHARGEBACK…: não conta como pago.
      return 'CANCELADA';
  }
}

/** Data de vencimento no fuso de São Paulo (o Asaas trabalha com dia, não hora). */
export function dataVencimento(expiraEm: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(expiraEm);
}

export class GatewayAsaas implements GatewayPix {
  constructor(
    private readonly config: ConfigAsaas,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    let resposta: Response;
    try {
      resposta = await this.fetchImpl(`${this.config.url}${caminho}`, {
        method: metodo,
        headers: {
          access_token: this.config.apiKey,
          'content-type': 'application/json',
          // Identificação genérica do cliente HTTP (sem dados da ONG ou de usuários).
          'user-agent': 'abraco-animal-api',
        },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch {
      throw indisponivel();
    }
    // O corpo de erro do Asaas não é repassado: pode conter dados da conta.
    if (!resposta.ok) throw indisponivel();
    return (await resposta.json()) as T;
  }

  async criarCobranca(d: {
    referencia: string;
    valor: Dinheiro;
    descricao: string;
    expiraEm: Date;
  }): Promise<{ pspTxId: string; copiaCola: string }> {
    const cobranca = await this.chamar<{ id?: unknown }>('POST', '/payments', {
      customer: this.config.clienteId,
      billingType: 'PIX',
      value: d.valor.paraReais(),
      dueDate: dataVencimento(d.expiraEm),
      description: d.descricao,
      externalReference: d.referencia,
    });
    if (typeof cobranca.id !== 'string') throw indisponivel();

    const qr = await this.chamar<{ payload?: unknown }>(
      'GET',
      `/payments/${encodeURIComponent(cobranca.id)}/pixQrCode`,
    );
    if (typeof qr.payload !== 'string' || qr.payload.length === 0) throw indisponivel();
    return { pspTxId: cobranca.id, copiaCola: qr.payload };
  }

  async consultarCobranca(pspTxId: string): Promise<ConsultaCobranca> {
    const c = await this.chamar<{ status?: unknown; value?: unknown }>(
      'GET',
      `/payments/${encodeURIComponent(pspTxId)}`,
    );
    if (typeof c.status !== 'string' || typeof c.value !== 'number') throw indisponivel();
    return { situacao: situacaoDoAsaas(c.status), valor: Dinheiro.deReais(c.value) };
  }

  async cancelarCobranca(pspTxId: string): Promise<void> {
    await this.chamar('DELETE', `/payments/${encodeURIComponent(pspTxId)}`);
  }
}
