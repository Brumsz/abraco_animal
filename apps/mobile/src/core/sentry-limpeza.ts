/** Limpeza dos eventos do Sentry no app (pura, sem SDK: testável no Jest). */

const REDIGIDO = '[REDIGIDO]';
const PADROES: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /\bBearer\s+[\w.~+/=-]+/gi,
  /Expo(nent)?PushToken\[[^\]]+\]/g,
];

export function redigir(texto: string): string {
  return PADROES.reduce((t, p) => t.replace(p, REDIGIDO), texto);
}

const semQuery = (url: string) => url.split('?')[0] ?? url;

interface EventoMinimo {
  user?: unknown;
  extra?: unknown;
  message?: string;
  request?: { url?: string; method?: string };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: {
    category?: string;
    message?: string;
    data?: { url?: unknown } & Record<string, unknown>;
  }[];
}

export function limparEventoApp<E extends EventoMinimo>(e: E): E {
  delete e.user;
  delete e.extra;
  if (e.message) e.message = redigir(e.message);
  if (e.request) {
    const limpo = {
      ...(e.request.method ? { method: e.request.method } : {}),
      ...(e.request.url ? { url: semQuery(e.request.url) } : {}),
    };
    e.request = limpo;
  }
  for (const ex of e.exception?.values ?? []) if (ex.value) ex.value = redigir(ex.value);
  if (e.breadcrumbs) {
    e.breadcrumbs = e.breadcrumbs
      .filter((b) => b.category !== 'console')
      .map((b) => {
        const url = b.data?.url;
        return {
          ...b,
          ...(b.message ? { message: redigir(b.message) } : {}),
          ...(b.data && typeof url === 'string' ? { data: { ...b.data, url: semQuery(url) } } : {}),
        };
      });
  }
  return e;
}
