import { z } from 'zod';

const base64 = (bytes: number, nome: string) =>
  z
    .string()
    .min(1, `${nome} é obrigatória`)
    .refine(
      (v) => Buffer.from(v, 'base64').length === bytes,
      `${nome} deve ter ${bytes} bytes em base64`,
    );

const pemBase64 = (nome: string) =>
  z
    .string()
    .min(1, `${nome} é obrigatória`)
    .transform((v) => Buffer.from(v, 'base64').toString('utf8'))
    .refine((pem) => pem.includes('-----BEGIN'), `${nome} deve ser um PEM em base64`);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_PRIVATE_KEY_B64: pemBase64('JWT_PRIVATE_KEY_B64'),
  JWT_PUBLIC_KEY_B64: pemBase64('JWT_PUBLIC_KEY_B64'),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL_SEGUNDOS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DIAS: z.coerce.number().int().min(1).max(90).default(30),

  DADOS_CRYPTO_KEY_B64: base64(32, 'DADOS_CRYPTO_KEY_B64'),
  DADOS_CRYPTO_KEY_VERSAO: z.coerce.number().int().min(1).max(255).default(1),
  CPF_HMAC_KEY_B64: base64(32, 'CPF_HMAC_KEY_B64'),
  CODIGOS_HMAC_KEY_B64: base64(32, 'CODIGOS_HMAC_KEY_B64'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_REMETENTE: z.string().min(1),
});

export type Ambiente = z.infer<typeof esquema>;

/**
 * Lê e valida as variáveis de ambiente. Falha cedo, listando só os NOMES das
 * variáveis com problema — nunca os valores.
 */
export function carregarAmbiente(fonte: NodeJS.ProcessEnv = process.env): Ambiente {
  const resultado = esquema.safeParse(fonte);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida:\n${problemas.join('\n')}`);
  }
  if (resultado.data.DADOS_CRYPTO_KEY_B64 === resultado.data.CPF_HMAC_KEY_B64) {
    throw new Error(
      'Configuração inválida: DADOS_CRYPTO_KEY_B64 e CPF_HMAC_KEY_B64 devem ser diferentes',
    );
  }
  return resultado.data;
}
