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
 */
export async function iniciarSessao(): Promise<void> {
  if (!(await lerRefresh())) {
    useSessao.setState({ estado: 'anonimo', usuario: null, accessToken: null });
    return;
  }
  try {
    await renovarSessao();
  } catch {
    // Offline: telas que precisam de dados mostram erro de conexão; o próximo
    // 401 dispara outra renovação.
    useSessao.setState({ estado: 'autenticado' });
  }
}

/** Sair: revoga na API (melhor esforço) e limpa o aparelho. */
export async function sair(): Promise<void> {
  if (useSessao.getState().accessToken) {
    await api.POST('/v1/auth/logout').catch(() => undefined);
  }
  await encerrarLocalmente();
}

export { obterDeviceId };
