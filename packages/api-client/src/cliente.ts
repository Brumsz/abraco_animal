/**
 * Cliente HTTP tipado (openapi-fetch + tipos gerados do OpenAPI da API).
 *
 * - Coloca `Authorization: Bearer <access token>` em toda chamada.
 * - 401 fora de /auth → renova o token UMA vez (várias chamadas simultâneas
 *   esperam a mesma renovação) e repete a chamada original.
 * - Renovação falhou → `aoPerderSessao()` (o app volta ao login).
 */
import createClient, { type Client } from 'openapi-fetch';

import { ErroRede, erroDaResposta } from './erros.js';
import type { paths } from './esquema.js';

export interface OpcoesCliente {
  /** Ex.: https://api.abracoanimal.org.br (sem /v1). */
  readonly baseUrl: string;
  /** Access token atual (fica só na memória do app). */
  obterToken(): string | null;
  /**
   * Troca o refresh token por um access token novo; `null` = sessão acabou.
   * Lançar `ErroRede` (sem internet) NÃO encerra a sessão: a chamada falha
   * como erro de rede e a pessoa continua logada.
   */
  renovar(): Promise<string | null>;
  aoPerderSessao?(): void;
  readonly fetch?: typeof fetch;
  /**
   * Tempo máximo de cada requisição (padrão 30 s). Sem isso, uma rede que
   * descarta pacotes (firewall, Wi-Fi ruim) deixa a chamada pendurada para sempre.
   */
  readonly tempoLimiteMs?: number;
}

export const TEMPO_LIMITE_PADRAO_MS = 30_000;

export type ClienteApi = Client<paths> & {
  /** O mesmo fetch autenticado, para uploads multipart (fora do OpenAPI). */
  readonly fetchAutenticado: typeof fetch;
  readonly baseUrl: string;
};

const ehRotaDeAuth = (url: string) => new URL(url).pathname.startsWith('/v1/auth/');

export function criarClienteApi(opcoes: OpcoesCliente): ClienteApi {
  // Lido na hora da chamada: polyfills/mocks instalados depois continuam valendo.
  const base: typeof fetch = opcoes.fetch ?? ((entrada, init) => globalThis.fetch(entrada, init));
  let renovacao: Promise<string | null> | null = null;

  /** Uma renovação por vez: as chamadas que chegarem no meio esperam a mesma. */
  const renovarUmaVez = (): Promise<string | null> => {
    renovacao ??= opcoes
      .renovar()
      .catch((erro: unknown) => {
        // Sem internet não é "sessão acabou": repassa o erro de rede.
        if (erro instanceof ErroRede) throw erro;
        return null;
      })
      .finally(() => {
        renovacao = null;
      });
    return renovacao;
  };

  const tempoLimite = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;

  /**
   * Envia com prazo: cancela a requisição (AbortController) e, mesmo que o fetch
   * da plataforma ignore o cancelamento, rejeita no prazo — quem chamou nunca trava.
   */
  const enviar = (requisicao: Request): Promise<Response> => {
    const controle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<never>((_r, rejeitar) => {
      timer = setTimeout(() => {
        controle.abort();
        rejeitar(new Error(`Sem resposta em ${String(tempoLimite)} ms`));
      }, tempoLimite);
    });
    return Promise.race([
      base(new Request(requisicao, { signal: controle.signal })),
      prazo,
    ]).finally(() => {
      clearTimeout(timer);
    });
  };

  const comToken = (requisicao: Request, token: string | null) => {
    const r = new Request(requisicao);
    if (token) r.headers.set('authorization', `Bearer ${token}`);
    return r;
  };

  const fetchAutenticado = async (
    entrada: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const requisicao = new Request(entrada, init);
    // Cópia guardada ANTES de enviar: o corpo de uma Request só pode ser lido uma vez.
    const copia = requisicao.clone();
    let resposta: Response;
    try {
      resposta = await enviar(comToken(requisicao, opcoes.obterToken()));
    } catch (erro) {
      throw new ErroRede(erro);
    }
    if (resposta.status !== 401 || ehRotaDeAuth(requisicao.url)) return resposta;

    const novo = await renovarUmaVez();
    if (!novo) {
      opcoes.aoPerderSessao?.();
      return resposta;
    }
    try {
      return await enviar(comToken(copia, novo));
    } catch (erro) {
      throw new ErroRede(erro);
    }
  };

  const cliente = createClient<paths>({ baseUrl: opcoes.baseUrl, fetch: fetchAutenticado });
  return Object.assign(cliente, { fetchAutenticado, baseUrl: opcoes.baseUrl });
}

/**
 * Converte o resultado do openapi-fetch em "dado ou exceção" (o formato que o
 * TanStack Query espera). 204 → undefined.
 */
export async function ok<T>(
  chamada: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await chamada;
  if (!response.ok) throw erroDaResposta(response, error);
  return data as T;
}
