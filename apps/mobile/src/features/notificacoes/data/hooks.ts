/** Sino da Home: lista, contador de não lidas e marcar como lida. */
import { ok } from '@abraco/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api, useSessao } from '@/core/sessao';

export function useNotificacoes() {
  return useInfiniteQuery({
    queryKey: chaves.notificacoes,
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/notificacoes', { params: { query: pageParam ? { cursor: pageParam } : {} } }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

/** Badge do sino: atualiza a cada minuto e ao voltar para o app. */
export function useNaoLidas() {
  const autenticado = useSessao((s) => s.estado === 'autenticado');
  return useQuery({
    queryKey: chaves.naoLidas,
    queryFn: () => ok(api.GET('/v1/notificacoes/nao-lidas')),
    enabled: autenticado,
    refetchInterval: 60_000,
  });
}

export function useMarcarNotificacaoLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      ok(api.POST('/v1/notificacoes/{id}/lida', { params: { path: { id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.naoLidas });
      void qc.invalidateQueries({ queryKey: chaves.notificacoes });
    },
  });
}

export function useMarcarTodasLidas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ok(api.POST('/v1/notificacoes/lidas')),
    onSuccess: () => {
      qc.setQueryData(chaves.naoLidas, { total: 0 });
      void qc.invalidateQueries({ queryKey: chaves.notificacoes });
    },
  });
}
