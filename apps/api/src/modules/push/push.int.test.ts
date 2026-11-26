/**
 * Push com Postgres real: registro do aparelho, reserva sem duplicar e entrega
 * só a aparelhos com sessão ativa. A Expo é substituída por um enviador falso.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario } from '../../testes/usuarios-teste.js';
import { DespacharPush, type MensagemPush } from './application/casos-de-uso.js';
import { PrismaRepositorioPush } from './infrastructure/prisma-repositorio-push.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;

const TOKEN_A = 'ExponentPushToken[aparelhoAAAAAA]';
const TOKEN_B = 'ExponentPushToken[aparelhoBBBBBB]';

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.redis.flushall();
  // Nada pendente de outros testes: cada caso cria as próprias notificações.
  await amb.prisma.notificacao.updateMany({
    where: { pushEnviadoEm: null },
    data: { pushEnviadoEm: new Date() },
  });
});

const registrar = (token: string, expoToken: string, deviceId = 'aparelho-de-teste-1') =>
  app.inject({
    method: 'POST',
    url: '/v1/me/dispositivos-push',
    headers: bearer(token),
    payload: { deviceId, expoToken },
  });

function despachante() {
  const enviados: MensagemPush[] = [];
  const uc = new DespacharPush({
    push: new PrismaRepositorioPush(amb.prisma),
    enviador: {
      enviar: (m) => {
        enviados.push(...m);
        return Promise.resolve(m.map(() => ({ ok: true as const })));
      },
    },
    relogio: { agora: () => new Date() },
  });
  return { uc, enviados };
}

async function notificar(publicIdUsuario: string) {
  const u = await amb.prisma.usuario.findUniqueOrThrow({ where: { publicId: publicIdUsuario } });
  await amb.prisma.notificacao.create({
    data: { usuarioId: u.id, tipo: 'ADOCAO_APROVADA', titulo: 'Adoção aprovada!', corpo: 'Oba!' },
  });
}

describe('push', () => {
  it('registra o aparelho, entrega uma vez e não entrega de novo', async () => {
    const u = await criarUsuario(app, amb.prisma);
    expect((await registrar(u.token, TOKEN_A)).statusCode).toBe(204);
    await notificar(u.id);

    const { uc, enviados } = despachante();
    expect(await uc.executar()).toMatchObject({ reservadas: 1, enviadas: 1 });
    expect(enviados[0]).toMatchObject({ to: TOKEN_A, title: 'Adoção aprovada!' });
    expect(await uc.executar()).toMatchObject({ reservadas: 0, enviadas: 0 });
  });

  it('token inválido: 422; sem login: 401', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const r = await registrar(u.token, 'https://malicioso.example/push');
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ codigo: 'TOKEN_PUSH_INVALIDO' });
    const semLogin = await app.inject({
      method: 'POST',
      url: '/v1/me/dispositivos-push',
      payload: { deviceId: 'aparelho-de-teste-1', expoToken: TOKEN_A },
    });
    expect(semLogin.statusCode).toBe(401);
  });

  it('depois do logout o aparelho não recebe mais', async () => {
    const u = await criarUsuario(app, amb.prisma);
    await registrar(u.token, TOKEN_B);
    const sair = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: bearer(u.token),
    });
    expect(sair.statusCode).toBeLessThan(300);
    await notificar(u.id);

    const { uc, enviados } = despachante();
    expect(await uc.executar()).toMatchObject({ reservadas: 1, enviadas: 0 });
    expect(enviados).toHaveLength(0);
  });

  it('o mesmo aparelho passa para a conta que entrou por último', async () => {
    const a = await criarUsuario(app, amb.prisma);
    const b = await criarUsuario(app, amb.prisma);
    await registrar(a.token, TOKEN_A);
    await registrar(b.token, TOKEN_A);
    await notificar(a.id);
    await notificar(b.id);

    const { uc, enviados } = despachante();
    await uc.executar();
    expect(enviados).toHaveLength(1);
    expect(await amb.prisma.dispositivoPush.count({ where: { expoToken: TOKEN_A } })).toBe(1);
  });

  it('remover o aparelho (notificações desligadas no app)', async () => {
    const u = await criarUsuario(app, amb.prisma);
    await registrar(u.token, TOKEN_B);
    const r = await app.inject({
      method: 'DELETE',
      url: '/v1/me/dispositivos-push/aparelho-de-teste-1',
      headers: bearer(u.token),
    });
    expect(r.statusCode).toBe(204);
    expect(await amb.prisma.dispositivoPush.count({ where: { expoToken: TOKEN_B } })).toBe(0);
  });
});
