/**
 * Integração do chat: REST + WebSocket real (injectWS) + Redis pub/sub real.
 */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';

import { iniciarAmbiente, type AmbienteIntegracao } from '../../testes/ambiente-integracao.js';
import { bearer, criarUsuario, type UsuarioTeste } from '../../testes/usuarios-teste.js';

let amb: AmbienteIntegracao;
let app: FastifyInstance;
let admin: UsuarioTeste;

interface Conversa {
  id: string;
  status: string;
  naoLidas: number;
  atendente: string | null;
  usuario?: { nome: string };
}
interface Mensagem {
  id: string;
  conteudo: string;
  autorEhEquipe: boolean;
  lida: boolean;
}

const req = (
  method: 'GET' | 'POST',
  url: string,
  token?: string,
  payload?: Record<string, unknown>,
) => app.inject({ method, url, headers: bearer(token), ...(payload ? { payload } : {}) });

async function abrir(
  u: UsuarioTeste,
  mensagem = 'Olá! Quero visitar o santuário.',
): Promise<Conversa> {
  const r = await req('POST', '/v1/conversas', u.token, { assunto: 'Visita', mensagem });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<Conversa>();
}

const enviar = (u: UsuarioTeste, id: string, conteudo: string) =>
  req('POST', `/v1/conversas/${id}/mensagens`, u.token, { conteudo });

/** Cliente WebSocket de teste com fila de mensagens recebidas. */
async function conectar(origem?: string) {
  const recebidas: Record<string, unknown>[] = [];
  const esperando: ((m: Record<string, unknown>) => void)[] = [];
  let fechamento: { codigo: number; motivo: string } | null = null;
  const ws: WebSocket = await app.injectWS(
    '/v1/ws/chat',
    origem ? { headers: { origin: origem } } : {},
  );
  ws.on('message', (dados: Buffer) => {
    const m = JSON.parse(dados.toString()) as Record<string, unknown>;
    const proximo = esperando.shift();
    if (proximo) proximo(m);
    else recebidas.push(m);
  });
  ws.on('close', (codigo: number, motivo: Buffer) => {
    fechamento = { codigo, motivo: motivo.toString() };
  });
  return {
    ws,
    enviar: (m: unknown) => {
      ws.send(JSON.stringify(m));
    },
    proxima: (ms = 3000) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const ja = recebidas.shift();
        if (ja) {
          resolve(ja);
          return;
        }
        const t = setTimeout(() => {
          reject(new Error('nenhuma mensagem no WebSocket'));
        }, ms);
        esperando.push((m) => {
          clearTimeout(t);
          resolve(m);
        });
      }),
    nada: async (ms = 400) => {
      await new Promise((r) => setTimeout(r, ms));
      return recebidas.length === 0;
    },
    fechado: async (ms = 3000) => {
      const fim = Date.now() + ms;
      while (!fechamento && Date.now() < fim) await new Promise((r) => setTimeout(r, 20));
      return fechamento;
    },
  };
}

async function conectarAutenticado(u: UsuarioTeste) {
  const c = await conectar();
  c.enviar({ tipo: 'auth', token: u.token });
  expect(await c.proxima()).toEqual({ tipo: 'auth.ok' });
  return c;
}

beforeAll(async () => {
  amb = await iniciarAmbiente();
  app = amb.app;
  admin = await criarUsuario(app, amb.prisma, { role: 'ADMIN', nome: 'Karina Admin' });
});

afterAll(async () => {
  await amb.encerrar();
});

beforeEach(async () => {
  await amb.redis.flushall();
});

describe('chat via REST', () => {
  it('abrir → equipe responde (assume) → usuário vê não lidas → "visto"', async () => {
    const maria = await criarUsuario(app, amb.prisma, { nome: 'Maria Souza' });
    const c = await abrir(maria);
    expect(
      (await req('POST', '/v1/conversas', maria.token, { mensagem: 'outra' })).statusCode,
    ).toBe(409);

    const r1 = await enviar(admin, c.id, 'Olá, Maria! Sábado às 9h?');
    expect(r1.statusCode, r1.body).toBe(201);
    expect(r1.json<Mensagem>().autorEhEquipe).toBe(true);
    await enviar(admin, c.id, 'Traga água 🙂');

    const [minha] = (await req('GET', '/v1/conversas', maria.token)).json<Conversa[]>();
    expect(minha).toMatchObject({ id: c.id, naoLidas: 2, atendente: 'Karina' });
    expect(minha).not.toHaveProperty('usuario');
    // Uma notificação só no sino, mesmo com 2 respostas.
    const u = await amb.prisma.usuario.findUniqueOrThrow({ where: { email: maria.email } });
    expect(
      await amb.prisma.notificacao.count({
        where: { usuarioId: u.id, tipo: 'CHAT_NOVA_MENSAGEM' },
      }),
    ).toBe(1);

    const mensagens = (await req('GET', `/v1/conversas/${c.id}/mensagens`, maria.token)).json<{
      itens: Mensagem[];
    }>();
    expect(mensagens.itens.map((m) => m.conteudo)).toEqual([
      'Traga água 🙂',
      'Olá, Maria! Sábado às 9h?',
      'Olá! Quero visitar o santuário.',
    ]);
    const ultima = mensagens.itens[0]?.id ?? '';
    expect(
      (await req('POST', `/v1/conversas/${c.id}/lidas`, maria.token, { ateMensagemId: ultima }))
        .statusCode,
    ).toBe(204);
    expect((await req('GET', '/v1/conversas', maria.token)).json<Conversa[]>()[0]?.naoLidas).toBe(
      0,
    );

    // A equipe vê o nome do usuário; a 1ª mensagem (da Maria) segue não lida para a equipe.
    const lista = (await req('GET', '/v1/admin/conversas?status=ABERTA', admin.token)).json<{
      itens: Conversa[];
    }>();
    expect(lista.itens.find((x) => x.id === c.id)).toMatchObject({
      usuario: { nome: 'Maria Souza' },
      naoLidas: 1,
    });
  });

  it('IDOR: outro usuário não lê nem escreve (403); usuário comum em /admin → 403', async () => {
    const dono = await criarUsuario(app, amb.prisma);
    const outro = await criarUsuario(app, amb.prisma);
    const c = await abrir(dono);
    expect((await req('GET', `/v1/conversas/${c.id}/mensagens`, outro.token)).statusCode).toBe(403);
    expect((await enviar(outro, c.id, 'oi')).statusCode).toBe(403);
    expect((await req('GET', '/v1/admin/conversas', outro.token)).statusCode).toBe(403);
    expect((await req('POST', `/v1/admin/conversas/${c.id}/encerrar`, dono.token)).statusCode).toBe(
      403,
    );
    expect(
      (await req('GET', `/v1/conversas/${randomUUID()}/mensagens`, dono.token)).statusCode,
    ).toBe(404);
  });

  it('encerrada não aceita mensagem (409) e o usuário pode abrir outra', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const c = await abrir(u);
    expect(
      (await req('POST', `/v1/admin/conversas/${c.id}/encerrar`, admin.token)).statusCode,
    ).toBe(204);
    expect((await enviar(u, c.id, 'ainda aí?')).statusCode).toBe(409);
    expect((await abrir(u)).status).toBe('ABERTA');
  });

  it('duas aberturas simultâneas: só uma (índice único parcial)', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const rs = await Promise.all(
      [1, 2, 3].map(() => req('POST', '/v1/conversas', u.token, { mensagem: 'oi' })),
    );
    expect(rs.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
  });

  it('rate limit de mensagens: 30/min → a 31ª é 429', async () => {
    const u = await criarUsuario(app, amb.prisma);
    const c = await abrir(u);
    for (let i = 0; i < 30; i++)
      expect((await enviar(u, c.id, `m${String(i)}`)).statusCode).toBe(201);
    expect((await enviar(u, c.id, 'demais')).statusCode).toBe(429);
  });
});

describe('WebSocket', () => {
  it('entrega mensagem.nova ao dono e à equipe, em tempo real (via Redis pub/sub)', async () => {
    const maria = await criarUsuario(app, amb.prisma);
    const intrusa = await criarUsuario(app, amb.prisma);
    const c = await abrir(maria);
    const wsMaria = await conectarAutenticado(maria);
    const wsAdmin = await conectarAutenticado(admin);
    const wsIntrusa = await conectarAutenticado(intrusa);

    await enviar(admin, c.id, 'Chegou em tempo real?');
    for (const ws of [wsMaria, wsAdmin]) {
      expect(await ws.proxima()).toMatchObject({
        tipo: 'mensagem.nova',
        conversaId: c.id,
        mensagem: { conteudo: 'Chegou em tempo real?', autorEhEquipe: true },
      });
    }
    // Quem não participa não recebe nada (e o id interno do dono nunca vai ao app).
    expect(await wsIntrusa.nada()).toBe(true);

    // "Visto" chega para a equipe.
    const ultima = (await req('GET', `/v1/conversas/${c.id}/mensagens`, maria.token)).json<{
      itens: Mensagem[];
    }>().itens[0];
    await req('POST', `/v1/conversas/${c.id}/lidas`, maria.token, {
      ateMensagemId: ultima?.id ?? '',
    });
    const lida = await wsAdmin.proxima();
    expect(lida).toMatchObject({ tipo: 'mensagem.lida', conversaId: c.id, leitorEhEquipe: false });
    expect(lida).not.toHaveProperty('usuarioId');
    for (const ws of [wsMaria, wsAdmin, wsIntrusa]) ws.ws.close();
  });

  it('"digitando" vai só para o outro lado; conversa de outra pessoa → erro', async () => {
    const maria = await criarUsuario(app, amb.prisma);
    const outro = await criarUsuario(app, amb.prisma);
    const c = await abrir(maria);
    const wsMaria = await conectarAutenticado(maria);
    const wsAdmin = await conectarAutenticado(admin);
    const wsOutro = await conectarAutenticado(outro);

    wsMaria.enviar({ tipo: 'digitando', conversaId: c.id });
    expect(await wsAdmin.proxima()).toEqual({
      tipo: 'digitando',
      conversaId: c.id,
      daEquipe: false,
    });
    expect(await wsMaria.nada()).toBe(true);

    wsOutro.enviar({ tipo: 'digitando', conversaId: c.id });
    expect(await wsOutro.proxima()).toEqual({ tipo: 'erro', codigo: 'ACESSO_NEGADO' });
    for (const ws of [wsMaria, wsAdmin, wsOutro]) ws.ws.close();
  });

  it('ping → pong; encerrar a conversa avisa o usuário', async () => {
    const maria = await criarUsuario(app, amb.prisma);
    const c = await abrir(maria);
    const ws = await conectarAutenticado(maria);
    ws.enviar({ tipo: 'ping' });
    expect(await ws.proxima()).toEqual({ tipo: 'pong' });
    await req('POST', `/v1/admin/conversas/${c.id}/encerrar`, admin.token);
    expect(await ws.proxima()).toEqual({ tipo: 'conversa.encerrada', conversaId: c.id });
    ws.ws.close();
  });

  describe('segurança', () => {
    it('token inválido → fecha com 4401', async () => {
      const ws = await conectar();
      ws.enviar({ tipo: 'auth', token: 'token.falso.qualquer' });
      expect((await ws.fechado())?.codigo).toBe(4401);
    });

    it('mensagem antes de autenticar → fecha com 4401', async () => {
      const ws = await conectar();
      ws.enviar({ tipo: 'ping' });
      expect((await ws.fechado())?.codigo).toBe(4401);
    });

    it('JSON inválido ou formato desconhecido → fecha com 4400', async () => {
      const a = await conectar();
      a.ws.send('não é json');
      expect((await a.fechado())?.codigo).toBe(4400);
      const b = await conectarAutenticado(admin);
      b.enviar({ tipo: 'enviar', conteudo: 'tentando mandar mensagem pelo WS' });
      expect((await b.fechado())?.codigo).toBe(4400);
    });

    it('sem autenticar em 5 s → fecha com 4401', async () => {
      const ws = await conectar();
      expect((await ws.fechado(7000))?.codigo).toBe(4401);
    }, 10_000);

    it('logout revoga a sessão: o token não autentica mais no WebSocket', async () => {
      const u = await criarUsuario(app, amb.prisma);
      expect((await req('POST', '/v1/auth/logout', u.token)).statusCode).toBe(204);
      const ws = await conectar();
      ws.enviar({ tipo: 'auth', token: u.token });
      expect((await ws.fechado())?.codigo).toBe(4401);
    });

    it('rajada de mensagens (> 30 em 10 s) → fecha com 4429', async () => {
      const ws = await conectarAutenticado(admin);
      for (let i = 0; i < 35; i++) ws.enviar({ tipo: 'ping' });
      expect((await ws.fechado())?.codigo).toBe(4429);
    });

    it('Origin de outro site → 403 no upgrade; origem permitida conecta', async () => {
      await expect(conectar('https://site-malicioso.example')).rejects.toThrow();
      const ok = await conectar('https://painel.abracoanimal.org.br');
      ok.enviar({ tipo: 'auth', token: admin.token });
      expect(await ok.proxima()).toEqual({ tipo: 'auth.ok' });
      ok.ws.close();
    });

    it('mensagem acima de 4 KB derruba a conexão', async () => {
      const ws = await conectarAutenticado(admin);
      ws.ws.send(JSON.stringify({ tipo: 'ping', lixo: 'x'.repeat(5000) }));
      expect(await ws.fechado()).not.toBeNull();
    });
  });
});
