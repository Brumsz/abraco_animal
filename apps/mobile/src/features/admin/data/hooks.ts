/**
 * Painel da equipe (rotas /v1/admin/*). A API confere o papel ADMIN em cada rota;
 * a proteção no app (layout de admin) é só para a navegação.
 */
import { ok } from '@abraco/api-client';
import type {
  StatusAdocao,
  StatusConversa,
  StatusDoacaoAnimal,
  StatusVoluntario,
} from '@abraco/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

const pagina = { initialPageParam: null as string | null } as const;
const cursor = (c: string | null) => (c ? { cursor: c } : {});
const TODOS = 'todos';

export function usePainel() {
  return useQuery({
    queryKey: chaves.painel,
    queryFn: () => ok(api.GET('/v1/admin/dashboard')),
  });
}

/** Depois de analisar: listas, detalhe e números da Central mudam juntos. */
function useAoAnalisar(prefixo: 'adocoes' | 'doacoes-animais' | 'voluntarios') {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin', prefixo] }),
      qc.invalidateQueries({ queryKey: chaves.painel }),
    ]);
}

// ── Adoções ─────────────────────────────────────────────────────────────

export function useAdocoesEquipe(status: StatusAdocao | null) {
  return useInfiniteQuery({
    queryKey: chaves.adocoesEquipe(status ?? TODOS),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/adocoes', {
          params: { query: { ...(status ? { status } : {}), ...cursor(pageParam) } },
        }),
      ),
    ...pagina,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useAdocaoEquipe(id: string) {
  return useQuery({
    queryKey: chaves.adocaoEquipe(id),
    queryFn: () => ok(api.GET('/v1/admin/adocoes/{id}', { params: { path: { id } } })),
  });
}

export function useAprovarAdocao(id: string) {
  const aoAnalisar = useAoAnalisar('adocoes');
  return useMutation({
    mutationFn: () => ok(api.POST('/v1/admin/adocoes/{id}/aprovar', { params: { path: { id } } })),
    onSuccess: aoAnalisar,
  });
}

export function useRecusarAdocao(id: string) {
  const aoAnalisar = useAoAnalisar('adocoes');
  return useMutation({
    mutationFn: (motivoRecusa: string) =>
      ok(
        api.POST('/v1/admin/adocoes/{id}/recusar', {
          params: { path: { id } },
          body: { motivoRecusa },
        }),
      ),
    onSuccess: aoAnalisar,
  });
}

// ── Doações de animais ──────────────────────────────────────────────────

export function useDoacoesEquipe(status: StatusDoacaoAnimal | null) {
  return useInfiniteQuery({
    queryKey: chaves.doacoesEquipe(status ?? TODOS),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/doacoes-animais', {
          params: { query: { ...(status ? { status } : {}), ...cursor(pageParam) } },
        }),
      ),
    ...pagina,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useDoacaoEquipe(id: string) {
  return useQuery({
    queryKey: chaves.doacaoEquipe(id),
    queryFn: () => ok(api.GET('/v1/admin/doacoes-animais/{id}', { params: { path: { id } } })),
  });
}

export function useAvancarDoacao(id: string) {
  const qc = useQueryClient();
  const aoAnalisar = useAoAnalisar('doacoes-animais');
  return useMutation({
    mutationFn: (acao: 'aprovar' | 'receber') =>
      acao === 'aprovar'
        ? ok(api.POST('/v1/admin/doacoes-animais/{id}/aprovar', { params: { path: { id } } }))
        : ok(api.POST('/v1/admin/doacoes-animais/{id}/receber', { params: { path: { id } } })),
    onSuccess: async (_, acao) => {
      await aoAnalisar();
      // Recebida: a API criou o animal (EM_TRATAMENTO) — a lista de animais muda.
      if (acao === 'receber') await qc.invalidateQueries({ queryKey: ['animais'] });
    },
  });
}

export function useRecusarDoacao(id: string) {
  const aoAnalisar = useAoAnalisar('doacoes-animais');
  return useMutation({
    mutationFn: (motivoRecusa: string) =>
      ok(
        api.POST('/v1/admin/doacoes-animais/{id}/recusar', {
          params: { path: { id } },
          body: { motivoRecusa },
        }),
      ),
    onSuccess: aoAnalisar,
  });
}

// ── Voluntários ─────────────────────────────────────────────────────────

export function useVoluntariosEquipe(status: StatusVoluntario) {
  return useInfiniteQuery({
    queryKey: chaves.voluntariosEquipe(status),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/voluntarios', {
          params: { query: { status, ...cursor(pageParam) } },
        }),
      ),
    ...pagina,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useVoluntarioEquipe(id: string) {
  return useQuery({
    queryKey: chaves.voluntarioEquipe(id),
    queryFn: () => ok(api.GET('/v1/admin/voluntarios/{id}', { params: { path: { id } } })),
  });
}

export function useAprovarVoluntario(id: string) {
  const aoAnalisar = useAoAnalisar('voluntarios');
  return useMutation({
    mutationFn: (cargo: string | null) =>
      ok(
        api.POST('/v1/admin/voluntarios/{id}/aprovar', {
          params: { path: { id } },
          body: { cargo },
        }),
      ),
    onSuccess: aoAnalisar,
  });
}

export function useRecusarVoluntario(id: string) {
  const aoAnalisar = useAoAnalisar('voluntarios');
  return useMutation({
    mutationFn: (motivoRecusa: string) =>
      ok(
        api.POST('/v1/admin/voluntarios/{id}/recusar', {
          params: { path: { id } },
          body: { motivoRecusa },
        }),
      ),
    onSuccess: aoAnalisar,
  });
}

// ── Atendimento (chat da equipe) ────────────────────────────────────────

/** `null` = todas (a tela da conversa acha a dela aqui, aberta ou encerrada). */
export function useConversasEquipe(status: StatusConversa | null) {
  return useInfiniteQuery({
    queryKey: chaves.conversasEquipe(status ?? TODOS),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/conversas', {
          params: { query: { ...(status ? { status } : {}), ...cursor(pageParam) } },
        }),
      ),
    ...pagina,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useAtenderConversa(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (acao: 'assumir' | 'encerrar') =>
      acao === 'assumir'
        ? ok(api.POST('/v1/admin/conversas/{id}/assumir', { params: { path: { id } } }))
        : ok(api.POST('/v1/admin/conversas/{id}/encerrar', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.conversas }),
  });
}
