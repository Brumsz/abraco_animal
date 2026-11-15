/**
 * PSP simulado para desenvolvimento e demonstração (sem conta no Asaas).
 *
 * Gera um "Pix Copia e Cola" com formato válido (BR Code / EMV, com CRC16),
 * então o app consegue desenhar o QR Code — mas a chave é de um domínio
 * `.invalid`, e nenhum banco consegue pagar. O pagamento é simulado pela rota
 * de desenvolvimento, que passa pelo MESMO processamento do webhook real.
 *
 * Nunca é usado em produção (a configuração exige ASAAS_API_KEY).
 */
import { randomUUID } from 'node:crypto';

import type { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import type { ConsultaCobranca, GatewayPix, SituacaoCobranca } from '../application/portas.js';

export const CHAVE_PIX_SIMULADA = 'pix-simulado@abracoanimal.invalid';

const campo = (id: string, valor: string) =>
  `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** CRC16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF), como pede o BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function brCode(valor: Dinheiro, txid: string): string {
  const semCrc =
    campo('00', '01') +
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', CHAVE_PIX_SIMULADA)) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor.paraTexto()) +
    campo('58', 'BR') +
    campo('59', 'ABRACO ANIMAL SIMULADO') +
    campo('60', 'SAO PAULO') +
    campo('62', campo('05', txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25))) +
    '6304';
  return semCrc + crc16(semCrc);
}

export class GatewaySimulado implements GatewayPix {
  private readonly cobrancas = new Map<string, { situacao: SituacaoCobranca; valor: Dinheiro }>();

  criarCobranca(d: { referencia: string; valor: Dinheiro }) {
    const pspTxId = `sim_${randomUUID().replaceAll('-', '')}`;
    this.cobrancas.set(pspTxId, { situacao: 'PENDENTE', valor: d.valor });
    return Promise.resolve({ pspTxId, copiaCola: brCode(d.valor, pspTxId) });
  }

  consultarCobranca(pspTxId: string): Promise<ConsultaCobranca> {
    const c = this.cobrancas.get(pspTxId);
    // A API reiniciou e a memória do simulador se perdeu: trata como PSP indisponível
    // ("Já paguei" responde o que o banco sabe; o webhook devolveria 502).
    if (!c) return Promise.reject(new Error('cobrança simulada desconhecida'));
    return Promise.resolve({ situacao: c.situacao, valor: c.valor });
  }

  cancelarCobranca(pspTxId: string) {
    const c = this.cobrancas.get(pspTxId);
    if (c?.situacao === 'PENDENTE') c.situacao = 'CANCELADA';
    return Promise.resolve();
  }

  /** "O doador pagou" — só a rota de desenvolvimento chama. */
  simularPagamento(pspTxId: string): boolean {
    const c = this.cobrancas.get(pspTxId);
    if (!c || c.situacao === 'CANCELADA') return false;
    c.situacao = 'PAGA';
    return true;
  }
}
