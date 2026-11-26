/**
 * Endereço da API. `EXPO_PUBLIC_API_URL` vem do .env (no build, do EAS).
 * Em aparelho físico no desenvolvimento use o IP do computador na rede
 * (ex.: http://192.168.0.10:3333); "localhost" no celular é o próprio celular.
 */
// Raiz do servidor: as rotas tipadas já começam com /v1 (um "/v1" no fim é removido).
const bruta = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333')
  .replace(/\/+$/, '')
  .replace(/\/v1$/, '');

// Fora do desenvolvimento, só HTTPS: token e dados pessoais nunca trafegam em texto puro.
if (!__DEV__ && !bruta.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_API_URL precisa ser https:// em produção');
}

/** Só aceita um perfil do Instagram (o botão abre fora do app). */
export function urlInstagram(bruta: string | undefined): string | null {
  const url = bruta?.trim() ?? '';
  return /^https:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/i.test(url) ? url : null;
}

/** Vazia ou só espaços = ausente. */
const preenchida = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

export const CONFIG = {
  apiUrl: bruta,
  /** http → ws, https → wss */
  wsChatUrl: `${bruta.replace(/^http/, 'ws')}/v1/ws/chat`,
  instagramUrl: urlInstagram(process.env.EXPO_PUBLIC_INSTAGRAM_URL),
  /** Vazio = Sentry desligado. O DSN não é segredo (só permite enviar eventos). */
  sentryDsn: preenchida(process.env.EXPO_PUBLIC_SENTRY_DSN),
  /** development | preview | production (canal do EAS). */
  ambiente: preenchida(process.env.EXPO_PUBLIC_AMBIENTE) ?? 'development',
} as const;
