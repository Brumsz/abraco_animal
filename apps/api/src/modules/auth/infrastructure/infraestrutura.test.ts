import { generateKeyPairSync } from 'node:crypto';

import { createSigner } from 'fast-jwt';
import { describe, expect, it } from 'vitest';

import { RelogioFake } from '../application/testes/fakes.js';
import { CifradorAesGcm, geradorCripto, hasherArgon2, hashTokenSha256 } from './criptografia.js';
import { TokensJwt } from './tokens-jwt.js';

const chave = (b: number) => Buffer.alloc(32, b);

describe('CifradorAesGcm', () => {
  const cifrador = new CifradorAesGcm(1, { 1: chave(1) }, chave(2), chave(3));

  it('cifra e decifra; IV aleatório gera textos cifrados diferentes', () => {
    const a = cifrador.cifrar('52998224725');
    const b = cifrador.cifrar('52998224725');

    expect(cifrador.decifrar(a)).toBe('52998224725');
    expect(Buffer.from(a.cifrado).equals(Buffer.from(b.cifrado))).toBe(false);
    expect(a.iv).toHaveLength(12);
    expect(a.tag).toHaveLength(16);
  });

  it('detecta adulteração (GCM autenticado)', () => {
    const dado = cifrador.cifrar('52998224725');
    const adulterado = Buffer.from(dado.cifrado);
    adulterado[2] = (adulterado[2] ?? 0) ^ 0xff;

    expect(() => cifrador.decifrar({ ...dado, cifrado: adulterado })).toThrow();
  });

  it('rotação de chave: dados da versão antiga continuam legíveis', () => {
    const antigo = new CifradorAesGcm(1, { 1: chave(1) }, chave(2), chave(3)).cifrar('segredo');
    const novo = new CifradorAesGcm(2, { 1: chave(1), 2: chave(9) }, chave(2), chave(3));

    expect(novo.decifrar(antigo)).toBe('segredo');
    expect(Buffer.from(novo.cifrar('x').cifrado)[0]).toBe(2);
  });

  it('blind index do CPF é determinístico e não contém o CPF', () => {
    const indice = cifrador.indiceCpf('52998224725');
    expect(indice).toBe(cifrador.indiceCpf('52998224725'));
    expect(indice).toMatch(/^[0-9a-f]{64}$/);
    expect(indice).not.toContain('52998224725');
  });

  it('recusa chaves com tamanho errado', () => {
    expect(() => new CifradorAesGcm(1, { 1: Buffer.alloc(16) }, chave(2), chave(3))).toThrow();
  });
});

describe('hasherArgon2', () => {
  it('usa Argon2id com os parâmetros da spec', async () => {
    const hash = await hasherArgon2.gerar('cavalos123');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    expect(await hasherArgon2.verificar(hash, 'cavalos123')).toBe(true);
    expect(await hasherArgon2.verificar(hash, 'cavalos124')).toBe(false);
    expect(hasherArgon2.precisaRefazer(hash)).toBe(false);
  });

  it('hash malformado nunca autentica (sem lançar exceção)', async () => {
    expect(await hasherArgon2.verificar('nao-e-um-hash', 'qualquer')).toBe(false);
  });
});

describe('gerador e hash de tokens', () => {
  it('refresh token tem 256 bits e o código tem 6 dígitos', () => {
    expect(Buffer.from(geradorCripto.token(), 'base64url')).toHaveLength(32);
    for (let i = 0; i < 50; i++) expect(geradorCripto.codigoNumerico()).toMatch(/^\d{6}$/);
  });

  it('hash SHA-256 do refresh é hexadecimal de 64 caracteres', () => {
    expect(hashTokenSha256('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('TokensJwt (EdDSA)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const config = {
    chavePrivadaPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    chavePublicaPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    emissor: 'https://api.abraco.test',
    audiencia: 'abraco-app',
    ttlSegundos: 900,
  };
  const tokens = new TokensJwt(config, { agora: () => new Date() });
  const dados = {
    sub: '0b6f7c1e-0000-4000-8000-000000000001',
    role: 'USUARIO' as const,
    sid: 'sid-1',
  };

  it('token recém-emitido é ACEITO com todos os claims (teste positivo)', () => {
    const { token, jti } = tokens.emitirAcesso(dados);
    const claims = tokens.verificarAcesso(token);

    expect(claims).toMatchObject({ ...dados, jti });
    expect(claims.exp - claims.iat).toBe(900);
    const cabecalho = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as {
      alg: string;
    };
    expect(cabecalho.alg).toBe('EdDSA');
  });

  it('expirado → recusado', () => {
    const antigo = new TokensJwt(config, new RelogioFake(new Date(Date.now() - 3600_000)));
    const { token } = antigo.emitirAcesso(dados);
    expect(() => tokens.verificarAcesso(token)).toThrow(/inválida ou expirada/);
  });

  it('alg none → recusado', () => {
    const { token } = tokens.emitirAcesso(dados);
    const [, payload] = token.split('.');
    const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    expect(() => tokens.verificarAcesso(`${none}.${payload}.`)).toThrow();
  });

  it('role desconhecida no payload (mesmo assinado) → recusado', () => {
    const iat = Math.floor(Date.now() / 1000);
    const forjado = createSigner({
      key: config.chavePrivadaPem,
      algorithm: 'EdDSA',
      iss: config.emissor,
      aud: config.audiencia,
    })({ ...dados, role: 'SUPERADMIN', jti: 'j', iat, exp: iat + 60 });
    expect(() => tokens.verificarAcesso(forjado)).toThrow();
  });

  it('claim obrigatório ausente (sem sid) → recusado', () => {
    const iat = Math.floor(Date.now() / 1000);
    const semSid = createSigner({
      key: config.chavePrivadaPem,
      algorithm: 'EdDSA',
      iss: config.emissor,
      aud: config.audiencia,
    })({ sub: dados.sub, role: 'USUARIO', jti: 'j', iat, exp: iat + 60 });
    expect(() => tokens.verificarAcesso(semSid)).toThrow();
  });
});
