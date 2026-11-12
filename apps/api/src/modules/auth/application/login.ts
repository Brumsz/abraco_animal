import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { HasherSenha, RepositorioUsuarios } from './portas.js';
import { iniciarSessao, type DepsSessao, type SessaoEmitida } from './sessoes.js';

export interface DepsLogin extends DepsSessao {
  readonly usuarios: RepositorioUsuarios;
  readonly hasher: HasherSenha;
  /** Hash Argon2id de uma senha qualquer, usado quando o e-mail não existe. */
  readonly hashFicticio: string;
}

export const credenciaisInvalidas = () =>
  new ErroDominio('NAO_AUTENTICADO', 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos');

export class Login {
  constructor(private readonly deps: DepsLogin) {}

  async executar(entrada: {
    email: string;
    senha: string;
    deviceId: string;
  }): Promise<SessaoEmitida> {
    const { deps } = this;
    const usuario = await deps.usuarios.buscarPorEmail(entrada.email.trim().toLowerCase());

    if (!usuario || usuario.removido) {
      // Gasta o mesmo tempo de uma verificação real: não revela se o e-mail existe.
      await deps.hasher.verificar(deps.hashFicticio, entrada.senha);
      throw credenciaisInvalidas();
    }

    if (!(await deps.hasher.verificar(usuario.senhaHash, entrada.senha))) {
      throw credenciaisInvalidas();
    }

    // Só informa conta desativada a quem provou conhecer a senha.
    if (!usuario.ativo) {
      throw new ErroDominio('PROIBIDO', 'CONTA_DESATIVADA', 'Esta conta está desativada');
    }

    if (deps.hasher.precisaRefazer(usuario.senhaHash)) {
      await deps.usuarios.atualizarSenha(usuario.id, await deps.hasher.gerar(entrada.senha));
    }

    return iniciarSessao(deps, usuario, entrada.deviceId);
  }
}
