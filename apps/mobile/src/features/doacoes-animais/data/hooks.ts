/** Doação de um animal à ONG (formulário com fotos) e acompanhamento. */
import { doarAnimal, ok, type ArquivoUpload } from '@abraco/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export function useDoarAnimal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { dados: Parameters<typeof doarAnimal>[1]; fotos: readonly ArquivoUpload[] }) =>
      doarAnimal(api, d.dados, d.fotos),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.minhasDoacoesAnimais }),
  });
}

export function useMinhasDoacoesAnimais() {
  return useInfiniteQuery({
    queryKey: chaves.minhasDoacoesAnimais,
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/me/doacoes-animais', {
          params: { query: pageParam ? { cursor: pageParam } : {} },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useDoacaoAnimal(id: string) {
  return useQuery({
    queryKey: chaves.doacaoAnimal(id),
    queryFn: () => ok(api.GET('/v1/doacoes-animais/{id}', { params: { path: { id } } })),
  });
}
