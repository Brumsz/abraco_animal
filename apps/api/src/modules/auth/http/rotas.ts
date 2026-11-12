import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { CadastrarUsuario } from '../application/cadastrar.js';
import type { Login } from '../application/login.js';
import type { Logout } from '../application/logout.js';
import type { UsuarioAuth } from '../application/portas.js';
import type {
  RedefinirSenha,
  SolicitarRecuperacao,
  VerificarCodigoRecuperacao,
} from '../application/recuperar-senha.js';
import type { RenovarSessao } from '../application/renovar-sessao.js';
import type { SessaoEmitida } from '../application/sessoes.js';
import {
  REGRAS,
  type LimitadorTentativas,
  type RegraLimite,
} from '../infrastructure/redis-auth.js';
import { claimsDe, type Autenticacao } from './autenticacao.js';
import {
  cadastroEntrada,
  loginEntrada,
  redefinirEntrada,
  refreshEntrada,
  sessaoSaida,
  solicitarRecuperacaoEntrada,
  tokenRedefinicaoSaida,
  usuarioPerfilSaida,
  verificarCodigoEntrada,
} from './esquemas.js';

export interface DependenciasRotasAuth {
  readonly cadastrar: CadastrarUsuario;
  readonly login: Login;
  readonly renovar: RenovarSessao;
  readonly logout: Logout;
  readonly solicitarRecuperacao: SolicitarRecuperacao;
  readonly verificarCodigo: VerificarCodigoRecuperacao;
  readonly redefinirSenha: RedefinirSenha;
  readonly buscarUsuario: (publicId: string) => Promise<UsuarioAuth | null>;
  readonly limitador: LimitadorTentativas;
  readonly autenticacao: Autenticacao;
}

const perfil = (u: UsuarioAuth) => ({ ...u, id: u.publicId });
const sessao = (s: SessaoEmitida) => ({ ...s, usuario: perfil(s.usuario) });

async function aplicarLimite(
  limitador: LimitadorTentativas,
  regra: RegraLimite,
  identificador: string,
  reply: FastifyReply,
): Promise<void> {
  const resultado = await limitador.consumir(regra, identificador);
  if (!resultado.permitido) {
    void reply.header('Retry-After', String(resultado.tentarEmSegundos));
    throw new ErroDominio(
      'LIMITE_EXCEDIDO',
      'MUITAS_TENTATIVAS',
      'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    );
  }
}

const ip = (request: FastifyRequest) => request.ip;

export function rotasAuth(deps: DependenciasRotasAuth): FastifyPluginAsyncZod {
  const { autenticar } = deps.autenticacao;

  return (app) => {
    app.post(
      '/auth/cadastro',
      { schema: { body: cadastroEntrada, response: { 201: sessaoSaida } } },
      async (request, reply) => {
        const resultado = await deps.cadastrar.executar(request.body);
        return reply.code(201).send(sessao(resultado));
      },
    );

    app.post(
      '/auth/login',
      { schema: { body: loginEntrada, response: { 200: sessaoSaida } } },
      async (request, reply) => {
        await aplicarLimite(deps.limitador, REGRAS.login, ip(request), reply);
        const resultado = await deps.login.executar(request.body);
        await deps.limitador.limpar(REGRAS.login, ip(request));
        return sessao(resultado);
      },
    );

    app.post(
      '/auth/refresh',
      { schema: { body: refreshEntrada, response: { 200: sessaoSaida } } },
      async (request) => sessao(await deps.renovar.executar(request.body)),
    );

    app.post('/auth/logout', { preHandler: autenticar }, async (request, reply) => {
      await deps.logout.executar(claimsDe(request));
      return reply.code(204).send();
    });

    app.post(
      '/auth/recuperar-senha/solicitar',
      { schema: { body: solicitarRecuperacaoEntrada } },
      async (request, reply) => {
        const email = request.body.email.trim().toLowerCase();
        await aplicarLimite(deps.limitador, REGRAS.recuperacaoPorEmail, email, reply);
        await deps.solicitarRecuperacao.executar({ email });
        // Sempre 202: a resposta não revela se a conta existe.
        return reply.code(202).send();
      },
    );

    app.post(
      '/auth/recuperar-senha/verificar-codigo',
      { schema: { body: verificarCodigoEntrada, response: { 200: tokenRedefinicaoSaida } } },
      async (request, reply) => {
        await aplicarLimite(deps.limitador, REGRAS.verificacaoCodigoPorIp, ip(request), reply);
        return deps.verificarCodigo.executar(request.body);
      },
    );

    app.post(
      '/auth/recuperar-senha/redefinir',
      { schema: { body: redefinirEntrada } },
      async (request, reply) => {
        await deps.redefinirSenha.executar(request.body);
        return reply.code(204).send();
      },
    );

    app.get(
      '/me',
      { preHandler: autenticar, schema: { response: { 200: usuarioPerfilSaida } } },
      async (request) => {
        const usuario = await deps.buscarUsuario(claimsDe(request).sub);
        if (!usuario || usuario.removido || !usuario.ativo) {
          throw new ErroDominio('NAO_AUTENTICADO', 'TOKEN_INVALIDO', 'Sessão inválida ou expirada');
        }
        return perfil(usuario);
      },
    );
    return Promise.resolve();
  };
}
