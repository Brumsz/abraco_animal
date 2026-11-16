/** Sobre a ONG e FAQ (conteúdo que muda pouco: cache de 5 min, como a API). */
import { ok } from '@abraco/api-client';
import { useQuery } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

const CINCO_MIN = 5 * 60_000;

export function usePerfilOng() {
  return useQuery({
    queryKey: chaves.perfilOng,
    queryFn: () => ok(api.GET('/v1/institucional/perfil')),
    staleTime: CINCO_MIN,
  });
}

export function useFaq() {
  return useQuery({
    queryKey: chaves.faq,
    queryFn: () => ok(api.GET('/v1/institucional/faq')),
    staleTime: CINCO_MIN,
  });
}
