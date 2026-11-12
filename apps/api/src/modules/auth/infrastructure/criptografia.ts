import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import argon2 from 'argon2';

import type {
  CifradorDados,
  DadoCifrado,
  GeradorAleatorio,
  HasherSenha,
  HashToken,
} from '../application/portas.js';

// ─── Senhas: Argon2id (seção 6: memCost 65536, timeCost 3, parallelism 4) ──

const PARAMETROS_ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

export const hasherArgon2: HasherSenha = {
  gerar: (senha) => argon2.hash(senha, PARAMETROS_ARGON2),
  verificar: async (hash, senha) => {
    try {
      return await argon2.verify(hash, senha);
    } catch {
      // Hash malformado nunca autentica.
      return false;
    }
  },
  precisaRefazer: (hash) => argon2.needsRehash(hash, PARAMETROS_ARGON2),
};

// ─── Dados pessoais: AES-256-GCM + HMAC-SHA256 ────────────────────────────

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12; // recomendado para GCM

/**
 * Cifra CPF e data de nascimento em repouso. O primeiro byte do texto cifrado
 * guarda a versão da chave, permitindo rotação sem perder dados antigos.
 */
export class CifradorAesGcm implements CifradorDados {
  private readonly chaves: ReadonlyMap<number, Buffer>;

  constructor(
    private readonly versaoAtual: number,
    chaves: Record<number, Buffer>,
    private readonly chaveIndiceCpf: Buffer,
    private readonly chaveCodigos: Buffer,
  ) {
    this.chaves = new Map(Object.entries(chaves).map(([v, k]) => [Number(v), k]));
    for (const chave of [...this.chaves.values(), chaveIndiceCpf, chaveCodigos]) {
      if (chave.length !== 32) throw new Error('Chaves de criptografia devem ter 32 bytes');
    }
    if (!this.chaves.has(versaoAtual)) throw new Error('Chave da versão atual ausente');
  }

  cifrar(texto: string): DadoCifrado {
    const iv = randomBytes(TAMANHO_IV);
    const cipher = createCipheriv(ALGORITMO, this.chave(this.versaoAtual), iv);
    const corpo = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return {
      cifrado: Buffer.concat([Buffer.of(this.versaoAtual), corpo]),
      iv,
      tag: cipher.getAuthTag(),
    };
  }

  decifrar(dado: DadoCifrado): string {
    const bytes = Buffer.from(dado.cifrado);
    const versao = bytes[0] ?? 0;
    const decipher = createDecipheriv(ALGORITMO, this.chave(versao), Buffer.from(dado.iv));
    decipher.setAuthTag(Buffer.from(dado.tag));
    return Buffer.concat([decipher.update(bytes.subarray(1)), decipher.final()]).toString('utf8');
  }

  indiceCpf(cpfDigitos: string): string {
    return createHmac('sha256', this.chaveIndiceCpf).update(cpfDigitos).digest('hex');
  }

  hashCodigo(codigo: string): string {
    return createHmac('sha256', this.chaveCodigos).update(codigo).digest('hex');
  }

  iguais(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  private chave(versao: number): Buffer {
    const chave = this.chaves.get(versao);
    if (!chave) throw new Error(`Chave de criptografia versão ${versao} indisponível`);
    return chave;
  }
}

// ─── Aleatoriedade e hash de tokens ───────────────────────────────────────

export const geradorCripto: GeradorAleatorio = {
  token: () => randomBytes(32).toString('base64url'),
  codigoNumerico: () => randomInt(0, 1_000_000).toString().padStart(6, '0'),
  uuid: () => randomUUID(),
};

/** SHA-256 do refresh token (256 bits de entropia: não precisa de sal nem KDF). */
export const hashTokenSha256: HashToken = (token) =>
  createHash('sha256').update(token).digest('hex');
