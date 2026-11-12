import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { ListaRevogacao, RepositorioUsuarios } from './portas.js';
import { novoRefresh, type DepsSessao, type SessaoEmitida } from './sessoes.js';

export interface DepsRenovar extends DepsSessao {
  readonly usuarios: RepositorioUsuarios;
  readonly revogacao: ListaRevogacao;
}

const naoAutenticado = (codigo: string, mensagem: string) =>
  new ErroDominio('NAO_AUTENTICADO', codigo, mensagem);

const MENSAGEM_REUSO = 'Sessão encerrada por segurança. Entre novamente.';

/**
 * Troca um refresh token válido por um novo par (rotação a cada uso).
 * Reuso de um token já rotacionado/revogado indica roubo: revoga a família
 * inteira e a sessão, derrubando também os access tokens dela (via sid).
 */
export class RenovarSessao {
  constructor(private readonly deps: DepsRenovar) {}

  async executar(entrada: { refreshToken: string; deviceId: string }): Promise<SessaoEmitida> {
    const { deps } = this;
    const armazenado = await deps.sessoes.buscarRefreshPorHash(
      deps.hashToken(entrada.refreshToken),
    );
    if (!armazenado) throw naoAutenticado('REFRESH_INVALIDO', 'Sessão inválida');

    const { sessao } = armazenado;
    const reuso = armazenado.usado || armazenado.revogado || sessao.revogada;
    const outroAparelho = sessao.deviceId !== entrada.deviceId;

    if (reuso || outroAparelho) {
      await this.revogarFamilia(armazenado.familiaId, sessao.id, sessao.sid);
      throw naoAutenticado('REFRESH_REUTILIZADO', MENSAGEM_REUSO);
    }

    if (armazenado.expiraEm <= deps.relogio.agora()) {
      throw naoAutenticado('REFRESH_EXPIRADO', 'Sessão expirada. Entre novamente.');
    }

    const usuario = await deps.usuarios.buscarPorId(sessao.usuarioId);
    if (!usuario || !usuario.ativo || usuario.removido) {
      await this.revogarFamilia(armazenado.familiaId, sessao.id, sessao.sid);
      throw naoAutenticado('REFRESH_INVALIDO', 'Sessão inválida');
    }

    const proximo = novoRefresh(deps, sessao.id, armazenado.familiaId);
    const rotacionou = await deps.sessoes.rotacionar(armazenado.id, proximo.registro);
    if (!rotacionou) {
      // Duas requisições com o mesmo token ao mesmo tempo: trata como reuso.
      await this.revogarFamilia(armazenado.familiaId, sessao.id, sessao.sid);
      throw naoAutenticado('REFRESH_REUTILIZADO', MENSAGEM_REUSO);
    }

    const acesso = deps.tokens.emitirAcesso({
      sub: usuario.publicId,
      role: usuario.role,
      sid: sessao.sid,
    });
    return {
      accessToken: acesso.token,
      refreshToken: proximo.token,
      expiraEm: acesso.expiraEm,
      usuario,
    };
  }

  private async revogarFamilia(familiaId: string, sessaoId: number, sid: string) {
    await this.deps.sessoes.revogarFamilia(familiaId, sessaoId);
    // Access tokens já emitidos para esta sessão vivem no máximo o TTL do acesso.
    await this.deps.revogacao.revogarSid(sid, this.deps.tokens.ttlAcessoSegundos);
  }
}
