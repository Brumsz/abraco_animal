/** Animais: listagem com filtros e rolagem infinita, detalhe e padrinhos. */
import { ok, type paths } from '@abraco/api-client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export type FiltrosAnimais = Omit<
  NonNullable<paths['/v1/animais']['get']['parameters']['query']>,
  'cursor' | 'limite'
>;

export function useAnimais(filtros: FiltrosAnimais = {}) {
  return useInfiniteQuery({
    queryKey: chaves.animais(filtros),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/animais', {
          params: {
            query: { ...filtros, limite: 20, ...(pageParam ? { cursor: pageParam } : {}) },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useAnimal(id: string) {
  return useQuery({
    queryKey: chaves.animal(id),
    queryFn: () => ok(api.GET('/v1/animais/{id}', { params: { path: { id } } })),
  });
}

export function usePadrinhos(animalId: string) {
  return useQuery({
    queryKey: chaves.padrinhos(animalId),
    queryFn: () =>
      ok(api.GET('/v1/animais/{id}/padrinhos', { params: { path: { id: animalId } } })),
  });
}
