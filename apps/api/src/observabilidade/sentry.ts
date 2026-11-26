/**
 * Erros (Sentry) e rastreamento (OpenTelemetry). O SDK do Sentry para Node é
 * construído sobre o OpenTelemetry: os spans de HTTP, Fastify, Postgres (pg) e
 * Redis vêm da instrumentação OTel e são enviados ao Sentry.
 *
 * Seção 6 da spec: nada de CPF, senha, token ou e-mail sai daqui. Por isso:
 *  - `dataCollection` desliga TUDO o que o SDK coleta por padrão (na v11 o padrão
 *    inclui corpo das requisições, parâmetros das consultas, argumentos das filas
 *    e variáveis locais dos stack traces);
 *  - cabeçalhos, corpo, cookies e query da requisição são removidos de novo no envio;
 *  - textos (mensagens, breadcrumbs) passam por `redigirTexto`.
 *
 * Sem SENTRY_DSN nada é inicializado (desenvolvimento e testes).
 */
import type { Breadcrumb, ErrorEvent, NodeOptions } from '@sentry/node';

/** Span enviado em fluxo (padrão da v11); o tipo não é exportado pelo pacote. */
export type SpanEnviado = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];

const REDIGIDO = '[REDIGIDO]';

/** E-mails, CPFs (com ou sem máscara), JWTs e "Bearer xxx". */
const PADROES: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /\bBearer\s+[\w.~+/=-]+/gi,
];

export function redigirTexto(texto: string): string {
  return PADROES.reduce((t, p) => t.replace(p, REDIGIDO), texto);
}

/** Query string some da URL (pode ter e-mail, cursor ou token). */
function semQuery(url: string): string {
  const i = url.indexOf('?');
  return i < 0 ? url : url.slice(0, i);
}

function limparBreadcrumb(b: Breadcrumb): Breadcrumb {
  const url: unknown = b.data?.['url'];
  return {
    ...b,
    ...(b.message ? { message: redigirTexto(b.message) } : {}),
    ...(b.data && typeof url === 'string' ? { data: { ...b.data, url: semQuery(url) } } : {}),
  };
}

/** Limpa um evento de erro antes do envio. */
export function limparEvento(e: ErrorEvent): ErrorEvent {
  delete e.user;
  delete e.extra;
  if (e.request) {
    e.request = {
      ...(e.request.method ? { method: e.request.method } : {}),
      ...(e.request.url ? { url: semQuery(e.request.url) } : {}),
    };
  }
  if (e.message) e.message = redigirTexto(e.message);
  for (const ex of e.exception?.values ?? []) {
    if (ex.value) ex.value = redigirTexto(ex.value);
    for (const f of ex.stacktrace?.frames ?? []) delete f.vars;
  }
  if (e.breadcrumbs) {
    // Logs do console podem ter qualquer coisa: não viram breadcrumb.
    e.breadcrumbs = e.breadcrumbs.filter((b) => b.category !== 'console').map(limparBreadcrumb);
  }
  return e;
}

/** Atributos de span com URL ou texto livre: sem query e com e-mail/CPF/token redigidos. */
export function limparSpan(span: SpanEnviado): SpanEnviado {
  const limpos = Object.entries(span.attributes as Record<string, unknown>)
    .filter(([chave]) => chave !== 'url.query' && chave !== 'http.query')
    .map(([chave, valor]) => {
      if (typeof valor !== 'string') return [chave, valor] as const;
      const texto = /url|target|route/i.test(chave) ? semQuery(valor) : valor;
      return [chave, redigirTexto(texto)] as const;
    });
  span.name = redigirTexto(semQuery(span.name));
  span.attributes = Object.fromEntries(limpos);
  return span;
}

export interface ConfigSentry {
  readonly dsn?: string | undefined;
  readonly ambiente: string;
  readonly release?: string | undefined;
  /** Fração das requisições rastreadas (0 a 1). */
  readonly taxaRastreamento: number;
}

const vazioComoAusente = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

/** Lê a configuração do ambiente. Sem DSN → null (Sentry desligado). */
export function configSentry(env: NodeJS.ProcessEnv): ConfigSentry | null {
  const dsn = env['SENTRY_DSN']?.trim();
  if (!dsn) return null;
  const taxa = Number(env['SENTRY_TRACES_SAMPLE_RATE'] ?? '0.1');
  return {
    dsn,
    ambiente: vazioComoAusente(env['SENTRY_ENVIRONMENT']) ?? env['NODE_ENV'] ?? 'development',
    release: vazioComoAusente(env['SENTRY_RELEASE']),
    taxaRastreamento: Number.isFinite(taxa) ? Math.min(1, Math.max(0, taxa)) : 0.1,
  };
}

/** Integrações que nunca ligamos: poderiam capturar dados pessoais. */
const INTEGRACOES_DESLIGADAS = new Set(['Console', 'LocalVariablesAsync', 'Pino']);

export function opcoesSentry(c: ConfigSentry): NodeOptions {
  return {
    dsn: c.dsn,
    environment: c.ambiente,
    ...(c.release ? { release: c.release } : {}),
    includeLocalVariables: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      mcp: { inputs: false, outputs: false },
    },
    tracesSampleRate: c.taxaRastreamento,
    integrations: (padrao) => padrao.filter((i) => !INTEGRACOES_DESLIGADAS.has(i.name)),
    // Health checks a cada 10 s só gastariam a cota de spans.
    ignoreSpans: [/^GET \/health\//],
    beforeSend: limparEvento,
    beforeSendSpan: limparSpan,
  };
}
