/** Jornal Abraço Animal. O conteúdo é Markdown já sanitizado pela API. */
import { ok } from '@abraco/api-client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export function useNoticias() {
  return useInfiniteQuery({
    queryKey: chaves.noticias,
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/noticias', {
          params: { query: { limite: 10, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useNoticia(slug: string) {
  return useQuery({
    queryKey: chaves.noticia(slug),
    queryFn: () => ok(api.GET('/v1/noticias/{slug}', { params: { path: { slug } } })),
  });
}
