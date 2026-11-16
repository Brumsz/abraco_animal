/** Adoções: enviar a triagem, minhas adoções e detalhe com a linha do tempo. */
import { ok, type Corpo } from '@abraco/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export function useSolicitarAdocao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (triagem: Corpo<'/v1/adocoes', 'post'>) =>
      ok(api.POST('/v1/adocoes', { body: triagem })),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.minhasAdocoes }),
  });
}

export function useMinhasAdocoes() {
  return useInfiniteQuery({
    queryKey: chaves.minhasAdocoes,
    queryFn: ({ pageParam }) =>
      ok(api.GET('/v1/me/adocoes', { params: { query: pageParam ? { cursor: pageParam } : {} } })),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useAdocao(id: string) {
  return useQuery({
    queryKey: chaves.adocao(id),
    queryFn: () => ok(api.GET('/v1/adocoes/{id}', { params: { path: { id } } })),
  });
}
