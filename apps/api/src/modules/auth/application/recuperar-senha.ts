import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { validarPoliticaSenha } from '../../usuarios/domain/senha.js';
import type {
  CifradorDados,
  CofreRedefinicao,
  EmissorTokens,
  FilaEmails,
  GeradorAleatorio,
  HasherSenha,
  ListaRevogacao,
  RepositorioRecuperacao,
  RepositorioSessoes,
  RepositorioUsuarios,
} from './portas.js';

export const VALIDADE_CODIGO_MIN = 15;
export const MAX_TENTATIVAS_CODIGO = 5;
export const VALIDADE_TOKEN_REDEFINICAO_SEG = 600;

export interface DepsRecuperacao {
  readonly usuarios: RepositorioUsuarios;
  readonly recuperacoes: RepositorioRecuperacao;
  readonly cofre: CofreRedefinicao;
  readonly sessoes: RepositorioSessoes;
  readonly revogacao: ListaRevogacao;
  readonly tokens: EmissorTokens;
  readonly hasher: HasherSenha;
  readonly cifrador: CifradorDados;
  readonly aleatorio: GeradorAleatorio;
  readonly emails: FilaEmails;
  readonly relogio: Relogio;
}

// Mesma mensagem para código errado, expirado, esgotado ou e-mail inexistente.
const codigoInvalido = () =>
  new ErroDominio('VALIDACAO', 'CODIGO_INVALIDO', 'Código inválido ou expirado', 'codigo');

/** Passo 1: envia código de 6 dígitos. Nunca revela se o e-mail existe. */
export class SolicitarRecuperacao {
  constructor(private readonly deps: DepsRecuperacao) {}

  async executar(entrada: { email: string }): Promise<void> {
    const { deps } = this;
    const usuario = await deps.usuarios.buscarPorEmail(entrada.email.trim().toLowerCase());
    if (!usuario || !usuario.ativo || usuario.removido) return;

    const codigo = deps.aleatorio.codigoNumerico();
    const expiraEm = new Date(deps.relogio.agora().getTime() + VALIDADE_CODIGO_MIN * 60_000);
    await deps.recuperacoes.criar(usuario.id, deps.cifrador.hashCodigo(codigo), expiraEm);
    await deps.emails.codigoRecuperacao({ para: usuario.email, nome: usuario.nome, codigo });
  }
}

/** Passo 2: confere o código e troca por um token de redefinição de uso único. */
export class VerificarCodigoRecuperacao {
  constructor(private readonly deps: DepsRecuperacao) {}

  async executar(entrada: {
    email: string;
    codigo: string;
  }): Promise<{ tokenRedefinicao: string }> {
    const { deps } = this;
    const agora = deps.relogio.agora();
    const usuario = await deps.usuarios.buscarPorEmail(entrada.email.trim().toLowerCase());
    if (!usuario) throw codigoInvalido();

    const recuperacao = await deps.recuperacoes.buscarAtiva(usuario.id, agora);
    if (!recuperacao) throw codigoInvalido();

    if (recuperacao.tentativas >= MAX_TENTATIVAS_CODIGO) {
      await deps.recuperacoes.marcarUsada(recuperacao.id, agora);
      throw codigoInvalido();
    }

    const confere = deps.cifrador.iguais(
      deps.cifrador.hashCodigo(entrada.codigo),
      recuperacao.codigoHash,
    );
    if (!confere) {
      const tentativas = await deps.recuperacoes.incrementarTentativas(recuperacao.id);
      if (tentativas >= MAX_TENTATIVAS_CODIGO) {
        await deps.recuperacoes.marcarUsada(recuperacao.id, agora);
      }
      throw codigoInvalido();
    }

    await deps.recuperacoes.marcarUsada(recuperacao.id, agora);
    const tokenRedefinicao = deps.aleatorio.token();
    await deps.cofre.guardar(
      deps.cifrador.hashCodigo(tokenRedefinicao),
      usuario.id,
      VALIDADE_TOKEN_REDEFINICAO_SEG,
    );
    return { tokenRedefinicao };
  }
}

/** Passo 3: define a nova senha e encerra todas as sessões do usuário. */
export class RedefinirSenha {
  constructor(private readonly deps: DepsRecuperacao) {}

  async executar(entrada: { tokenRedefinicao: string; novaSenha: string }): Promise<void> {
    const { deps } = this;
    validarPoliticaSenha(entrada.novaSenha, 'novaSenha');

    const usuarioId = await deps.cofre.consumir(deps.cifrador.hashCodigo(entrada.tokenRedefinicao));
    const usuario = usuarioId === null ? null : await deps.usuarios.buscarPorId(usuarioId);
    if (!usuario || !usuario.ativo || usuario.removido) {
      throw new ErroDominio(
        'VALIDACAO',
        'TOKEN_REDEFINICAO_INVALIDO',
        'Pedido expirado. Solicite um novo código.',
      );
    }

    await deps.usuarios.atualizarSenha(usuario.id, await deps.hasher.gerar(entrada.novaSenha));
    const sids = await deps.sessoes.revogarTodasDoUsuario(usuario.id);
    await Promise.all(
      sids.map((sid) => deps.revogacao.revogarSid(sid, deps.tokens.ttlAcessoSegundos)),
    );
    await deps.emails.senhaAlterada({ para: usuario.email, nome: usuario.nome });
  }
}
