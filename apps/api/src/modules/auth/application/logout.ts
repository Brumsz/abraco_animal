import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import type { ClaimsAcesso, ListaRevogacao, RepositorioSessoes } from './portas.js';

export class Logout {
  constructor(
    private readonly deps: {
      readonly sessoes: RepositorioSessoes;
      readonly revogacao: ListaRevogacao;
      readonly relogio: Relogio;
    },
  ) {}

  /** Encerra a sessão atual: refresh tokens no banco + jti/sid no Redis. */
  async executar(claims: ClaimsAcesso): Promise<void> {
    const agoraSeg = Math.floor(this.deps.relogio.agora().getTime() / 1000);
    const restante = Math.max(1, claims.exp - agoraSeg);
    await this.deps.sessoes.revogarSessao(claims.sid);
    await this.deps.revogacao.revogarJti(claims.jti, restante);
    await this.deps.revogacao.revogarSid(claims.sid, restante);
  }
}
