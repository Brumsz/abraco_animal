import { describe, expect, it } from 'vitest';

import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  DespacharPush,
  LIMITES_PUSH,
  RegistrarAparelho,
  type Aparelho,
  type EnviadorPush,
  type MensagemPush,
  type NotificacaoReservada,
  type RepositorioPush,
  type ResultadoEnvio,
} from './casos-de-uso.js';

const AGORA = new Date('2026-11-26T15:00:00.000Z');
const relogio = { agora: () => AGORA };
const ator: Ator = { id: '00000000-0000-4000-8000-000000000001', role: 'USUARIO' };
const TOKEN = 'ExponentPushToken[abcdefghij1234]';

function notificacao(id: string, usuarioId: number, minutosAtras = 1): NotificacaoReservada {
  return {
    id,
    usuarioId,
    tipo: 'ADOCAO_APROVADA',
    titulo: 'Adoção aprovada!',
    corpo: 'Seu pedido foi aprovado.',
    entidadeId: '11111111-1111-4111-8111-111111111111',
    criadoEm: new Date(AGORA.getTime() - minutosAtras * 60_000),
  };
}

function repo(reservadas: NotificacaoReservada[], aparelhos: Aparelho[]) {
  const estado = {
    registrados: [] as string[][],
    removidos: [] as string[],
    usuariosConsultados: [] as number[],
  };
  const r: RepositorioPush = {
    registrar: (u, d, t) => {
      estado.registrados.push([u, d, t]);
      return Promise.resolve();
    },
    remover: () => Promise.resolve(),
    reservarPendentes: () => Promise.resolve(reservadas),
    aparelhosAtivos: (ids) => {
      estado.usuariosConsultados.push(...ids);
      return Promise.resolve(aparelhos.filter((a) => ids.includes(a.usuarioId)));
    },
    removerTokens: (tokens) => {
      estado.removidos.push(...tokens);
      return Promise.resolve();
    },
  };
  return { r, estado };
}

function enviador(resposta: (m: readonly MensagemPush[]) => ResultadoEnvio[]) {
  const enviados: MensagemPush[][] = [];
  const e: EnviadorPush = {
    enviar: (m) => {
      enviados.push([...m]);
      return Promise.resolve(resposta(m));
    },
  };
  return { e, enviados };
}

describe('registrar aparelho', () => {
  it('aceita só tokens da Expo e deviceId válido', async () => {
    const { r, estado } = repo([], []);
    const uc = new RegistrarAparelho({ push: r });
    await uc.executar({ ator, deviceId: ' aparelho-123 ', expoToken: ` ${TOKEN} ` });
    expect(estado.registrados).toEqual([[ator.id, 'aparelho-123', TOKEN]]);

    await expect(
      uc.executar({ ator, deviceId: 'aparelho-123', expoToken: 'https://evil/push' }),
    ).rejects.toMatchObject({ codigo: 'TOKEN_PUSH_INVALIDO' });
    await expect(uc.executar({ ator, deviceId: 'x', expoToken: TOKEN })).rejects.toMatchObject({
      codigo: 'DEVICE_ID_INVALIDO',
    });
  });
});

describe('despachar push', () => {
  it('envia uma mensagem por aparelho do dono, com tipo e entidade para o app abrir a tela', async () => {
    const { r } = repo(
      [notificacao('n1', 1), notificacao('n2', 2)],
      [
        { usuarioId: 1, token: 'ExponentPushToken[aaaaaaaaaa1]' },
        { usuarioId: 1, token: 'ExponentPushToken[aaaaaaaaaa2]' },
      ],
    );
    const { e, enviados } = enviador((m) => m.map(() => ({ ok: true })));
    const resumo = await new DespacharPush({ push: r, enviador: e, relogio }).executar();

    expect(resumo).toEqual({ reservadas: 2, enviadas: 2, falhas: 0, tokensRemovidos: 0 });
    expect(enviados[0]?.map((m) => m.to)).toEqual([
      'ExponentPushToken[aaaaaaaaaa1]',
      'ExponentPushToken[aaaaaaaaaa2]',
    ]);
    expect(enviados[0]?.[0]).toMatchObject({
      title: 'Adoção aprovada!',
      data: { notificacaoId: 'n1', tipo: 'ADOCAO_APROVADA' },
    });
  });

  it('remove tokens de aparelhos que não existem mais', async () => {
    const { r, estado } = repo(
      [notificacao('n1', 1)],
      [
        { usuarioId: 1, token: 'ExponentPushToken[bom1234567]' },
        { usuarioId: 1, token: 'ExponentPushToken[velho12345]' },
      ],
    );
    const { e } = enviador(() => [{ ok: true }, { ok: false, aparelhoInvalido: true }]);
    const resumo = await new DespacharPush({ push: r, enviador: e, relogio }).executar();
    expect(resumo.tokensRemovidos).toBe(1);
    expect(estado.removidos).toEqual(['ExponentPushToken[velho12345]']);
  });

  it('notificação antiga não vira push; Expo fora do ar não derruba o job', async () => {
    const velha = notificacao('n1', 1, LIMITES_PUSH.idadeMaximaMs / 60_000 + 1);
    const { r, estado } = repo([velha], [{ usuarioId: 1, token: TOKEN }]);
    const { e, enviados } = enviador(() => []);
    expect(await new DespacharPush({ push: r, enviador: e, relogio }).executar()).toMatchObject({
      reservadas: 1,
      enviadas: 0,
    });
    expect(enviados).toHaveLength(0);
    expect(estado.usuariosConsultados).toHaveLength(0);

    const { r: r2 } = repo([notificacao('n2', 1)], [{ usuarioId: 1, token: TOKEN }]);
    const fora: EnviadorPush = { enviar: () => Promise.reject(new Error('503')) };
    expect(await new DespacharPush({ push: r2, enviador: fora, relogio }).executar()).toMatchObject(
      { enviadas: 0, falhas: 1 },
    );
  });

  it('divide em requisições de até 100 mensagens', async () => {
    const aparelhos = Array.from({ length: 150 }, (_, i) => ({
      usuarioId: 1,
      token: `ExponentPushToken[token${String(i).padStart(6, '0')}]`,
    }));
    const { r } = repo([notificacao('n1', 1)], aparelhos);
    const { e, enviados } = enviador((m) => m.map(() => ({ ok: true })));
    await new DespacharPush({ push: r, enviador: e, relogio }).executar();
    expect(enviados.map((p) => p.length)).toEqual([100, 50]);
  });
});
