/**
 * Implementações em memória das portas — usadas só nos testes unitários dos
 * casos de uso. Simulam o comportamento observável das reais (incluindo
 * corridas na rotação de refresh).
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { ErroDominio } from '../../../../shared/dominio/erros.js';
import type { Relogio } from '../../../../shared/aplicacao/relogio.js';
import type {
  ClaimsAcesso,
  CifradorDados,
  CofreRedefinicao,
  DadoCifrado,
  EmissorTokens,
  FilaEmails,
  GeradorAleatorio,
  HasherSenha,
  ListaRevogacao,
  NovoRefresh,
  NovoUsuario,
  Recuperacao,
  RefreshArmazenado,
  RepositorioRecuperacao,
  RepositorioSessoes,
  RepositorioUsuarios,
  Sessao,
  UsuarioAuth,
} from '../portas.js';

export class RelogioFake implements Relogio {
  constructor(public atual = new Date('2026-11-11T12:00:00Z')) {}
  agora() {
    return new Date(this.atual);
  }
  avancar(ms: number) {
    this.atual = new Date(this.atual.getTime() + ms);
  }
}

export class UsuariosFake implements RepositorioUsuarios {
  readonly lista: (UsuarioAuth & { cpfHash: string; dados: NovoUsuario })[] = [];
  private seq = 0;

  buscarPorEmail(email: string) {
    return Promise.resolve(this.lista.find((u) => u.email === email) ?? null);
  }
  buscarPorId(id: number) {
    return Promise.resolve(this.lista.find((u) => u.id === id) ?? null);
  }
  buscarPorPublicId(publicId: string) {
    return Promise.resolve(this.lista.find((u) => u.publicId === publicId) ?? null);
  }
  existeEmailOuCpf(email: string, cpfHash: string) {
    return Promise.resolve(this.lista.some((u) => u.email === email || u.cpfHash === cpfHash));
  }
  criar(dados: NovoUsuario) {
    if (this.lista.some((u) => u.email === dados.email || u.cpfHash === dados.cpfHash)) {
      return Promise.reject(new ErroDominio('CONFLITO', 'CADASTRO_DUPLICADO', 'duplicado'));
    }
    this.seq += 1;
    const usuario = {
      id: this.seq,
      publicId: randomUUID(),
      nome: dados.nome,
      email: dados.email,
      telefone: dados.telefone,
      senhaHash: dados.senhaHash,
      role: 'USUARIO' as const,
      ativo: true,
      removido: false,
      endereco: dados.endereco,
      fotoUrl: null,
      capaUrl: null,
      criadoEm: new Date(),
      cpfHash: dados.cpfHash,
      dados,
    };
    this.lista.push(usuario);
    return Promise.resolve(usuario);
  }
  atualizarSenha(id: number, senhaHash: string) {
    const i = this.lista.findIndex((u) => u.id === id);
    const atual = this.lista[i];
    if (atual) this.lista[i] = { ...atual, senhaHash };
    return Promise.resolve();
  }
  alterar(id: number, mudancas: Partial<UsuarioAuth>) {
    const i = this.lista.findIndex((u) => u.id === id);
    const atual = this.lista[i];
    if (atual) this.lista[i] = { ...atual, ...mudancas };
  }
}

interface RefreshFake extends NovoRefresh {
  id: number;
  usadoEm: Date | null;
  revogadoEm: Date | null;
}

export class SessoesFake implements RepositorioSessoes {
  readonly sessoes: (Sessao & { revogada: boolean })[] = [];
  readonly refreshes: RefreshFake[] = [];
  private seqSessao = 0;
  private seqRefresh = 0;

  criarSessao(usuarioId: number, deviceId: string) {
    this.seqSessao += 1;
    const sessao = { id: this.seqSessao, sid: randomUUID(), usuarioId, deviceId, revogada: false };
    this.sessoes.push(sessao);
    return Promise.resolve(sessao);
  }
  buscarSessaoPorSid(sid: string) {
    return Promise.resolve(this.sessoes.find((s) => s.sid === sid) ?? null);
  }
  salvarRefresh(dados: NovoRefresh) {
    this.seqRefresh += 1;
    this.refreshes.push({ ...dados, id: this.seqRefresh, usadoEm: null, revogadoEm: null });
    return Promise.resolve();
  }
  buscarRefreshPorHash(tokenHash: string): Promise<RefreshArmazenado | null> {
    const r = this.refreshes.find((x) => x.tokenHash === tokenHash);
    const sessao = r && this.sessoes.find((s) => s.id === r.sessaoId);
    if (!r || !sessao) return Promise.resolve(null);
    return Promise.resolve({
      id: r.id,
      familiaId: r.familiaId,
      expiraEm: r.expiraEm,
      usado: r.usadoEm !== null,
      revogado: r.revogadoEm !== null,
      sessao: { ...sessao },
    });
  }
  rotacionar(antigoId: number, novo: NovoRefresh) {
    const antigo = this.refreshes.find((r) => r.id === antigoId);
    if (!antigo || antigo.usadoEm || antigo.revogadoEm) return Promise.resolve(false);
    antigo.usadoEm = new Date();
    void this.salvarRefresh(novo);
    return Promise.resolve(true);
  }
  revogarFamilia(familiaId: string, sessaoId: number) {
    for (const r of this.refreshes) if (r.familiaId === familiaId) r.revogadoEm ??= new Date();
    const s = this.sessoes.find((x) => x.id === sessaoId);
    if (s) s.revogada = true;
    return Promise.resolve();
  }
  revogarSessao(sid: string) {
    const s = this.sessoes.find((x) => x.sid === sid);
    if (s) {
      s.revogada = true;
      for (const r of this.refreshes) if (r.sessaoId === s.id) r.revogadoEm ??= new Date();
    }
    return Promise.resolve();
  }
  revogarTodasDoUsuario(usuarioId: number) {
    const sids = this.sessoes
      .filter((s) => s.usuarioId === usuarioId && !s.revogada)
      .map((s) => s.sid);
    return Promise.all(sids.map((sid) => this.revogarSessao(sid))).then(() => sids);
  }
}

export class RecuperacoesFake implements RepositorioRecuperacao {
  readonly lista: (Recuperacao & { usadoEm: Date | null })[] = [];
  private seq = 0;
  criar(usuarioId: number, codigoHash: string, expiraEm: Date) {
    for (const r of this.lista) if (r.usuarioId === usuarioId) r.usadoEm ??= new Date();
    this.seq += 1;
    this.lista.push({
      id: this.seq,
      usuarioId,
      codigoHash,
      tentativas: 0,
      expiraEm,
      usadoEm: null,
    });
    return Promise.resolve();
  }
  buscarAtiva(usuarioId: number, agora: Date) {
    const r = this.lista.find((x) => x.usuarioId === usuarioId && !x.usadoEm && x.expiraEm > agora);
    return Promise.resolve(r ? { ...r } : null);
  }
  incrementarTentativas(id: number) {
    const r = this.lista.find((x) => x.id === id);
    if (!r) return Promise.resolve(0);
    const atualizado = { ...r, tentativas: r.tentativas + 1 };
    this.lista[this.lista.indexOf(r)] = atualizado;
    return Promise.resolve(atualizado.tentativas);
  }
  marcarUsada(id: number, agora: Date) {
    const r = this.lista.find((x) => x.id === id);
    if (r) r.usadoEm = agora;
    return Promise.resolve();
  }
}

export class CofreFake implements CofreRedefinicao {
  readonly itens = new Map<string, number>();
  guardar(tokenHash: string, usuarioId: number) {
    this.itens.set(tokenHash, usuarioId);
    return Promise.resolve();
  }
  consumir(tokenHash: string) {
    const v = this.itens.get(tokenHash) ?? null;
    this.itens.delete(tokenHash);
    return Promise.resolve(v);
  }
}

/** "Hash" reversível e barato — o Argon2 real é testado na infraestrutura. */
export const hasherFake: HasherSenha = {
  gerar: (s) => Promise.resolve(`hash:${s}`),
  verificar: (h, s) => Promise.resolve(h === `hash:${s}`),
  precisaRefazer: (h) => h.startsWith('antigo:'),
};

export const cifradorFake: CifradorDados = {
  cifrar: (t): DadoCifrado => ({
    cifrado: new TextEncoder().encode(`cifrado:${t}`),
    iv: new Uint8Array(12),
    tag: new Uint8Array(16),
  }),
  decifrar: (d) => new TextDecoder().decode(d.cifrado).replace('cifrado:', ''),
  indiceCpf: (c) => `idx:${c}`,
  hashCodigo: (c) => createHash('sha256').update(c).digest('hex'),
  iguais: (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)),
};

export class TokensFake implements EmissorTokens {
  readonly ttlAcessoSegundos = 900;
  readonly emitidos: ClaimsAcesso[] = [];
  constructor(private readonly relogio: Relogio) {}
  emitirAcesso(dados: { sub: string; role: ClaimsAcesso['role']; sid: string }) {
    const iat = Math.floor(this.relogio.agora().getTime() / 1000);
    const claims = { ...dados, jti: randomUUID(), iat, exp: iat + this.ttlAcessoSegundos };
    this.emitidos.push(claims);
    return {
      token: `token:${claims.jti}`,
      jti: claims.jti,
      expiraEm: new Date(claims.exp * 1000),
    };
  }
  verificarAcesso(token: string): ClaimsAcesso {
    const claims = this.emitidos.find((c) => `token:${c.jti}` === token);
    if (!claims) throw new ErroDominio('NAO_AUTENTICADO', 'TOKEN_INVALIDO', 'inválido');
    return claims;
  }
}

export class RevogacaoFake implements ListaRevogacao {
  readonly jtis = new Set<string>();
  readonly sids = new Set<string>();
  revogarJti(jti: string) {
    this.jtis.add(jti);
    return Promise.resolve();
  }
  revogarSid(sid: string) {
    this.sids.add(sid);
    return Promise.resolve();
  }
  estaRevogado(jti: string, sid: string) {
    return Promise.resolve(this.jtis.has(jti) || this.sids.has(sid));
  }
}

export class AleatorioFake implements GeradorAleatorio {
  private seq = 0;
  constructor(public proximoCodigo = '123456') {}
  token() {
    this.seq += 1;
    return `refresh-${this.seq}`;
  }
  codigoNumerico() {
    return this.proximoCodigo;
  }
  uuid() {
    return randomUUID();
  }
}

export class EmailsFake implements FilaEmails {
  readonly codigos: { para: string; codigo: string }[] = [];
  readonly alteracoes: string[] = [];
  codigoRecuperacao(dados: { para: string; nome: string; codigo: string }) {
    this.codigos.push({ para: dados.para, codigo: dados.codigo });
    return Promise.resolve();
  }
  senhaAlterada(dados: { para: string }) {
    this.alteracoes.push(dados.para);
    return Promise.resolve();
  }
}

export const hashTokenFake = (t: string) => createHash('sha256').update(t).digest('hex');

/** Monta todas as dependências fake de uma vez. */
export function criarAmbiente() {
  const relogio = new RelogioFake();
  return {
    relogio,
    usuarios: new UsuariosFake(),
    sessoes: new SessoesFake(),
    recuperacoes: new RecuperacoesFake(),
    cofre: new CofreFake(),
    revogacao: new RevogacaoFake(),
    tokens: new TokensFake(relogio),
    aleatorio: new AleatorioFake(),
    emails: new EmailsFake(),
    hasher: hasherFake,
    cifrador: cifradorFake,
    hashToken: hashTokenFake,
    hashFicticio: 'hash:__senha_que_ninguem_usa__',
    refreshTtlDias: 30,
  };
}
