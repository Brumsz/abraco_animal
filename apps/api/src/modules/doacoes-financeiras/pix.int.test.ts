/**
 * Integração + segurança do Pix (seção 9: "testes incluindo manipulação de
 * status pelo cliente") com Postgres e Redis reais e o PSP simulado.
 */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let maria: UsuarioTeste;

interface Doacao {
  id: string;
  valor: string;
  status: string;
  pixCopiaCola: string;
  expiresAt: string;
  paidAt: string | null;
}

function gerar(
  corpo: Record<string, unknown> = { valor: '50.00' },
  opcoes: { token?: string; chave?: string | null } = {},
) {
  const chave = opcoes.chave === undefined ? randomUUID() : opcoes.chave;
  return app.inject({
    method: 'POST',
    url: '/v1/doacoes-financeiras',
    headers: { ...bearer(opcoes.token), ...(chave ? { 'idempotency-key': chave } : {}) },
    payload: corpo,
  });
}

async function gerarOk(corpo?: Record<string, unknown>, token?: string): Promise<Doacao> {
  const r = await gerar(corpo, { ...(token ? { token } : {}) });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<Doacao>();
}

const pspDe = async (id: string) =>
  (await amb.prisma.doacaoFinanceira.findUniqueOrThrow({ where: { publicId: id } })).pspTxId;

const webhook = (corpo: Record<string, unknown>, token: string | null = amb.tokenWebhook) =>
  app.inject({
    method: 'POST',
    url: '/v1/webhooks/asaas',
    headers: token === null ? {} : { 'asaas-access-token': token },
    payload: corpo,
  });

/** Corpo no formato do Asaas, com campos extras como o real manda. */
const evento = (pspTxId: string, id = `evt_${randomUUID()}`, event = 'PAYMENT_RECEIVED') => ({
  id,
  event,
  dateCreated: '2026-11-15 10:00:00',
  payment: { id: pspTxId, status: 'RECEIVED', value: 50, billingType: 'PIX', customer: 'cus_x' },
});

const status = async (id: string) =>
  (await app.inject({ method: 'GET', url: `/v1/doacoes-financeiras/${id}/status` })).json<{
    status: string;
    paidAt: string | null;
  }>();

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  maria = await criarUsuario(app, amb.prisma, { nome: 'Maria Souza' });
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.prisma.$executeRawUnsafe(
    'TRUNCATE doacoes_financeiras, webhook_eventos, notificacoes RESTART IDENTITY CASCADE',
  );
  await amb.redis.flushall();
  amb.emails.comprovantes.length = 0;
});

describe('gerar o Pix', () => {
  it('sem login: devolve copia-e-cola EMV válido, 15 minutos de validade, PENDENTE', async () => {
    const d = await gerarOk({ valor: '50.00', emailDoador: 'ana@teste.org', nomeDoador: 'Ana' });
    expect(d).toMatchObject({ valor: '50.00', status: 'PENDENTE', paidAt: null });
    expect(d.pixCopiaCola.startsWith('000201')).toBe(true);
    const minutos = (Date.parse(d.expiresAt) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);
    // Valor gravado exato no Decimal(10,2).
    const linha = await amb.prisma.doacaoFinanceira.findUniqueOrThrow({
      where: { publicId: d.id },
    });
    expect(linha.valor.toFixed(2)).toBe('50.00');
  });

  it('Idempotency-Key obrigatória (UUID); repetida → a mesma cobrança', async () => {
    expect((await gerar({ valor: '50.00' }, { chave: null })).statusCode).toBe(400);
    expect((await gerar({ valor: '50.00' }, { chave: 'abc' })).statusCode).toBe(400);
    const chave = randomUUID();
    const [a, b] = await Promise.all([
      gerar({ valor: '50.00' }, { chave }),
      gerar({ valor: '50.00' }, { chave }),
    ]);
    expect(a.json<Doacao>().id).toBe(b.json<Doacao>().id);
    expect(await amb.prisma.doacaoFinanceira.count()).toBe(1);
    // Mesma chave, valor diferente → 409.
    expect((await gerar({ valor: '99.00' }, { chave })).statusCode).toBe(409);
  });

  it('o cliente não escolhe status nem nada além do valor → 400', async () => {
    for (const extra of [
      { status: 'CONFIRMADA' },
      { paidAt: new Date().toISOString() },
      { pspTxId: 'x' },
    ]) {
      expect((await gerar({ valor: '50.00', ...extra })).statusCode).toBe(400);
    }
    expect(await amb.prisma.doacaoFinanceira.count()).toBe(0);
  });

  it('valor fora dos limites → 422; formato errado → 400', async () => {
    expect((await gerar({ valor: '4.99' })).statusCode).toBe(422);
    expect((await gerar({ valor: '10000.01' })).statusCode).toBe(422);
    expect((await gerar({ valor: '50' })).statusCode).toBe(400);
    expect((await gerar({ valor: 50 })).statusCode).toBe(400);
  });

  it('logado não envia nome/e-mail; doação vai para o histórico dele', async () => {
    expect(
      (await gerar({ valor: '20.00', nomeDoador: 'X' }, { token: maria.token })).statusCode,
    ).toBe(422);
    const d = await gerarOk({ valor: '20.00', anonima: true }, maria.token);
    const h = await app.inject({
      method: 'GET',
      url: '/v1/me/doacoes-financeiras',
      headers: bearer(maria.token),
    });
    expect(h.json<{ itens: Doacao[] }>().itens.map((i) => i.id)).toEqual([d.id]);
  });

  it('rate limit: 10 por hora (sem login, por IP) → a 11ª é 429', async () => {
    for (let i = 0; i < 10; i++) expect((await gerar()).statusCode).toBe(201);
    expect((await gerar()).statusCode).toBe(429);
  });
});

describe('webhook: autenticação', () => {
  it('sem token ou com token errado → 401 e nada muda', async () => {
    const d = await gerarOk();
    const psp = await pspDe(d.id);
    amb.psp.simularPagamento(psp);
    expect((await webhook(evento(psp), null)).statusCode).toBe(401);
    expect((await webhook(evento(psp), 'token-errado')).statusCode).toBe(401);
    expect((await webhook(evento(psp), `${amb.tokenWebhook}x`)).statusCode).toBe(401);
    // Pago no PSP, mas nenhum dos webhooks sem token chegou a ser processado.
    expect((await amb.prisma.doacaoFinanceira.findFirstOrThrow()).status).toBe('PENDENTE');
    expect(await amb.prisma.webhookEvento.count()).toBe(0);
  });

  it('o token nunca aparece nos logs (campo redigido)', async () => {
    const { CAMPOS_REDIGIDOS } = await import('../../app.js');
    expect(CAMPOS_REDIGIDOS).toContain('req.headers["asaas-access-token"]');
  });
});

describe('manipulação de status (seção 9)', () => {
  it('webhook "PAYMENT_RECEIVED" FORJADO com token válido, mas não pago no PSP → continua PENDENTE', async () => {
    const d = await gerarOk({ valor: '50.00', emailDoador: 'ana@teste.org' });
    const r = await webhook(evento(await pspDe(d.id)));
    expect(r.statusCode).toBe(200);
    expect((await amb.prisma.doacaoFinanceira.findFirstOrThrow()).status).toBe('PENDENTE');
    expect(amb.emails.comprovantes).toHaveLength(0);
  });

  it('o corpo do webhook diz "valor 50" mas o PSP diz outra coisa → vale o PSP', async () => {
    const d = await gerarOk({ valor: '50.00' });
    const psp = await pspDe(d.id);
    amb.psp.simularPagamento(psp);
    // Corpo mentindo status/valor não importa: confirma porque o PSP confirma.
    const corpo = { ...evento(psp), payment: { id: psp, status: 'PENDING', value: 1 } };
    expect((await webhook(corpo)).statusCode).toBe(200);
    expect((await amb.prisma.doacaoFinanceira.findFirstOrThrow()).status).toBe('CONFIRMADA');
  });

  it('"Já paguei" sem ter pago → PENDENTE (o app não confirma sozinho)', async () => {
    const d = await gerarOk();
    for (let i = 0; i < 3; i++) expect((await status(d.id)).status).toBe('PENDENTE');
  });

  it('não existe rota para o app mudar o status', async () => {
    const d = await gerarOk();
    for (const method of ['PATCH', 'PUT'] as const) {
      const r = await app.inject({
        method,
        url: `/v1/doacoes-financeiras/${d.id}`,
        payload: { status: 'CONFIRMADA' },
      });
      expect(r.statusCode).toBe(404);
    }
  });
});

describe('confirmação', () => {
  it('pago no PSP + webhook → CONFIRMADA, notificação para quem está logado e comprovante', async () => {
    const d = await gerarOk({ valor: '75.50' }, maria.token);
    const psp = await pspDe(d.id);
    amb.psp.simularPagamento(psp);

    expect((await webhook(evento(psp))).statusCode).toBe(200);
    const s = await status(d.id);
    expect(s.status).toBe('CONFIRMADA');
    expect(s.paidAt).not.toBeNull();
    const notif = await amb.prisma.notificacao.findFirstOrThrow();
    expect(notif).toMatchObject({ tipo: 'DOACAO_FINANCEIRA_CONFIRMADA', entidadeId: d.id });
    expect(amb.emails.comprovantes).toEqual([
      { para: maria.email, nome: 'Maria Souza', valor: expect.stringContaining('75,50') as string },
    ]);
  });

  it('o mesmo evento 3 vezes (inclusive em paralelo) → uma confirmação, um comprovante', async () => {
    const d = await gerarOk({ valor: '50.00', emailDoador: 'ana@teste.org' });
    const psp = await pspDe(d.id);
    amb.psp.simularPagamento(psp);
    const corpo = evento(psp, 'evt_unico');
    const respostas = await Promise.all([webhook(corpo), webhook(corpo), webhook(corpo)]);
    expect(respostas.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(await amb.prisma.webhookEvento.count()).toBe(1);
    expect(amb.emails.comprovantes).toHaveLength(1);
  });

  it('"Já paguei" depois de pagar confirma antes do webhook; o webhook depois não duplica', async () => {
    const d = await gerarOk({ valor: '50.00', emailDoador: 'ana@teste.org' });
    const psp = await pspDe(d.id);
    amb.psp.simularPagamento(psp);
    expect((await status(d.id)).status).toBe('CONFIRMADA');
    expect((await webhook(evento(psp))).statusCode).toBe(200);
    expect(amb.emails.comprovantes).toHaveLength(1);
  });

  it('eventos de outras cobranças ou de outros tipos → 200 sem efeito', async () => {
    expect((await webhook(evento('pay_de_outro_sistema'))).statusCode).toBe(200);
    expect(
      (await webhook({ id: 'evt_x', event: 'PAYMENT_OVERDUE', payment: { id: 'qualquer' } }))
        .statusCode,
    ).toBe(200);
    expect((await webhook({ id: 'evt_y', event: 'ACCOUNT_STATUS_UPDATED' })).statusCode).toBe(200);
  });

  it('webhook malformado → 400', async () => {
    expect((await webhook({ event: 'PAYMENT_RECEIVED' })).statusCode).toBe(400);
    expect((await webhook({ id: 'x'.repeat(201), event: 'PAYMENT_RECEIVED' })).statusCode).toBe(
      400,
    );
  });

  it('status de doação inexistente → 404', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/v1/doacoes-financeiras/${randomUUID()}/status`,
    });
    expect(r.statusCode).toBe(404);
  });
});
