/** Feed da ONG: posts com carrossel e curtidas otimistas. */
import { ok, type Post } from '@abraco/api-client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';
import { aplicarCurtida } from './curtida';

interface PaginaPosts {
  itens: Post[];
  proximoCursor: string | null;
}

export function usePosts() {
  return useInfiniteQuery({
    queryKey: chaves.posts,
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/posts', {
          params: { query: { limite: 10, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: chaves.post(id),
    queryFn: () => ok(api.GET('/v1/posts/{id}', { params: { path: { id } } })),
  });
}

export function useCurtir() {
  const qc = useQueryClient();
  const atualizar = (id: string, curtir: boolean) => {
    qc.setQueryData<Post>(chaves.post(id), (p) => (p ? aplicarCurtida(p, curtir) : p));
    qc.setQueryData<InfiniteData<PaginaPosts>>(chaves.posts, (d) =>
      d
        ? {
            ...d,
            pages: d.pages.map((pg) => ({
              ...pg,
              itens: pg.itens.map((p) => (p.id === id ? aplicarCurtida(p, curtir) : p)),
            })),
          }
        : d,
    );
  };
  return useMutation({
    mutationFn: ({ id, curtir }: { id: string; curtir: boolean }) =>
      ok(
        curtir
          ? api.POST('/v1/posts/{id}/curtida', { params: { path: { id } } })
          : api.DELETE('/v1/posts/{id}/curtida', { params: { path: { id } } }),
      ),
    onMutate: ({ id, curtir }) => {
      atualizar(id, curtir);
    },
    onError: (_e, { id, curtir }) => {
      atualizar(id, !curtir);
    },
  });
}
