/**
 * Composition root: o único lugar que conhece as implementações concretas e
 * as injeta nos casos de uso (seção 8). Usado pelo main.ts e pelos testes de
 * integração (com Postgres/Redis reais).
 */
import type { Redis } from 'ioredis';

import type { Ambiente } from './config/ambiente.js';
import type { VerificacaoProntidao } from './http/health.js';
import {
  AdminListarAdocoes,
  AdminObterAdocao,
  AprovarAdocao,
  ListarMinhasAdocoes,
  ObterAdocao,
  RecusarAdocao,
  SolicitarAdocao,
} from './modules/adocoes/application/casos-de-uso.js';
import type { DependenciasRotasAdocoes } from './modules/adocoes/http/rotas.js';
import { PrismaRepositorioAdocoes } from './modules/adocoes/infrastructure/prisma-repositorio-adocoes.js';
import { ListarAnimais, ObterAnimal } from './modules/animais/application/consultar-animais.js';
import {
  EnviarFotosAnimal,
  RemoverFotoAnimal,
  ReordenarFotosAnimal,
} from './modules/animais/application/fotos-animal.js';
import {
  AlterarStatusAnimal,
  AtualizarAnimal,
  CriarAnimal,
  RemoverAnimal,
} from './modules/animais/application/gerenciar-animais.js';
import type { DependenciasRotasAnimais } from './modules/animais/http/rotas.js';
import { PrismaRepositorioAnimais } from './modules/animais/infrastructure/prisma-repositorio-animais.js';
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
import { criarAutenticacao, type Autenticacao } from './modules/auth/http/autenticacao.js';
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
import {
  AdminListarDoacoes,
  AdminObterDoacao,
  AprovarDoacao,
  DoarAnimal,
  ListarMinhasDoacoes,
  ObterDoacao,
  ReceberDoacao,
  RecusarDoacao,
} from './modules/doacoes-animais/application/casos-de-uso.js';
import type { DependenciasRotasDoacoesAnimais } from './modules/doacoes-animais/http/rotas.js';
import { PrismaRepositorioDoacoesAnimais } from './modules/doacoes-animais/infrastructure/prisma-repositorio-doacoes-animais.js';
import {
  ConsultarStatusPix,
  GerarPix,
  ListarMinhasDoacoesFinanceiras,
  ProcessarWebhookPix,
} from './modules/doacoes-financeiras/application/casos-de-uso.js';
import type {
  EmailsDoacaoFinanceira,
  GatewayPix,
} from './modules/doacoes-financeiras/application/portas.js';
import type { DependenciasRotasPix } from './modules/doacoes-financeiras/http/rotas.js';
import { GatewayAsaas } from './modules/doacoes-financeiras/infrastructure/gateway-asaas.js';
import { GatewaySimulado } from './modules/doacoes-financeiras/infrastructure/gateway-simulado.js';
import { PrismaRepositorioDoacoesFinanceiras } from './modules/doacoes-financeiras/infrastructure/prisma-repositorio-doacoes-financeiras.js';
import {
  ContarNaoLidas,
  ListarNotificacoes,
  MarcarNotificacaoLida,
  MarcarTodasLidas,
} from './modules/notificacoes/application/casos-de-uso.js';
import type { DependenciasRotasNotificacoes } from './modules/notificacoes/http/rotas.js';
import { PrismaRepositorioNotificacoes } from './modules/notificacoes/infrastructure/prisma-repositorio-notificacoes.js';
import { PrismaRepositorioUsuarios } from './modules/usuarios/infrastructure/prisma-repositorio-usuarios.js';
import type { ArmazenamentoObjetos } from './shared/aplicacao/armazenamento.js';
import type { EmailsAdocao } from './shared/aplicacao/emails-adocao.js';
import type { EmailsDoacaoAnimal } from './shared/aplicacao/emails-doacao-animal.js';
import type { ProcessadorImagens } from './shared/aplicacao/imagens.js';
import { relogioSistema, type Relogio } from './shared/aplicacao/relogio.js';
import { ProcessadorImagensSharp } from './shared/infra/processador-imagens-sharp.js';
import type { Prisma } from './shared/infra/prisma.js';

export interface Infra {
  readonly prisma: Prisma;
  readonly redis: Redis;
  readonly emails: FilaEmails & EmailsAdocao & EmailsDoacaoAnimal & EmailsDoacaoFinanceira;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly imagens?: ProcessadorImagens;
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

export function comporAnimais(infra: Infra, autenticacao: Autenticacao): DependenciasRotasAnimais {
  const deps = {
    animais: new PrismaRepositorioAnimais(infra.prisma),
    armazenamento: infra.armazenamento,
    imagens: infra.imagens ?? new ProcessadorImagensSharp(),
    relogio: infra.relogio ?? relogioSistema,
  };
  return {
    listar: new ListarAnimais(deps),
    obter: new ObterAnimal(deps),
    criar: new CriarAnimal(deps),
    atualizar: new AtualizarAnimal(deps),
    alterarStatus: new AlterarStatusAnimal(deps),
    remover: new RemoverAnimal(deps),
    enviarFotos: new EnviarFotosAnimal(deps),
    removerFoto: new RemoverFotoAnimal(deps),
    reordenarFotos: new ReordenarFotosAnimal(deps),
    autenticacao,
  };
}

export function comporAdocoes(
  infra: Infra,
  autenticacao: Autenticacao,
  opcoes: { aoFalharEmail?: (erro: unknown) => void } = {},
): DependenciasRotasAdocoes {
  const deps = {
    adocoes: new PrismaRepositorioAdocoes(infra.prisma),
    animais: new PrismaRepositorioAnimais(infra.prisma),
    armazenamento: infra.armazenamento,
    emails: infra.emails,
    relogio: infra.relogio ?? relogioSistema,
    ...(opcoes.aoFalharEmail ? { aoFalharEmail: opcoes.aoFalharEmail } : {}),
  };
  return {
    solicitar: new SolicitarAdocao(deps),
    listarMinhas: new ListarMinhasAdocoes(deps),
    obter: new ObterAdocao(deps),
    adminListar: new AdminListarAdocoes(deps),
    adminObter: new AdminObterAdocao(deps),
    aprovar: new AprovarAdocao(deps),
    recusar: new RecusarAdocao(deps),
    limitador: new LimitadorTentativas(infra.redis),
    autenticacao,
  };
}

export function comporDoacoesAnimais(
  infra: Infra,
  autenticacao: Autenticacao,
  opcoes: { aoFalharEmail?: (erro: unknown) => void } = {},
): DependenciasRotasDoacoesAnimais {
  const deps = {
    doacoes: new PrismaRepositorioDoacoesAnimais(infra.prisma),
    armazenamento: infra.armazenamento,
    imagens: infra.imagens ?? new ProcessadorImagensSharp(),
    emails: infra.emails,
    relogio: infra.relogio ?? relogioSistema,
    ...(opcoes.aoFalharEmail ? { aoFalharEmail: opcoes.aoFalharEmail } : {}),
  };
  return {
    doar: new DoarAnimal(deps),
    listarMinhas: new ListarMinhasDoacoes(deps),
    obter: new ObterDoacao(deps),
    adminListar: new AdminListarDoacoes(deps),
    adminObter: new AdminObterDoacao(deps),
    aprovar: new AprovarDoacao(deps),
    recusar: new RecusarDoacao(deps),
    receber: new ReceberDoacao(deps),
    limitador: new LimitadorTentativas(infra.redis),
    autenticacao,
  };
}

export type ConfigPix = Pick<
  Ambiente,
  | 'NODE_ENV'
  | 'ASAAS_API_URL'
  | 'ASAAS_API_KEY'
  | 'ASAAS_CLIENTE_ID'
  | 'ASAAS_WEBHOOK_TOKEN'
  | 'PIX_EXPIRACAO_MINUTOS'
>;

/**
 * Asaas real quando há ASAAS_API_KEY; senão o simulador (a configuração já
 * proíbe isso em produção, e a rota de simulação também confere NODE_ENV).
 */
export function comporPix(
  config: ConfigPix,
  infra: Infra,
  autenticacao: Autenticacao,
  opcoes: { aoFalhar?: (contexto: string, erro: unknown) => void; gateway?: GatewayPix } = {},
): DependenciasRotasPix {
  const doacoes = new PrismaRepositorioDoacoesFinanceiras(infra.prisma);
  const simulado = !opcoes.gateway && !config.ASAAS_API_KEY ? new GatewaySimulado() : undefined;
  const gateway =
    opcoes.gateway ??
    simulado ??
    new GatewayAsaas({
      url: config.ASAAS_API_URL,
      apiKey: config.ASAAS_API_KEY ?? '',
      clienteId: config.ASAAS_CLIENTE_ID ?? '',
    });
  const deps = {
    doacoes,
    gateway,
    emails: infra.emails,
    relogio: infra.relogio ?? relogioSistema,
    expiracaoMinutos: config.PIX_EXPIRACAO_MINUTOS,
    ...(opcoes.aoFalhar ? { aoFalhar: opcoes.aoFalhar } : {}),
  };
  return {
    gerar: new GerarPix(deps),
    consultar: new ConsultarStatusPix(deps),
    listarMinhas: new ListarMinhasDoacoesFinanceiras(deps),
    webhook: new ProcessarWebhookPix(deps),
    limitador: new LimitadorTentativas(infra.redis),
    autenticacao,
    tokenWebhook: config.ASAAS_WEBHOOK_TOKEN,
    ...(simulado && config.NODE_ENV !== 'production'
      ? { simulador: { gateway: simulado, doacoes } }
      : {}),
  };
}

export function comporNotificacoes(
  infra: Infra,
  autenticacao: Autenticacao,
): DependenciasRotasNotificacoes {
  const deps = {
    notificacoes: new PrismaRepositorioNotificacoes(infra.prisma),
    relogio: infra.relogio ?? relogioSistema,
  };
  return {
    listar: new ListarNotificacoes(deps),
    contar: new ContarNaoLidas(deps),
    marcarLida: new MarcarNotificacaoLida(deps),
    marcarTodas: new MarcarTodasLidas(deps),
    autenticacao,
  };
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
