/**
 * Casos de uso de "minha conta". Sempre sobre o usuário do token (`sub`): não há
 * id na rota, então não existe IDOR possível aqui.
 */
import { problemaNome } from '@abraco/shared';

import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import type {
  CifradorDados,
  ClaimsAcesso,
  EmissorTokens,
  EnderecoUsuario,
  FilaEmails,
  GeradorAleatorio,
  HasherSenha,
  ListaRevogacao,
  RepositorioUsuarios,
  UsuarioAuth,
} from '../../auth/application/portas.js';
import { validarPoliticaSenha } from '../../usuarios/domain/senha.js';
import { Telefone } from '../../usuarios/domain/telefone.js';
import type { AlteracaoPerfil, RepositorioConta, ResumoConta } from './portas.js';

export interface DepsConta {
  readonly usuarios: RepositorioUsuarios;
  readonly conta: RepositorioConta;
  readonly hasher: HasherSenha;
  readonly cifrador: CifradorDados;
  readonly revogacao: ListaRevogacao;
  readonly tokens: Pick<EmissorTokens, 'ttlAcessoSegundos'>;
  readonly emails: Pick<FilaEmails, 'senhaAlterada'>;
  readonly aleatorio: Pick<GeradorAleatorio, 'uuid' | 'token'>;
  readonly relogio: Relogio;
}

const sessaoInvalida = () =>
  new ErroDominio('NAO_AUTENTICADO', 'TOKEN_INVALIDO', 'Sessão inválida ou expirada');

/** Usuário do token, ativo e não removido (senão a sessão não vale mais). */
async function usuarioAtual(deps: DepsConta, claims: ClaimsAcesso): Promise<UsuarioAuth> {
  const u = await deps.usuarios.buscarPorPublicId(claims.sub);
  if (!u || u.removido || !u.ativo) throw sessaoInvalida();
  return u;
}

async function revogarNoRedis(deps: DepsConta, sids: readonly string[]) {
  await Promise.all(
    sids.map((sid) => deps.revogacao.revogarSid(sid, deps.tokens.ttlAcessoSegundos)),
  );
}

/** Senha conferida em tempo constante (Argon2); erro no campo `campo`. */
async function exigirSenha(deps: DepsConta, u: UsuarioAuth, senha: string, campo: string) {
  if (!(await deps.hasher.verificar(u.senhaHash, senha))) {
    throw erroValidacao('SENHA_INCORRETA', 'Senha incorreta', campo);
  }
}

export class ObterResumoConta {
  constructor(private readonly deps: DepsConta) {}
  async executar(claims: ClaimsAcesso): Promise<ResumoConta> {
    const u = await usuarioAtual(this.deps, claims);
    return this.deps.conta.resumo(u.id);
  }
}

/**
 * Editar perfil: nome, telefone e endereço. E-mail e CPF não mudam por aqui
 * (e-mail exigiria confirmação; CPF é documento — fala com a ONG).
 */
export class AtualizarPerfil {
  constructor(private readonly deps: DepsConta) {}

  async executar(
    claims: ClaimsAcesso,
    entrada: {
      nome?: string | undefined;
      telefone?: string | undefined;
      endereco?: EnderecoUsuario | undefined;
    },
  ): Promise<UsuarioAuth> {
    const u = await usuarioAtual(this.deps, claims);
    const dados: { -readonly [K in keyof AlteracaoPerfil]: AlteracaoPerfil[K] } = {};
    if (entrada.nome !== undefined) {
      const nome = entrada.nome.trim().replace(/\s+/g, ' ');
      const problema = problemaNome(nome);
      if (problema) throw erroValidacao('NOME_INVALIDO', problema, 'nome');
      dados.nome = nome;
    }
    if (entrada.telefone !== undefined) dados.telefone = Telefone.criar(entrada.telefone).digitos;
    if (entrada.endereco !== undefined) {
      dados.endereco = {
        ...entrada.endereco,
        cep: entrada.endereco.cep.replace(/\D/g, ''),
        uf: entrada.endereco.uf.toUpperCase(),
      };
    }
    if (Object.keys(dados).length > 0) await this.deps.conta.atualizarPerfil(u.id, dados);
    const atualizado = await this.deps.usuarios.buscarPorId(u.id);
    if (!atualizado) throw sessaoInvalida();
    return atualizado;
  }
}

/**
 * Trocar a senha logado: confere a atual, aplica a política e encerra as OUTRAS
 * sessões (um aparelho roubado perde o acesso; este continua logado).
 */
export class AlterarSenha {
  constructor(private readonly deps: DepsConta) {}

  async executar(
    claims: ClaimsAcesso,
    entrada: { senhaAtual: string; novaSenha: string },
  ): Promise<void> {
    const { deps } = this;
    const u = await usuarioAtual(deps, claims);
    await exigirSenha(deps, u, entrada.senhaAtual, 'senhaAtual');
    validarPoliticaSenha(entrada.novaSenha, 'novaSenha');
    if (entrada.novaSenha === entrada.senhaAtual) {
      throw erroValidacao(
        'SENHA_REPETIDA',
        'A nova senha deve ser diferente da atual',
        'novaSenha',
      );
    }
    await deps.usuarios.atualizarSenha(u.id, await deps.hasher.gerar(entrada.novaSenha));
    await revogarNoRedis(deps, await deps.conta.revogarOutrasSessoes(u.id, claims.sid));
    await deps.emails.senhaAlterada({ para: u.email, nome: u.nome });
  }
}

/** LGPD art. 18, II e V: cópia de tudo o que a ONG guarda sobre a pessoa. */
export class ExportarDados {
  constructor(private readonly deps: DepsConta) {}

  async executar(claims: ClaimsAcesso) {
    const { deps } = this;
    const u = await usuarioAtual(deps, claims);
    const bruto = await deps.conta.dadosExportacao(u.id);
    return {
      geradoEm: deps.relogio.agora(),
      titular: {
        id: u.publicId,
        nome: u.nome,
        email: u.email,
        telefone: u.telefone,
        cpf: deps.cifrador.decifrar(bruto.cpf),
        dataNasc: deps.cifrador.decifrar(bruto.dataNasc),
        endereco: u.endereco,
        papel: u.role,
        criadoEm: u.criadoEm,
      },
      consentimentos: {
        termosDeUsoEm: bruto.aceitouTermosEm,
        tratamentoDeDadosEm: bruto.consentimentoDadosEm,
      },
      adocoes: bruto.adocoes,
      doacoesAnimais: bruto.doacoesAnimais,
      doacoesFinanceiras: bruto.doacoesFinanceiras,
      apadrinhamentos: bruto.apadrinhamentos,
      voluntariado: bruto.voluntariado,
      mensagensEnviadas: bruto.mensagens,
      totalCurtidas: bruto.curtidas,
      sessoes: bruto.sessoes,
    };
  }
}

/**
 * LGPD art. 18, VI: exclusão por anonimização. Pede a senha (ação irreversível) e
 * não deixa a ONG sem nenhum admin.
 */
export class ExcluirConta {
  constructor(private readonly deps: DepsConta) {}

  async executar(claims: ClaimsAcesso, entrada: { senha: string }): Promise<void> {
    const { deps } = this;
    const u = await usuarioAtual(deps, claims);
    await exigirSenha(deps, u, entrada.senha, 'senha');
    if (u.role === 'ADMIN' && (await deps.conta.contarAdminsAtivos()) <= 1) {
      throw new ErroDominio(
        'REGRA_NEGOCIO',
        'ULTIMO_ADMIN',
        'Você é o único admin. Promova outra pessoa antes de excluir sua conta.',
      );
    }
    const id = deps.aleatorio.uuid();
    const sids = await deps.conta.anonimizar(u.id, {
      email: `removido+${id}@anon.invalid`,
      cpfHash: `removido:${id}`,
      // Hash de uma senha aleatória descartada: ninguém consegue entrar.
      senhaHash: await deps.hasher.gerar(deps.aleatorio.token()),
      vazioCifrado: deps.cifrador.cifrar(''),
      agora: deps.relogio.agora(),
    });
    await revogarNoRedis(deps, sids);
  }
}
