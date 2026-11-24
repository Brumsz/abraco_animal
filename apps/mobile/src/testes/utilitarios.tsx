/**
 * Utilitários dos testes de tela: API falsa por rota (fetch global) e render com
 * QueryClient + Toast. O expo-router é mockado em cada arquivo (jest.mock é içado).
 */
import { ToastProvider } from '@abraco/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { useSessao } from '@/core/sessao';

export const json = (corpo: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

type Resposta = Response | ((req: Request) => Response);

/**
 * Responde por "MÉTODO /caminho" (sem query). Rota não prevista falha o teste com
 * 599 — assim nenhuma chamada passa despercebida.
 */
export function apiFalsa(rotas: Record<string, Resposta>) {
  const chamadas: Request[] = [];
  globalThis.fetch = ((req: Request) => {
    chamadas.push(req);
    const url = new URL(req.url);
    const chave = `${req.method} ${url.pathname}`;
    const r = rotas[chave];
    if (!r) return Promise.resolve(json({ detail: `rota não mockada: ${chave}` }, 599));
    return Promise.resolve(typeof r === 'function' ? r(req) : r.clone());
  }) as typeof fetch;
  return chamadas;
}

export const usuarioTeste = {
  id: '00000000-0000-4000-8000-000000000001',
  nome: 'Karina Somaggio',
  email: 'karina@abraco.org',
  telefone: '11987654321',
  role: 'USUARIO' as const,
  endereco: {
    cep: '01001000',
    logradouro: 'Praça da Sé',
    numero: '1',
    complemento: null,
    bairro: 'Sé',
    cidade: 'São Paulo',
    uf: 'SP',
  },
  fotoUrl: null,
  capaUrl: null,
  criadoEm: '2026-11-01T12:00:00.000Z',
};

export function entrarComoUsuario() {
  useSessao.setState({ estado: 'autenticado', usuario: usuarioTeste, accessToken: 'tok' });
}

export async function renderizar(tela: ReactElement) {
  // gcTime infinito: sem timer de limpeza pendurado depois do teste.
  const qc = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { retry: false, gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{tela}</ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}

export const ID_ANIMAL = '11111111-1111-4111-8111-111111111111';

export function animalResumo(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: ID_ANIMAL,
    nome: 'Alípio',
    tipo: 'EQUINO',
    raca: 'Mustangue',
    idadeAprox: 96,
    sexo: 'MACHO',
    porte: 'MUITO_GRANDE',
    status: 'DISPONIVEL',
    fotoCapa: null,
    ...sobrescrever,
  };
}

export function animalDetalhe(sobrescrever: Record<string, unknown> = {}) {
  return {
    ...animalResumo(),
    descricao: 'Calmo e carinhoso.',
    historiaResgate: 'Resgatado na estrada.',
    vacinado: true,
    castrado: false,
    fotos: [],
    totalPadrinhos: 2,
    ...sobrescrever,
  };
}
