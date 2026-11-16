import { ErroRede, type UsuarioPerfil } from '@abraco/api-client';
import * as SecureStore from 'expo-secure-store';

import { lerRefresh, obterDeviceId } from '../armazenamento-seguro';
import {
  api,
  aoMudarSessao,
  entrar,
  iniciarSessao,
  renovarSessao,
  sair,
  useSessao,
} from '../sessao';

const dados = (SecureStore as unknown as { __dados: Map<string, string> }).__dados;

const usuario: UsuarioPerfil = {
  id: '00000000-0000-4000-8000-000000000001',
  nome: 'Maria Souza',
  email: 'maria@teste.org',
  telefone: '11987654321',
  role: 'USUARIO',
  endereco: {
    cep: '01001000',
    logradouro: 'Praça',
    numero: '1',
    complemento: null,
    bairro: 'Sé',
    cidade: 'SP',
    uf: 'SP',
  },
  fotoUrl: null,
  capaUrl: null,
  criadoEm: '2026-11-01T12:00:00.000Z',
};

const sessao = (n: number) => ({
  accessToken: `access-${String(n)}`,
  refreshToken: `refresh-${String(n)}`,
  expiraEm: '2026-11-16T12:15:00.000Z',
  usuario,
});

const resposta = (corpo: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

let fetchMock: jest.Mock<Promise<Response>, [Request]>;

beforeEach(() => {
  dados.clear();
  useSessao.setState({ estado: 'carregando', usuario: null, accessToken: null });
  fetchMock = jest.fn<Promise<Response>, [Request]>();
  globalThis.fetch = ((req: Request) => fetchMock(req)) as typeof fetch;
});

const rota = (req: Request) => new URL(req.url).pathname;

describe('sessão do app', () => {
  it('entrar: refresh token no armazenamento seguro, access token SÓ na memória', async () => {
    await entrar(sessao(1));
    expect(await lerRefresh()).toBe('refresh-1');
    expect(useSessao.getState()).toMatchObject({ estado: 'autenticado', accessToken: 'access-1' });
    expect([...dados.values()]).not.toContain('access-1');
  });

  it('abrir o app sem sessão guardada → anônimo, sem chamar a API', async () => {
    await iniciarSessao();
    expect(useSessao.getState().estado).toBe('anonimo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('abrir o app com sessão guardada → renova (com o deviceId deste aparelho) e entra', async () => {
    await entrar(sessao(1));
    useSessao.setState({ estado: 'carregando', accessToken: null });
    fetchMock.mockResolvedValue(resposta(sessao(2)));
    await iniciarSessao();

    const req = fetchMock.mock.calls[0]?.[0];
    expect(req && rota(req)).toBe('/v1/auth/refresh');
    expect(await req?.json()).toEqual({
      refreshToken: 'refresh-1',
      deviceId: await obterDeviceId(),
    });
    expect(useSessao.getState()).toMatchObject({ estado: 'autenticado', accessToken: 'access-2' });
    expect(await lerRefresh()).toBe('refresh-2');
  });

  it('renovação ÚNICA: 3 pedidos simultâneos usam o refresh token uma vez só', async () => {
    await entrar(sessao(1));
    fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return resposta(sessao(2));
    });
    const tokens = await Promise.all([renovarSessao(), renovarSessao(), renovarSessao()]);
    expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refresh recusado (ex.: reuso detectado) → sessão encerrada e apagada do aparelho', async () => {
    await entrar(sessao(1));
    const eventos: string[] = [];
    aoMudarSessao((e) => eventos.push(e));
    fetchMock.mockResolvedValue(resposta({ codigo: 'REFRESH_INVALIDO' }, 401));
    expect(await renovarSessao()).toBeNull();
    expect(useSessao.getState().estado).toBe('anonimo');
    expect(await lerRefresh()).toBeNull();
    expect(eventos).toContain('sessao-encerrada');
  });

  it('sem internet ao renovar → continua logado (não perde a sessão no metrô)', async () => {
    await entrar(sessao(1));
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(renovarSessao()).rejects.toBeInstanceOf(ErroRede);
    expect(await lerRefresh()).toBe('refresh-1');

    useSessao.setState({ estado: 'carregando', accessToken: null });
    await iniciarSessao();
    expect(useSessao.getState().estado).toBe('autenticado');
  });

  it('chamada com token expirado → renova e repete com o token novo', async () => {
    await entrar(sessao(1));
    fetchMock.mockImplementation((req) => {
      if (rota(req) === '/v1/auth/refresh') return Promise.resolve(resposta(sessao(2)));
      return Promise.resolve(
        req.headers.get('authorization') === 'Bearer access-2'
          ? resposta(usuario)
          : resposta({ codigo: 'TOKEN_INVALIDO' }, 401),
      );
    });
    const r = await api.GET('/v1/me');
    expect(r.response.status).toBe(200);
    expect(fetchMock.mock.calls.map(([req]) => rota(req))).toEqual([
      '/v1/me',
      '/v1/auth/refresh',
      '/v1/me',
    ]);
  });

  it('sair: revoga na API e limpa tudo do aparelho (mesmo se a API falhar)', async () => {
    await entrar(sessao(1));
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await sair();
    expect(fetchMock.mock.calls[0]?.[0] && rota(fetchMock.mock.calls[0][0])).toBe(
      '/v1/auth/logout',
    );
    expect(useSessao.getState()).toMatchObject({
      estado: 'anonimo',
      accessToken: null,
      usuario: null,
    });
    expect(await lerRefresh()).toBeNull();
  });

  it('deviceId é estável no aparelho', async () => {
    const a = await obterDeviceId();
    expect(await obterDeviceId()).toBe(a);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
