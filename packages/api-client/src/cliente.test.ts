import { describe, expect, it, vi } from 'vitest';

import { criarClienteApi, ok } from './cliente.js';
import { ErroApi, ErroRede } from './erros.js';
import { doarAnimal } from './uploads.js';

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
      ...headers,
    },
  });

/** Servidor falso: aceita só o token "valido-N" mais recente. */
function servidor() {
  let tokenAceito = 'velho';
  const recebidas: { url: string; auth: string | null; corpo: string }[] = [];
  const fetch = vi.fn(async (req: Request) => {
    const corpo = req.body ? await req.text() : '';
    recebidas.push({ url: req.url, auth: req.headers.get('authorization'), corpo });
    if (req.headers.get('authorization') !== `Bearer ${tokenAceito}`) {
      return json({ codigo: 'TOKEN_INVALIDO', detail: 'Sessão inválida ou expirada' }, 401);
    }
    return json({ ok: true, url: new URL(req.url).pathname });
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    recebidas,
    aceitar: (t: string) => {
      tokenAceito = t;
    },
  };
}

function montar(s: ReturnType<typeof servidor>, renovar: () => Promise<string | null>) {
  let token: string | null = 'velho';
  const aoPerderSessao = vi.fn();
  const api = criarClienteApi({
    baseUrl: 'https://api.teste',
    obterToken: () => token,
    renovar: async () => {
      const novo = await renovar();
      token = novo;
      return novo;
    },
    aoPerderSessao,
    fetch: s.fetch,
  });
  return { api, aoPerderSessao };
}

describe('cliente HTTP', () => {
  it('coloca o Bearer token em toda chamada', async () => {
    const s = servidor();
    const { api } = montar(s, () => Promise.resolve(null));
    await ok(api.GET('/v1/me'));
    expect(s.recebidas[0]?.auth).toBe('Bearer velho');
  });

  it('5 chamadas simultâneas com token expirado → UMA renovação, todas repetidas com o token novo', async () => {
    const s = servidor();
    s.aceitar('novo');
    let renovacoes = 0;
    const { api } = montar(s, async () => {
      renovacoes += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 'novo';
    });
    const respostas = await Promise.all(Array.from({ length: 5 }, () => ok(api.GET('/v1/me'))));
    expect(renovacoes).toBe(1);
    expect(respostas).toHaveLength(5);
    expect(s.recebidas.filter((r) => r.auth === 'Bearer novo')).toHaveLength(5);
  });

  it('a repetição reenvia o MESMO corpo (o corpo de uma Request só pode ser lido uma vez)', async () => {
    const s = servidor();
    s.aceitar('novo');
    const { api } = montar(s, () => Promise.resolve('novo'));
    await ok(
      api.POST('/v1/conversas', {
        body: { mensagem: 'Olá, ONG!' },
      }),
    );
    expect(s.recebidas.map((r) => r.corpo)).toEqual([
      JSON.stringify({ mensagem: 'Olá, ONG!' }),
      JSON.stringify({ mensagem: 'Olá, ONG!' }),
    ]);
  });

  it('renovação falhou → avisa que a sessão acabou e devolve o 401 como ErroApi', async () => {
    const s = servidor();
    s.aceitar('outro'); // o token atual ("velho") expirou
    const { api, aoPerderSessao } = montar(s, () => Promise.resolve(null));
    const erro = await ok(api.GET('/v1/me')).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 401, codigo: 'TOKEN_INVALIDO' });
    expect(aoPerderSessao).toHaveBeenCalledTimes(1);
  });

  it('sem internet na renovação: erro de rede, e a sessão NÃO é encerrada', async () => {
    const s = servidor();
    s.aceitar('outro');
    const { api, aoPerderSessao } = montar(s, () =>
      Promise.reject(new ErroRede(new TypeError('offline'))),
    );
    await expect(ok(api.GET('/v1/me'))).rejects.toBeInstanceOf(ErroRede);
    expect(aoPerderSessao).not.toHaveBeenCalled();
  });

  it('401 em /auth (ex.: senha errada no login) NÃO tenta renovar', async () => {
    const s = servidor();
    const renovar = vi.fn(() => Promise.resolve('novo'));
    const { api } = montar(s, renovar);
    await ok(
      api.POST('/v1/auth/login', {
        body: { email: 'a@b.org', senha: 'x', deviceId: 'aparelho-123' },
      }),
    ).catch(() => undefined);
    expect(renovar).not.toHaveBeenCalled();
  });

  it('erro de rede vira ErroRede (mensagem amigável)', async () => {
    const api = criarClienteApi({
      baseUrl: 'https://api.teste',
      obterToken: () => null,
      renovar: () => Promise.resolve(null),
      fetch: () => Promise.reject(new TypeError('Network request failed')),
    });
    await expect(ok(api.GET('/v1/animais'))).rejects.toBeInstanceOf(ErroRede);
  });

  it('ErroApi traz código, erros por campo e Retry-After', async () => {
    const api = criarClienteApi({
      baseUrl: 'https://api.teste',
      obterToken: () => 'x',
      renovar: () => Promise.resolve(null),
      fetch: () =>
        Promise.resolve(
          json(
            {
              codigo: 'MUITAS_TENTATIVAS',
              detail: 'Aguarde',
              erros: [{ campo: 'email', mensagem: 'inválido' }, { x: 1 }],
            },
            429,
            { 'retry-after': '120' },
          ),
        ),
    });
    const erro = (await ok(api.GET('/v1/me')).catch((e: unknown) => e)) as ErroApi;
    expect(erro).toMatchObject({ status: 429, codigo: 'MUITAS_TENTATIVAS', tentarEmSegundos: 120 });
    expect(erro.doCampo('email')).toBe('inválido');
    expect(erro.erros).toHaveLength(1);
  });

  it('upload multipart usa o fetch autenticado e envia "dados" + arquivos', async () => {
    const s = servidor();
    const { api } = montar(s, () => Promise.resolve(null));
    await doarAnimal(
      api,
      {
        nomeAnimal: 'Pipoca',
        tipo: 'CANINO',
        raca: 'SRD',
        idadeAprox: 24,
        sexo: 'FEMEA',
        porte: 'MEDIO',
        descricao: 'd',
        motivoDoacao: 'm',
        enderecoRetirada: 'e',
      },
      [new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })],
    );
    const r = s.recebidas[0];
    expect(r?.auth).toBe('Bearer velho');
    expect(r?.corpo).toContain('name="dados"');
    expect(r?.corpo).toContain('"nomeAnimal":"Pipoca"');
    expect(r?.corpo).toContain('name="fotos"');
  });
});
