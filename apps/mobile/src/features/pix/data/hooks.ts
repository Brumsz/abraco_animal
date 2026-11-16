/**
 * Doação via Pix. A tela gera UMA Idempotency-Key por intenção de doar
 * (`novaChaveIdempotencia()` ao abrir o formulário) e reaproveita nos retries:
 * toque duplo ou rede instável nunca criam duas cobranças.
 */
import { ok, type Corpo, type StatusPix } from '@abraco/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

export function useGerarPix() {
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...dados
    }: Corpo<'/v1/doacoes-financeiras', 'post'> & { idempotencyKey: string }) =>
      ok(
        api.POST('/v1/doacoes-financeiras', {
          params: { header: { 'idempotency-key': idempotencyKey } },
          body: dados,
        }),
      ),
  });
}

/**
 * Consulta o status a cada 5 s enquanto PENDENTE e dentro do prazo; para
 * sozinho quando confirma ou vence (o botão "Já paguei" chama `refetch`).
 */
export function intervaloStatusPix(
  status: StatusPix['status'] | undefined,
  expiraEm: Date,
  agora: Date,
): number | false {
  if (status === 'CONFIRMADA' || status === 'EXPIRADA') return false;
  return agora < expiraEm ? 5000 : false;
}

export function useStatusPix(id: string, expiraEm: Date) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: chaves.statusPix(id),
    queryFn: async () => {
      const s = await ok(
        api.GET('/v1/doacoes-financeiras/{id}/status', { params: { path: { id } } }),
      );
      if (s.status === 'CONFIRMADA') void qc.invalidateQueries({ queryKey: chaves.historicoPix });
      return s;
    },
    refetchInterval: (q) => intervaloStatusPix(q.state.data?.status, expiraEm, new Date()),
  });
}

export function useHistoricoPix() {
  return useInfiniteQuery({
    queryKey: chaves.historicoPix,
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/me/doacoes-financeiras', {
          params: { query: pageParam ? { cursor: pageParam } : {} },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}
