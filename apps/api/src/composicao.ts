/**
 * Composition root: o único lugar que conhece as implementações concretas e
 * as injeta nos casos de uso (seção 8). Usado pelo main.ts e pelos testes de
 * integração (com Postgres/Redis reais).
 */
import type { Redis } from 'ioredis';

import type { Ambiente } from './config/ambiente.js';
import type { VerificacaoProntidao } from './http/health.js';
import { CadastrarUsuario } from './modules/auth/application/cadastrar.js';
import { Login } from './modules/auth/application/login.js';
import { Logout } from './modules/auth/application/logout.js';
import type { FilaEmails } from './modules/auth/application/portas.js';
import {
  RedefinirSenha,
  SolicitarRecuperacao,
  VerificarCodigoRecuperacao,
} from './modules/auth/application/recuperar-senha.js';
import { RenovarSessao } from './modules/auth/application/renovar-sessao.js';
import { criarAutenticacao } from './modules/auth/http/autenticacao.js';
import type { DependenciasRotasAuth } from './modules/auth/http/rotas.js';
import {
  CifradorAesGcm,
  geradorCripto,
  hashTokenSha256,
  hasherArgon2,
} from './modules/auth/infrastructure/criptografia.js';
import {
  PrismaRepositorioRecuperacao,
  PrismaRepositorioSessoes,
} from './modules/auth/infrastructure/prisma-repositorios.js';
import {
  CofreRedefinicaoRedis,
  LimitadorTentativas,
  RevogacaoRedis,
} from './modules/auth/infrastructure/redis-auth.js';
import { TokensJwt } from './modules/auth/infrastructure/tokens-jwt.js';
import { PrismaRepositorioUsuarios } from './modules/usuarios/infrastructure/prisma-repositorio-usuarios.js';
import { relogioSistema, type Relogio } from './shared/aplicacao/relogio.js';
import type { Prisma } from './shared/infra/prisma.js';

export interface Infra {
  readonly prisma: Prisma;
  readonly redis: Redis;
  readonly emails: FilaEmails;
  readonly relogio?: Relogio;
}

export type ConfigComposicao = Pick<
  Ambiente,
  | 'JWT_PRIVATE_KEY_B64'
  | 'JWT_PUBLIC_KEY_B64'
  | 'JWT_ISSUER'
  | 'JWT_AUDIENCE'
  | 'ACCESS_TOKEN_TTL_SEGUNDOS'
  | 'REFRESH_TOKEN_TTL_DIAS'
  | 'DADOS_CRYPTO_KEY_B64'
  | 'DADOS_CRYPTO_KEY_VERSAO'
  | 'CPF_HMAC_KEY_B64'
  | 'CODIGOS_HMAC_KEY_B64'
>;

export async function comporAuth(config: ConfigComposicao, infra: Infra) {
  const relogio = infra.relogio ?? relogioSistema;
  const usuarios = new PrismaRepositorioUsuarios(infra.prisma);
  const sessoes = new PrismaRepositorioSessoes(infra.prisma);
  const recuperacoes = new PrismaRepositorioRecuperacao(infra.prisma);
  const revogacao = new RevogacaoRedis(infra.redis);
  const tokens = new TokensJwt(
    {
      chavePrivadaPem: config.JWT_PRIVATE_KEY_B64,
      chavePublicaPem: config.JWT_PUBLIC_KEY_B64,
      emissor: config.JWT_ISSUER,
      audiencia: config.JWT_AUDIENCE,
      ttlSegundos: config.ACCESS_TOKEN_TTL_SEGUNDOS,
    },
    relogio,
  );
  const cifrador = new CifradorAesGcm(
    config.DADOS_CRYPTO_KEY_VERSAO,
    { [config.DADOS_CRYPTO_KEY_VERSAO]: Buffer.from(config.DADOS_CRYPTO_KEY_B64, 'base64') },
    Buffer.from(config.CPF_HMAC_KEY_B64, 'base64'),
    Buffer.from(config.CODIGOS_HMAC_KEY_B64, 'base64'),
  );

  const base = {
    usuarios,
    sessoes,
    recuperacoes,
    revogacao,
    tokens,
    cifrador,
    hasher: hasherArgon2,
    aleatorio: geradorCripto,
    hashToken: hashTokenSha256,
    relogio,
    emails: infra.emails,
    cofre: new CofreRedefinicaoRedis(infra.redis),
    refreshTtlDias: config.REFRESH_TOKEN_TTL_DIAS,
    // Gerado no boot: usado para igualar o tempo de resposta de e-mails inexistentes.
    hashFicticio: await hasherArgon2.gerar(geradorCripto.token()),
  };

  const rotas: DependenciasRotasAuth = {
    cadastrar: new CadastrarUsuario(base),
    login: new Login(base),
    renovar: new RenovarSessao(base),
    logout: new Logout(base),
    solicitarRecuperacao: new SolicitarRecuperacao(base),
    verificarCodigo: new VerificarCodigoRecuperacao(base),
    redefinirSenha: new RedefinirSenha(base),
    buscarUsuario: (publicId) => usuarios.buscarPorPublicId(publicId),
    limitador: new LimitadorTentativas(infra.redis),
    autenticacao: criarAutenticacao(tokens, revogacao),
  };

  return { rotas, tokens, sessoes, revogacao, cifrador };
}

export function verificacoesProntidao(infra: Infra): VerificacaoProntidao[] {
  return [
    {
      nome: 'postgres',
      verificar: async () => {
        await infra.prisma.$queryRaw`SELECT 1`;
      },
    },
    {
      nome: 'redis',
      verificar: async () => {
        // ping() lança se o Redis não responder.
        await infra.redis.ping();
      },
    },
  ];
}
