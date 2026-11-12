import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import type {
  EmissorTokens,
  GeradorAleatorio,
  HashToken,
  RepositorioSessoes,
  UsuarioAuth,
} from './portas.js';

export interface SessaoEmitida {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Expiração do access token. */
  readonly expiraEm: Date;
  readonly usuario: UsuarioAuth;
}

export interface DepsSessao {
  readonly sessoes: RepositorioSessoes;
  readonly tokens: EmissorTokens;
  readonly aleatorio: GeradorAleatorio;
  readonly hashToken: HashToken;
  readonly relogio: Relogio;
  readonly refreshTtlDias: number;
}

/** Emite um refresh novo para uma família (nova ou rotacionada). */
export function novoRefresh(deps: DepsSessao, sessaoId: number, familiaId: string) {
  const token = deps.aleatorio.token();
  const expiraEm = new Date(deps.relogio.agora().getTime() + deps.refreshTtlDias * 86_400_000);
  return { token, registro: { sessaoId, familiaId, tokenHash: deps.hashToken(token), expiraEm } };
}

/** Cria sessão (sid) vinculada ao aparelho + família de refresh + access token. */
export async function iniciarSessao(
  deps: DepsSessao,
  usuario: UsuarioAuth,
  deviceId: string,
): Promise<SessaoEmitida> {
  const sessao = await deps.sessoes.criarSessao(usuario.id, deviceId);
  const refresh = novoRefresh(deps, sessao.id, deps.aleatorio.uuid());
  await deps.sessoes.salvarRefresh(refresh.registro);
  const acesso = deps.tokens.emitirAcesso({
    sub: usuario.publicId,
    role: usuario.role,
    sid: sessao.sid,
  });
  return {
    accessToken: acesso.token,
    refreshToken: refresh.token,
    expiraEm: acesso.expiraEm,
    usuario,
  };
}
