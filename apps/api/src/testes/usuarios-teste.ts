/** Cria usuários reais pela API para os testes de integração. */
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';

import type { Prisma } from '../shared/infra/prisma.js';

let seq = 0;

/** CPF válido e único a partir de um número (calcula os dígitos verificadores). */
export function cpfValido(n: number): string {
  const base = String(100_000_000 + n)
    .slice(-9)
    .split('')
    .map(Number);
  const dv = (d: number[]) => {
    const resto = (d.reduce((acc, x, i) => acc + x * (d.length + 1 - i), 0) * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join('');
}

export interface UsuarioTeste {
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly token: string;
}

export async function criarUsuario(
  app: FastifyInstance,
  prisma: Prisma,
  opcoes: { role?: 'USUARIO' | 'VOLUNTARIO' | 'ADMIN'; nome?: string } = {},
): Promise<UsuarioTeste> {
  seq += 1;
  const nome = opcoes.nome ?? `Pessoa ${String(seq)}`;
  const email = `u${String(seq)}-${String(Date.now())}@teste.org`;
  const cadastro = await app.inject({
    method: 'POST',
    url: '/v1/auth/cadastro',
    payload: {
      nome,
      dataNasc: '1990-05-20',
      cpf: cpfValido(seq * 104_729 + (Date.now() % 997)),
      telefone: '11987654321',
      email,
      senha: 'cavalos123',
      endereco: {
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        numero: '1',
        bairro: 'Sé',
        cidade: 'São Paulo',
        uf: 'SP',
      },
      aceitouTermos: true,
      consentimentoDados: true,
      deviceId: 'aparelho-de-teste-1',
    },
  });
  expect(cadastro.statusCode, cadastro.body).toBe(201);
  const sessao = cadastro.json<{ accessToken: string; usuario: { id: string } }>();
  const role = opcoes.role ?? 'USUARIO';
  if (role === 'USUARIO') return { id: sessao.usuario.id, email, nome, token: sessao.accessToken };

  // Não existe rota para trocar de role (de propósito): promove no banco e loga de novo.
  await prisma.usuario.update({ where: { email }, data: { role } });
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, senha: 'cavalos123', deviceId: 'aparelho-de-teste-1' },
  });
  expect(login.statusCode, login.body).toBe(200);
  return {
    id: sessao.usuario.id,
    email,
    nome,
    token: login.json<{ accessToken: string }>().accessToken,
  };
}

export const bearer = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});
