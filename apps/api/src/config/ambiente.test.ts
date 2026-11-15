import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { carregarAmbiente } from './ambiente.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = (k: string) => Buffer.from(k).toString('base64');
const chave = (b: number) => Buffer.alloc(32, b).toString('base64');

const BASE = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_PRIVATE_KEY_B64: pem(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
  JWT_PUBLIC_KEY_B64: pem(publicKey.export({ type: 'spki', format: 'pem' }).toString()),
  JWT_ISSUER: 'https://api.teste',
  JWT_AUDIENCE: 'app',
  DADOS_CRYPTO_KEY_B64: chave(1),
  CPF_HMAC_KEY_B64: chave(2),
  CODIGOS_HMAC_KEY_B64: chave(3),
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  EMAIL_REMETENTE: 'ONG <nao-responda@teste.org>',
  S3_BUCKET: 'abraco',
  S3_ACCESS_KEY_ID: 'a',
  S3_SECRET_ACCESS_KEY: 'b',
  ASAAS_WEBHOOK_TOKEN: 'x'.repeat(32),
  ASAAS_API_KEY: '',
  ASAAS_CLIENTE_ID: '',
};

describe('carregarAmbiente: Pix', () => {
  it('em desenvolvimento, ASAAS_API_KEY vazia = Pix simulado (aceito)', () => {
    const a = carregarAmbiente(BASE);
    expect(a.ASAAS_API_KEY).toBeUndefined();
    expect(a.PIX_EXPIRACAO_MINUTOS).toBe(15);
  });

  it('em produção, sem ASAAS_API_KEY a API não sobe', () => {
    expect(() => carregarAmbiente({ ...BASE, NODE_ENV: 'production' })).toThrow(/ASAAS_API_KEY/);
  });

  it('com a chave, o cliente da ONG é obrigatório', () => {
    expect(() => carregarAmbiente({ ...BASE, ASAAS_API_KEY: '$aact_x' })).toThrow(
      /ASAAS_CLIENTE_ID/,
    );
    expect(
      carregarAmbiente({ ...BASE, ASAAS_API_KEY: '$aact_x', ASAAS_CLIENTE_ID: 'cus_1' })
        .ASAAS_CLIENTE_ID,
    ).toBe('cus_1');
  });

  it('token do webhook curto → erro, sem mostrar o valor', () => {
    let mensagem = '';
    try {
      carregarAmbiente({ ...BASE, ASAAS_WEBHOOK_TOKEN: 'segredo-curto' });
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).toContain('ASAAS_WEBHOOK_TOKEN');
    expect(mensagem).not.toContain('segredo-curto');
  });
});
