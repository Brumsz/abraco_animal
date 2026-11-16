/** Candidatura de voluntariado. */
import { ErroApi, ok, type Corpo } from '@abraco/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export function useCandidatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/voluntariado/candidaturas', 'post'>) =>
      ok(api.POST('/v1/voluntariado/candidaturas', { body: d })),
    onSuccess: (c) => qc.setQueryData(chaves.minhaCandidatura, c),
  });
}

/** `null` quando a pessoa ainda não se candidatou (a API responde 404). */
export function useMinhaCandidatura() {
  return useQuery({
    queryKey: chaves.minhaCandidatura,
    queryFn: async () => {
      try {
        return await ok(api.GET('/v1/me/voluntariado'));
      } catch (e) {
        if (e instanceof ErroApi && e.status === 404) return null;
        throw e;
      }
    },
  });
}
