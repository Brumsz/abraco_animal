/** Apadrinhamento: só animais DISPONIVEL (a API recusa os demais). */
import { ok, type Corpo } from '@abraco/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export function useApadrinhar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/apadrinhamentos', 'post'>) =>
      ok(api.POST('/v1/apadrinhamentos', { body: d })),
    onSuccess: (_r, d) => {
      void qc.invalidateQueries({ queryKey: chaves.meusApadrinhamentos });
      void qc.invalidateQueries({ queryKey: chaves.padrinhos(d.animalId) });
      void qc.invalidateQueries({ queryKey: chaves.animal(d.animalId) });
    },
  });
}

export function useMeusApadrinhamentos() {
  return useQuery({
    queryKey: chaves.meusApadrinhamentos,
    queryFn: () => ok(api.GET('/v1/me/apadrinhamentos')),
  });
}

export function useEncerrarApadrinhamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      ok(api.DELETE('/v1/apadrinhamentos/{id}', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.meusApadrinhamentos }),
  });
}
