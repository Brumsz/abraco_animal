import { ROLES } from '@abraco/shared';
import { z } from 'zod';

/**
 * Esquemas da borda HTTP (seção 6: Zod em toda borda, rejeitando campos
 * desconhecidos). Regras de negócio (CPF, idade, política de senha) ficam no
 * domínio; aqui só formato e tamanho.
 */

const deviceId = z.string().trim().min(8).max(128);
const senhaEntrada = z.string().min(1).max(128);

export const enderecoEsquema = z.strictObject({
  cep: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  logradouro: z.string().trim().min(1).max(200),
  numero: z.string().trim().min(1).max(20),
  complemento: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v)),
  bairro: z.string().trim().min(1).max(100),
  cidade: z.string().trim().min(1).max(100),
  uf: z.string().regex(/^[A-Za-z]{2}$/, 'UF inválida'),
});

export const cadastroEntrada = z.strictObject({
  nome: z.string().min(1).max(120),
  dataNasc: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
  cpf: z.string().min(11).max(14),
  telefone: z.string().min(10).max(16),
  email: z.string().max(254),
  senha: senhaEntrada,
  endereco: enderecoEsquema,
  aceitouTermos: z.boolean(),
  consentimentoDados: z.boolean(),
  deviceId,
});

export const loginEntrada = z.strictObject({
  email: z.string().min(1).max(254),
  senha: senhaEntrada,
  deviceId,
});

export const refreshEntrada = z.strictObject({
  refreshToken: z.string().min(1).max(256),
  deviceId,
});

export const solicitarRecuperacaoEntrada = z.strictObject({
  email: z.string().min(1).max(254),
});

export const verificarCodigoEntrada = z.strictObject({
  email: z.string().min(1).max(254),
  codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos'),
});

export const redefinirEntrada = z.strictObject({
  tokenRedefinicao: z.string().min(1).max(256),
  novaSenha: senhaEntrada,
});

// ─── Saídas: só o que pode sair. Campos extras são descartados na serialização. ───

export const usuarioPerfilSaida = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string(),
  endereco: z.object({
    cep: z.string(),
    logradouro: z.string(),
    numero: z.string(),
    complemento: z.string().nullable(),
    bairro: z.string(),
    cidade: z.string(),
    uf: z.string(),
  }),
  fotoUrl: z.string().nullable(),
  capaUrl: z.string().nullable(),
  role: z.enum(ROLES),
  criadoEm: z.date(),
});

export const sessaoSaida = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiraEm: z.date(),
  usuario: usuarioPerfilSaida,
});

export const tokenRedefinicaoSaida = z.object({ tokenRedefinicao: z.string() });
