import { beforeEach, describe, expect, it } from 'vitest';

import { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import {
  ConsultarStatusPix,
  GerarPix,
  ListarMinhasDoacoesFinanceiras,
  ProcessarWebhookPix,
  type DepsPix,
} from './casos-de-uso.js';
import { ComprovantesFake, DoacoesPixFake, GatewayFake, novaChave } from './testes/fakes.js';

const MARIA: Ator = { id: '00000000-0000-4000-8000-00000000000a', role: 'USUARIO' };
const JOAO: Ator = { id: '00000000-0000-4000-8000-00000000000b', role: 'USUARIO' };

let doacoes: DoacoesPixFake;
let gateway: GatewayFake;
let emails: ComprovantesFake;
let relogio: RelogioFake;
let falhas: string[];
let deps: DepsPix;

beforeEach(() => {
  doacoes = new DoacoesPixFake();
  gateway = new GatewayFake();
  emails = new ComprovantesFake();
  relogio = new RelogioFake();
  falhas = [];
  deps = {
    doacoes,
    gateway,
    emails,
    relogio,
    expiracaoMinutos: 15,
    aoFalhar: (contexto) => falhas.push(contexto),
  };
  doacoes.usuarios.set(MARIA.id, { nome: 'Maria Souza', email: 'maria@teste.org' });
});

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return 'SEM_ERRO';
}

const gerar = (extra: Partial<Parameters<GerarPix['executar']>[0]> = {}) =>
  new GerarPix(deps).executar({
    idempotencyKey: novaChave(),
    valor: '50.00',
    anonima: false,
    ...extra,
  });

const webhook = (pspTxId: string, eventoId = `evt_${novaChave()}`, tipo = 'PAYMENT_RECEIVED') =>
  new ProcessarWebhookPix(deps).executar({ eventoId, tipo, pspTxId });

const pspDe = (id: string) => doacoes.lista.find((d) => d.publicId === id)?.pspTxId ?? '';

describe('GerarPix', () => {
  it('cria a cobrança no PSP e devolve o copia-e-cola com validade de 15 minutos', async () => {
    const r = await gerar({ ator: MARIA });
    expect(r).toMatchObject({ valor: '50.00', status: 'PENDENTE', paidAt: null });
    expect(r.pixCopiaCola).toContain('pay_1');
    expect(r.expiresAt.getTime() - relogio.agora().getTime()).toBe(15 * 60_000);
    // A referência no PSP é o id público da doação.
    expect(gateway.cobrancas.get('pay_1')?.referencia).toBe(r.id);
  });

  it('mesma Idempotency-Key → a MESMA cobrança, sem criar outra no PSP', async () => {
    const chave = novaChave();
    const a = await gerar({ idempotencyKey: chave });
    const b = await gerar({ idempotencyKey: chave });
    expect(b.id).toBe(a.id);
    expect(gateway.cobrancas.size).toBe(1);
  });

  it('mesma chave com outro valor, outro dono ou outro anonimato → conflito', async () => {
    const chave = novaChave();
    await gerar({ idempotencyKey: chave, ator: MARIA });
    expect(await codigoDe(gerar({ idempotencyKey: chave, ator: MARIA, valor: '60.00' }))).toBe(
      'IDEMPOTENCY_KEY_REUSADA',
    );
    expect(await codigoDe(gerar({ idempotencyKey: chave, ator: JOAO }))).toBe(
      'IDEMPOTENCY_KEY_REUSADA',
    );
    expect(await codigoDe(gerar({ idempotencyKey: chave }))).toBe('IDEMPOTENCY_KEY_REUSADA');
    expect(await codigoDe(gerar({ idempotencyKey: chave, ator: MARIA, anonima: true }))).toBe(
      'IDEMPOTENCY_KEY_REUSADA',
    );
  });

  it('corrida com a mesma chave: cancela a cobrança perdedora no PSP e devolve a vencedora', async () => {
    const chave = novaChave();
    const vencedora = await gerar({ idempotencyKey: chave });
    // Simula a segunda requisição que não viu a primeira na busca inicial.
    const original = doacoes.buscarPorIdempotencia.bind(doacoes);
    let primeira = true;
    doacoes.buscarPorIdempotencia = (c) => {
      if (primeira) {
        primeira = false;
        return Promise.resolve(null);
      }
      return original(c);
    };
    const r = await gerar({ idempotencyKey: chave });
    expect(r.id).toBe(vencedora.id);
    expect(gateway.canceladas).toEqual(['pay_2']);
  });

  it('banco falhou depois de criar a cobrança → cancela no PSP', async () => {
    doacoes.falharCriacao = new ErroDominio('CONFLITO', 'OUTRO', 'x');
    expect(await codigoDe(gerar())).toBe('OUTRO');
    expect(gateway.canceladas).toEqual(['pay_1']);
  });

  it('PSP fora do ar → erro de serviço externo, nada gravado', async () => {
    gateway.falharCriacao = true;
    expect(await codigoDe(gerar())).toBe('PSP_INDISPONIVEL');
    expect(doacoes.lista).toHaveLength(0);
  });

  it.each([
    ['4.99', 'VALOR_ABAIXO_DO_MINIMO'],
    ['10000.01', 'VALOR_ACIMA_DO_MAXIMO'],
    ['50', 'VALOR_INVALIDO'],
    ['-5.00', 'VALOR_INVALIDO'],
  ])('valor %s → %s', async (valor, codigo) => {
    expect(await codigoDe(gerar({ valor }))).toBe(codigo);
    expect(gateway.cobrancas.size).toBe(0);
  });

  it('limites aceitos: R$ 5,00 e R$ 10.000,00', async () => {
    expect((await gerar({ valor: '5.00' })).valor).toBe('5.00');
    expect((await gerar({ valor: '10000.00' })).valor).toBe('10000.00');
  });

  it('logado não manda nome/e-mail (vêm da conta); sem login são opcionais', async () => {
    expect(await codigoDe(gerar({ ator: MARIA, nomeDoador: 'Outra Pessoa' }))).toBe(
      'DADOS_DO_DOADOR_INDEVIDOS',
    );
    expect(await codigoDe(gerar({ emailDoador: 'invalido' }))).toBe('EMAIL_INVALIDO');
    await gerar({ nomeDoador: '  Ana  ', emailDoador: ' ANA@Teste.org ' });
    expect(doacoes.lista[0]).toMatchObject({ nomeDoador: 'Ana', emailDoador: 'ana@teste.org' });
  });
});

describe('webhook: nunca confiar no corpo, sempre reconsultar o PSP', () => {
  it('pagamento confirmado no PSP → CONFIRMADA, notificação e comprovante', async () => {
    const { id } = await gerar({ ator: MARIA });
    gateway.pagar(pspDe(id));

    expect(await webhook(pspDe(id))).toBe('confirmada');
    const d = doacoes.lista[0];
    expect(d).toMatchObject({ status: 'CONFIRMADA', pagoEm: relogio.agora() });
    expect(d?.notificacoes.map((n) => n.tipo)).toEqual(['DOACAO_FINANCEIRA_CONFIRMADA']);
    expect(emails.enviados).toEqual([
      {
        para: 'maria@teste.org',
        nome: 'Maria Souza',
        valor: expect.stringContaining('50,00') as string,
      },
    ]);
  });

  it('evento de pagamento FORJADO (token certo, mas o PSP diz que não pagou) → nada muda', async () => {
    const { id } = await gerar({ ator: MARIA });
    expect(await webhook(pspDe(id))).toBe('nao_pago_no_psp');
    expect(doacoes.lista[0]?.status).toBe('PENDENTE');
    expect(emails.enviados).toHaveLength(0);
    expect(gateway.consultas).toBe(1);
  });

  it('o mesmo evento duas vezes → processado uma vez só (um comprovante)', async () => {
    const { id } = await gerar({ ator: MARIA });
    gateway.pagar(pspDe(id));
    expect(await webhook(pspDe(id), 'evt_1')).toBe('confirmada');
    expect(await webhook(pspDe(id), 'evt_1')).toBe('duplicado');
    // RECEIVED e CONFIRMED (eventos diferentes) para o mesmo pagamento: confirma uma vez.
    expect(await webhook(pspDe(id), 'evt_2', 'PAYMENT_CONFIRMED')).toBe('ja_confirmada');
    expect(emails.enviados).toHaveLength(1);
  });

  it('valor pago diferente do cobrado → não confirma (análise manual)', async () => {
    const { id } = await gerar({ valor: '50.00' });
    gateway.pagar(pspDe(id));
    gateway.valorInformado = Dinheiro.deTexto('0.01');
    expect(await webhook(pspDe(id))).toBe('valor_divergente');
    expect(doacoes.lista[0]?.status).toBe('PENDENTE');
    expect(falhas).toEqual(['valor-divergente']);
  });

  it('pagamento depois de expirar é aceito (o dinheiro entrou)', async () => {
    const { id } = await gerar();
    relogio.avancar(20 * 60_000);
    await new ConsultarStatusPix(deps).executar({ id });
    expect(doacoes.lista[0]?.status).toBe('EXPIRADA');
    gateway.cobrancas.get(pspDe(id))!.situacao = 'PAGA';
    expect(await webhook(pspDe(id))).toBe('confirmada');
    expect(doacoes.lista[0]?.status).toBe('CONFIRMADA');
  });

  it('eventos que não são de pagamento só são registrados', async () => {
    const { id } = await gerar();
    expect(await webhook(pspDe(id), 'evt_x', 'PAYMENT_OVERDUE')).toBe('ignorado');
    expect(await webhook(pspDe(id), 'evt_x', 'PAYMENT_OVERDUE')).toBe('duplicado');
    expect(gateway.consultas).toBe(0);
  });

  it('cobrança que não é do app → ignorada sem consultar o PSP', async () => {
    expect(await webhook('pay_de_outro_sistema')).toBe('cobranca_desconhecida');
    expect(gateway.consultas).toBe(0);
  });

  it('PSP fora do ar no webhook → erro (o Asaas reenvia depois) e o evento NÃO fica registrado', async () => {
    const { id } = await gerar();
    gateway.pagar(pspDe(id));
    gateway.falharConsulta = true;
    expect(await codigoDe(webhook(pspDe(id), 'evt_1'))).toBe('PSP_INDISPONIVEL');
    gateway.falharConsulta = false;
    expect(await webhook(pspDe(id), 'evt_1')).toBe('confirmada');
  });

  it('doação sem login com e-mail recebe comprovante; sem e-mail, não', async () => {
    const a = await gerar({ emailDoador: 'ana@teste.org', nomeDoador: 'Ana' });
    const b = await gerar();
    gateway.pagar(pspDe(a.id));
    gateway.pagar(pspDe(b.id));
    await webhook(pspDe(a.id));
    await webhook(pspDe(b.id));
    expect(emails.enviados.map((e) => e.para)).toEqual(['ana@teste.org']);
  });
});

describe('"Já paguei" (status)', () => {
  it('não pago → continua PENDENTE (o app não consegue confirmar sozinho)', async () => {
    const { id } = await gerar();
    expect((await new ConsultarStatusPix(deps).executar({ id })).status).toBe('PENDENTE');
    expect(doacoes.lista[0]?.status).toBe('PENDENTE');
  });

  it('pago no PSP antes do webhook chegar → confirma na hora', async () => {
    const { id } = await gerar({ ator: MARIA });
    gateway.pagar(pspDe(id));
    const r = await new ConsultarStatusPix(deps).executar({ id });
    expect(r).toEqual({ id, status: 'CONFIRMADA', paidAt: relogio.agora() });
    // O webhook que chega depois não duplica nada.
    expect(await webhook(pspDe(id))).toBe('ja_confirmada');
    expect(emails.enviados).toHaveLength(1);
  });

  it('vencido → EXPIRADA e a cobrança é cancelada no PSP', async () => {
    const { id } = await gerar();
    relogio.avancar(15 * 60_000);
    expect((await new ConsultarStatusPix(deps).executar({ id })).status).toBe('EXPIRADA');
    expect(gateway.canceladas).toEqual([pspDe(id)]);
  });

  it('PSP fora do ar → responde o que o banco sabe, sem erro para o app', async () => {
    const { id } = await gerar();
    gateway.falharConsulta = true;
    expect((await new ConsultarStatusPix(deps).executar({ id })).status).toBe('PENDENTE');
    expect(falhas).toEqual(['consultar-cobranca']);
  });

  it('confirmada não consulta o PSP de novo; inexistente → 404', async () => {
    const { id } = await gerar();
    gateway.pagar(pspDe(id));
    await webhook(pspDe(id));
    const antes = gateway.consultas;
    expect((await new ConsultarStatusPix(deps).executar({ id })).status).toBe('CONFIRMADA');
    expect(gateway.consultas).toBe(antes);
    expect(await codigoDe(new ConsultarStatusPix(deps).executar({ id: novaChave() }))).toBe(
      'DOACAO_NAO_ENCONTRADA',
    );
  });
});

describe('histórico', () => {
  it('só as do usuário, mais recentes primeiro; vencida aparece como EXPIRADA', async () => {
    const a = await gerar({ ator: MARIA, valor: '20.00' });
    await gerar({ ator: JOAO });
    const b = await gerar({ ator: MARIA, valor: '100.00' });
    relogio.avancar(16 * 60_000);

    const p = await new ListarMinhasDoacoesFinanceiras(deps).executar({ ator: MARIA });
    expect(p.itens.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(p.itens.every((i) => i.status === 'EXPIRADA')).toBe(true);
  });
});
