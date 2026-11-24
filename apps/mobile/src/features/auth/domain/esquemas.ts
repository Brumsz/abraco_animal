/**
 * Validação dos formulários de entrada (mensagens exibidas inline). As regras de
 * CPF, telefone, senha e idade vêm de @abraco/shared — as mesmas da API.
 */
import {
  cpfValido,
  lerDataIso,
  maiorDeIdade,
  problemaNome,
  problemaSenha,
  telefoneValido,
} from '@abraco/shared';
import { z } from 'zod';

import { dataParaIso, soDigitos } from './mascaras';

const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail')
  .pipe(z.email('Informe um e-mail válido'));

export const senhaNova = z.string().superRefine((senha, ctx) => {
  const problema = problemaSenha(senha);
  if (problema) ctx.addIssue({ code: 'custom', message: problema });
});

/** Campos reaproveitados pelo cadastro e pelo Editar perfil (mesmas regras da API). */
export const campoNome = z
  .string()
  .trim()
  .max(120, 'Nome muito longo')
  .superRefine((nome, ctx) => {
    const problema = problemaNome(nome);
    if (problema) ctx.addIssue({ code: 'custom', message: problema });
  });

export const campoTelefone = z
  .string()
  .refine((t) => telefoneValido(soDigitos(t)), 'Telefone inválido (com DDD)');

export const camposEndereco = {
  cep: z.string().refine((t) => soDigitos(t).length === 8, 'CEP inválido'),
  logradouro: z.string().trim().min(1, 'Informe a rua').max(200),
  numero: z.string().trim().min(1, 'Informe o número').max(20),
  complemento: z.string().trim().max(100),
  bairro: z.string().trim().min(1, 'Informe o bairro').max(100),
  cidade: z.string().trim().min(1, 'Informe a cidade').max(100),
  uf: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'UF com 2 letras'),
};

export const esquemaLogin = z.object({
  email,
  senha: z.string().min(1, 'Informe sua senha'),
});
export type DadosLogin = z.infer<typeof esquemaLogin>;

/** Cadastro, passo 1: dados pessoais (campos do protótipo). */
export const esquemaCadastroPessoal = (hoje: Date = new Date()) =>
  z.object({
    nome: campoNome,
    nascimento: z.string().superRefine((texto, ctx) => {
      const iso = dataParaIso(texto);
      const data = iso ? lerDataIso(iso) : null;
      if (!data) ctx.addIssue({ code: 'custom', message: 'Use o formato DD/MM/AAAA' });
      else if (!maiorDeIdade(data, hoje)) {
        ctx.addIssue({ code: 'custom', message: 'É preciso ter 18 anos ou mais' });
      }
    }),
    cpf: z.string().refine((t) => cpfValido(soDigitos(t)), 'CPF inválido'),
    telefone: campoTelefone,
    email,
    senha: senhaNova,
  });
export type DadosCadastroPessoal = z.infer<ReturnType<typeof esquemaCadastroPessoal>>;

/** Cadastro, passo 2: endereço (exigido pela adoção) + consentimentos LGPD. */
export const esquemaCadastroEndereco = z.object({
  ...camposEndereco,
  aceitouTermos: z.literal(true, 'Aceite os termos de uso para continuar'),
  consentimentoDados: z.literal(true, 'Autorize o uso dos dados para continuar'),
});
export type DadosCadastroEndereco = z.infer<typeof esquemaCadastroEndereco>;

export const esquemaEmail = z.object({ email });

export const esquemaNovaSenha = z
  .object({ senha: senhaNova, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, {
    message: 'As senhas não conferem',
    path: ['confirmacao'],
  });
export type DadosNovaSenha = z.infer<typeof esquemaNovaSenha>;
