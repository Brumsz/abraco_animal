/**
 * Sessão do app: estado (Zustand), cliente da API e renovação de tokens.
 *
 * Regras:
 * - Access token só na memória; refresh token no armazenamento seguro.
 * - Renovação ÚNICA no app inteiro: o cliente HTTP e o chat podem pedir ao
 *   mesmo tempo, mas o refresh token é de uso único (a API revoga a família
 *   se ele for reusado) — então todos esperam a mesma renovação.
 * - Sem internet ao renovar: a pessoa continua logada (erro de rede).
 */
import { ErroRede, criarClienteApi, ok, type Sessao, type UsuarioPerfil } from '@abraco/api-client';
import { create } from 'zustand';

import { apagarRefresh, lerRefresh, obterDeviceId, salvarRefresh } from './armazenamento-seguro';
import { CONFIG } from './config';

export type EstadoSessao = 'carregando' | 'anonimo' | 'autenticado';

interface Sessao$ {
  estado: EstadoSessao;
  usuario: UsuarioPerfil | null;
  accessToken: string | null;
}

export const useSessao = create<Sessao$>(() => ({
  estado: 'carregando',
  usuario: null,
  accessToken: null,
}));

/** Avisos para quem precisa reagir (chat reautentica, cache é limpo no logout). */
type Ouvinte = (evento: 'token-renovado' | 'sessao-encerrada') => void;
const ouvintes = new Set<Ouvinte>();
export function aoMudarSessao(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
const avisar = (e: Parameters<Ouvinte>[0]) => {
  for (const fn of ouvintes) fn(e);
};

export const api = criarClienteApi({
  baseUrl: CONFIG.apiUrl,
  obterToken: () => useSessao.getState().accessToken,
  renovar: () => renovarSessao(),
  aoPerderSessao: () => {
    void encerrarLocalmente();
  },
});

async function aplicar(s: Sessao): Promise<void> {
  await salvarRefresh(s.refreshToken);
  useSessao.setState({ estado: 'autenticado', usuario: s.usuario, accessToken: s.accessToken });
}

/** Login, cadastro ou senha redefinida: guarda a sessão nova. */
export async function entrar(s: Sessao): Promise<void> {
  await aplicar(s);
}

/** Apaga tudo do aparelho (sem chamar a API). */
export async function encerrarLocalmente(): Promise<void> {
  await apagarRefresh();
  useSessao.setState({ estado: 'anonimo', usuario: null, accessToken: null });
  avisar('sessao-encerrada');
}

let renovacao: Promise<string | null> | null = null;

/** Troca o refresh token (uso único) por uma sessão nova. */
export function renovarSessao(): Promise<string | null> {
  renovacao ??= (async () => {
    const refreshToken = await lerRefresh();
    if (!refreshToken) return null;
    try {
      const s = await ok(
        api.POST('/v1/auth/refresh', { body: { refreshToken, deviceId: await obterDeviceId() } }),
      );
      await aplicar(s);
      avisar('token-renovado');
      return s.accessToken;
    } catch (erro) {
      // Sem internet: mantém a sessão (tenta de novo depois).
      if (erro instanceof ErroRede) throw erro;
      await encerrarLocalmente();
      return null;
    }
  })().finally(() => {
    renovacao = null;
  });
  return renovacao;
}

/**
 * Abertura do app: com refresh token guardado, renova (traz o usuário);
 * sem internet, entra como "autenticado sem dados" e tenta de novo depois.
 *
 * A abertura nunca espera mais que `prazoMs`: se a API não responder a tempo
 * (rede que descarta pacotes, API fora do ar), segue como offline e a renovação
 * continua em segundo plano — se ela recusar a sessão, o app volta ao login.
 */
export async function iniciarSessao(prazoMs = PRAZO_ABERTURA_MS): Promise<void> {
  if (!(await lerRefresh())) {
    useSessao.setState({ estado: 'anonimo', usuario: null, accessToken: null });
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<'prazo'>((resolver) => {
    timer = setTimeout(() => {
      resolver('prazo');
    }, prazoMs);
  });
  const renovacaoInicial = renovarSessao().catch(() => 'offline' as const);
  try {
    const r = await Promise.race([renovacaoInicial, prazo]);
    // Offline ou sem resposta: telas que precisam de dados mostram erro de conexão;
    // o próximo 401 dispara outra renovação.
    if ((r === 'offline' || r === 'prazo') && useSessao.getState().estado === 'carregando') {
      useSessao.setState({ estado: 'autenticado' });
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Quanto a abertura do app espera a API antes de seguir (offline). */
export const PRAZO_ABERTURA_MS = 6000;

/** Sair: revoga na API (melhor esforço) e limpa o aparelho. */
export async function sair(): Promise<void> {
  if (useSessao.getState().accessToken) {
    await api.POST('/v1/auth/logout').catch(() => undefined);
  }
  await encerrarLocalmente();
}

export { obterDeviceId };
