/**
 * Portas do módulo de autenticação. A camada application depende só destas
 * interfaces; as implementações (Prisma, Redis, Argon2, AES, JWT, BullMQ) ficam
 * em infrastructure/ e são injetadas no composition root (main.ts).
 */
import type { Role } from '@abraco/shared';

// ─── Usuários ──────────────────────────────────────────────────────────────

export interface EnderecoUsuario {
  readonly cep: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string | null;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
}

export interface DadoCifrado {
  readonly cifrado: Uint8Array;
  readonly iv: Uint8Array;
  readonly tag: Uint8Array;
}

/** Visão do usuário usada pela autenticação (sem CPF/data de nascimento). */
export interface UsuarioAuth {
  readonly id: number;
  readonly publicId: string;
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly senhaHash: string;
  readonly role: Role;
  readonly ativo: boolean;
  readonly removido: boolean;
  readonly endereco: EnderecoUsuario;
  readonly fotoUrl: string | null;
  readonly capaUrl: string | null;
  readonly criadoEm: Date;
}

export interface NovoUsuario {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly senhaHash: string;
  readonly cpf: DadoCifrado;
  readonly cpfHash: string;
  readonly dataNasc: DadoCifrado;
  readonly endereco: EnderecoUsuario;
  readonly aceitouTermosEm: Date;
  readonly consentimentoDadosEm: Date;
}

export interface RepositorioUsuarios {
  buscarPorEmail(email: string): Promise<UsuarioAuth | null>;
  buscarPorId(id: number): Promise<UsuarioAuth | null>;
  buscarPorPublicId(publicId: string): Promise<UsuarioAuth | null>;
  existeEmailOuCpf(email: string, cpfHash: string): Promise<boolean>;
  /** Lança ErroDominio CONFLITO se e-mail/CPF já existirem (corrida). */
  criar(dados: NovoUsuario): Promise<UsuarioAuth>;
  atualizarSenha(id: number, senhaHash: string): Promise<void>;
}

// ─── Sessões e refresh tokens ──────────────────────────────────────────────

export interface Sessao {
  readonly id: number;
  readonly sid: string;
  readonly usuarioId: number;
  readonly deviceId: string;
  readonly revogada: boolean;
}

export interface RefreshArmazenado {
  readonly id: number;
  readonly familiaId: string;
  readonly expiraEm: Date;
  readonly usado: boolean;
  readonly revogado: boolean;
  readonly sessao: Sessao;
}

export interface NovoRefresh {
  readonly sessaoId: number;
  readonly familiaId: string;
  readonly tokenHash: string;
  readonly expiraEm: Date;
}

export interface RepositorioSessoes {
  criarSessao(usuarioId: number, deviceId: string): Promise<Sessao>;
  buscarSessaoPorSid(sid: string): Promise<Sessao | null>;
  salvarRefresh(dados: NovoRefresh): Promise<void>;
  buscarRefreshPorHash(tokenHash: string): Promise<RefreshArmazenado | null>;
  /**
   * Marca o token antigo como usado e grava o substituto numa transação.
   * Retorna false se o antigo já tinha sido usado/revogado (corrida = reuso).
   */
  rotacionar(antigoId: number, novo: NovoRefresh): Promise<boolean>;
  /** Revoga todos os tokens da família e a sessão dona dela. */
  revogarFamilia(familiaId: string, sessaoId: number): Promise<void>;
  revogarSessao(sid: string): Promise<void>;
  /** Revoga todas as sessões do usuário; retorna os sids revogados. */
  revogarTodasDoUsuario(usuarioId: number): Promise<string[]>;
}

// ─── Recuperação de senha ──────────────────────────────────────────────────

export interface Recuperacao {
  readonly id: number;
  readonly usuarioId: number;
  readonly codigoHash: string;
  readonly tentativas: number;
  readonly expiraEm: Date;
}

export interface RepositorioRecuperacao {
  /** Invalida códigos anteriores do usuário e cria um novo. */
  criar(usuarioId: number, codigoHash: string, expiraEm: Date): Promise<void>;
  buscarAtiva(usuarioId: number, agora: Date): Promise<Recuperacao | null>;
  incrementarTentativas(id: number): Promise<number>;
  marcarUsada(id: number, agora: Date): Promise<void>;
}

/** Guarda o token de redefinição (uso único, curta duração). */
export interface CofreRedefinicao {
  guardar(tokenHash: string, usuarioId: number, ttlSegundos: number): Promise<void>;
  /** Lê e apaga atomicamente. */
  consumir(tokenHash: string): Promise<number | null>;
}

// ─── Criptografia, tokens e revogação ──────────────────────────────────────

export interface HasherSenha {
  gerar(senha: string): Promise<string>;
  verificar(hash: string, senha: string): Promise<boolean>;
  /** Hash gerado com parâmetros antigos (deve ser refeito no próximo login). */
  precisaRefazer(hash: string): boolean;
}

export interface CifradorDados {
  cifrar(texto: string): DadoCifrado;
  decifrar(dado: DadoCifrado): string;
  /** HMAC-SHA256 determinístico para blind index (ex.: CPF). */
  indiceCpf(cpfDigitos: string): string;
  /** HMAC-SHA256 de códigos/tokens de uso único. */
  hashCodigo(codigo: string): string;
  /** Comparação em tempo constante. */
  iguais(a: string, b: string): boolean;
}

export interface ClaimsAcesso {
  readonly sub: string;
  readonly role: Role;
  readonly sid: string;
  readonly jti: string;
  readonly exp: number;
  readonly iat: number;
}

export interface EmissorTokens {
  emitirAcesso(dados: { sub: string; role: Role; sid: string }): {
    token: string;
    jti: string;
    expiraEm: Date;
  };
  /** Lança ErroDominio NAO_AUTENTICADO para token inválido/expirado. */
  verificarAcesso(token: string): ClaimsAcesso;
  readonly ttlAcessoSegundos: number;
}

export interface ListaRevogacao {
  revogarJti(jti: string, ttlSegundos: number): Promise<void>;
  revogarSid(sid: string, ttlSegundos: number): Promise<void>;
  estaRevogado(jti: string, sid: string): Promise<boolean>;
}

export interface GeradorAleatorio {
  /** 256 bits em base64url. */
  token(): string;
  /** 6 dígitos, distribuição uniforme. */
  codigoNumerico(): string;
  uuid(): string;
}

/** Hash de busca do refresh token (SHA-256 — o token já tem 256 bits de entropia). */
export type HashToken = (token: string) => string;

// ─── E-mail ────────────────────────────────────────────────────────────────

export interface FilaEmails {
  codigoRecuperacao(dados: { para: string; nome: string; codigo: string }): Promise<void>;
  senhaAlterada(dados: { para: string; nome: string }): Promise<void>;
}
