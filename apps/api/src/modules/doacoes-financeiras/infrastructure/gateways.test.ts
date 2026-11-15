/** Adaptadores do PSP sem rede: Asaas com fetch falso e o simulador. */
import { describe, expect, it } from 'vitest';

import { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { dataVencimento, GatewayAsaas, situacaoDoAsaas } from './gateway-asaas.js';
import { brCode, CHAVE_PIX_SIMULADA, crc16, GatewaySimulado } from './gateway-simulado.js';

interface Chamada {
  url: string;
  metodo: string;
  headers: Record<string, string>;
  corpo: unknown;
}

function fetchFalso(respostas: (Response | Error)[]) {
  const chamadas: Chamada[] = [];
  const impl = (url: string, init?: RequestInit) => {
    chamadas.push({
      url,
      metodo: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      corpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    const r = respostas.shift();
    if (!r) return Promise.reject(new Error('sem resposta configurada'));
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  return { impl: impl as unknown as typeof fetch, chamadas };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

const config = {
  url: 'https://api-sandbox.asaas.com/v3',
  apiKey: '$aact_teste',
  clienteId: 'cus_ong',
};

describe('GatewayAsaas', () => {
  it('cria a cobrança PIX no cliente da ONG e busca o copia-e-cola', async () => {
    const f = fetchFalso([
      json({ id: 'pay_123' }),
      json({ payload: '00020101...', encodedImage: 'iVBOR' }),
    ]);
    const g = new GatewayAsaas(config, f.impl);

    const r = await g.criarCobranca({
      referencia: 'doacao-uuid',
      valor: Dinheiro.deTexto('50.00'),
      descricao: 'Doação para a Abraço Animal',
      expiraEm: new Date('2026-11-15T02:30:00Z'),
    });

    expect(r).toEqual({ pspTxId: 'pay_123', copiaCola: '00020101...' });
    expect(f.chamadas[0]).toMatchObject({
      url: 'https://api-sandbox.asaas.com/v3/payments',
      metodo: 'POST',
      corpo: {
        customer: 'cus_ong',
        billingType: 'PIX',
        value: 50,
        // 02:30 UTC = 23:30 do dia 14 em São Paulo.
        dueDate: '2026-11-14',
        externalReference: 'doacao-uuid',
      },
    });
    expect(f.chamadas[0]?.headers).toMatchObject({
      access_token: '$aact_teste',
      'user-agent': 'abraco-animal-api',
    });
    expect(f.chamadas[1]?.url).toBe('https://api-sandbox.asaas.com/v3/payments/pay_123/pixQrCode');
    // Nenhum dado de doador vai para o Asaas.
    expect(JSON.stringify(f.chamadas[0]?.corpo)).not.toMatch(/cpf|email|nome/i);
  });

  it('consulta: mapeia status e valor (em centavos)', async () => {
    const f = fetchFalso([json({ status: 'RECEIVED', value: 19.99 })]);
    const r = await new GatewayAsaas(config, f.impl).consultarCobranca('pay_1');
    expect(r.situacao).toBe('PAGA');
    expect(r.valor.centavos).toBe(1999);
  });

  it('id na URL é codificado (nada de path traversal com um id malicioso)', async () => {
    const f = fetchFalso([json({ status: 'PENDING', value: 5 })]);
    await new GatewayAsaas(config, f.impl).consultarCobranca('../customers');
    expect(f.chamadas[0]?.url).toBe('https://api-sandbox.asaas.com/v3/payments/..%2Fcustomers');
  });

  it.each([
    ['HTTP 500', [json({ errors: [{ description: 'detalhe interno da conta' }] }, 500)]],
    ['HTTP 401 (chave errada)', [json({}, 401)]],
    ['falha de rede / timeout', [new Error('ECONNRESET')]],
    ['resposta sem id', [json({})]],
  ])('%s → PSP_INDISPONIVEL sem repassar o corpo do Asaas', async (_n, respostas) => {
    const f = fetchFalso(respostas);
    const erro = await new GatewayAsaas(config, f.impl)
      .criarCobranca({
        referencia: 'x',
        valor: Dinheiro.deTexto('5.00'),
        descricao: 'x',
        expiraEm: new Date(),
      })
      .catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: 'PSP_INDISPONIVEL', tipo: 'SERVICO_EXTERNO' });
    expect((erro as Error).message).not.toContain('detalhe interno');
  });

  it('consulta com resposta malformada → PSP_INDISPONIVEL', async () => {
    const f = fetchFalso([json({ status: 'RECEIVED', value: '50' })]);
    await expect(new GatewayAsaas(config, f.impl).consultarCobranca('pay_1')).rejects.toMatchObject(
      {
        codigo: 'PSP_INDISPONIVEL',
      },
    );
  });

  it('cancelar usa DELETE', async () => {
    const f = fetchFalso([json({ deleted: true })]);
    await new GatewayAsaas(config, f.impl).cancelarCobranca('pay_9');
    expect(f.chamadas[0]).toMatchObject({ metodo: 'DELETE', url: `${config.url}/payments/pay_9` });
  });

  it.each([
    ['RECEIVED', 'PAGA'],
    ['CONFIRMED', 'PAGA'],
    ['RECEIVED_IN_CASH', 'PAGA'],
    ['PENDING', 'PENDENTE'],
    ['OVERDUE', 'EXPIRADA'],
    ['REFUNDED', 'CANCELADA'],
    ['DELETED', 'CANCELADA'],
    ['QUALQUER_OUTRO', 'CANCELADA'],
  ])('status %s → %s', (asaas, nosso) => {
    expect(situacaoDoAsaas(asaas)).toBe(nosso);
  });

  it('vencimento é o dia em São Paulo', () => {
    expect(dataVencimento(new Date('2026-11-15T12:00:00Z'))).toBe('2026-11-15');
  });
});

describe('GatewaySimulado e BR Code', () => {
  it('CRC16/CCITT-FALSE confere com o vetor de teste padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('copia-e-cola tem formato EMV válido, valor certo e chave .invalid', () => {
    const codigo = brCode(Dinheiro.deTexto('50.00'), 'sim_abc123');
    expect(codigo.startsWith('000201')).toBe(true);
    expect(codigo).toContain('540550.00');
    expect(codigo).toContain(CHAVE_PIX_SIMULADA);
    // Os 4 últimos caracteres são o CRC de tudo antes deles.
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
  });

  it('fluxo simulado: pendente → pago; cancelada não pode ser paga', async () => {
    const g = new GatewaySimulado();
    const a = await g.criarCobranca({ referencia: 'r', valor: Dinheiro.deTexto('20.00') });
    expect((await g.consultarCobranca(a.pspTxId)).situacao).toBe('PENDENTE');
    expect(g.simularPagamento(a.pspTxId)).toBe(true);
    expect(await g.consultarCobranca(a.pspTxId)).toMatchObject({ situacao: 'PAGA' });

    const b = await g.criarCobranca({ referencia: 'r', valor: Dinheiro.deTexto('20.00') });
    await g.cancelarCobranca(b.pspTxId);
    expect(g.simularPagamento(b.pspTxId)).toBe(false);
    expect(g.simularPagamento('inexistente')).toBe(false);
    await expect(g.consultarCobranca('inexistente')).rejects.toThrow();
  });
});
