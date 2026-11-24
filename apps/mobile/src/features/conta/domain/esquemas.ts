/**
 * Formulários de "minha conta". Nome, telefone e endereço usam as mesmas regras
 * do cadastro (e da API); e-mail e CPF não são editáveis.
 */
import type { UsuarioPerfil } from '@abraco/api-client';
import { z } from 'zod';

import {
  campoNome,
  campoTelefone,
  camposEndereco,
  senhaNova,
} from '@/features/auth/domain/esquemas';
import { mascararCep, mascararTelefone, soDigitos } from '@/features/auth/domain/mascaras';

export const esquemaEditarPerfil = z.object({
  nome: campoNome,
  telefone: campoTelefone,
  ...camposEndereco,
});
export type DadosEditarPerfil = z.infer<typeof esquemaEditarPerfil>;

/** Valores iniciais do formulário a partir do perfil (já mascarados). */
export function valoresDoPerfil(u: UsuarioPerfil): DadosEditarPerfil {
  return {
    nome: u.nome,
    telefone: mascararTelefone(u.telefone),
    cep: mascararCep(u.endereco.cep),
    logradouro: u.endereco.logradouro,
    numero: u.endereco.numero,
    complemento: u.endereco.complemento ?? '',
    bairro: u.endereco.bairro,
    cidade: u.endereco.cidade,
    uf: u.endereco.uf,
  };
}

/** Corpo do PATCH /me (a API normaliza; aqui só tiramos a máscara). */
export function corpoEditarPerfil(d: DadosEditarPerfil) {
  return {
    nome: d.nome,
    telefone: soDigitos(d.telefone),
    endereco: {
      cep: soDigitos(d.cep),
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento.length > 0 ? d.complemento : null,
      bairro: d.bairro,
      cidade: d.cidade,
      uf: d.uf.toUpperCase(),
    },
  };
}

export const esquemaAlterarSenha = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual'),
    novaSenha: senhaNova,
    confirmacao: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    message: 'As senhas não conferem',
    path: ['confirmacao'],
  })
  .refine((d) => d.novaSenha !== d.senhaAtual, {
    message: 'A nova senha precisa ser diferente da atual',
    path: ['novaSenha'],
  });
export type DadosAlterarSenha = z.infer<typeof esquemaAlterarSenha>;

export const esquemaExcluirConta = z.object({
  senha: z.string().min(1, 'Informe sua senha para confirmar'),
  entendi: z.literal(true, 'Confirme que entendeu que a exclusão não pode ser desfeita'),
});
export type DadosExcluirConta = z.infer<typeof esquemaExcluirConta>;
