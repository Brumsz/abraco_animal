/**
 * Cadastros da equipe: animais (ficha, status e fotos), usuários e auditoria.
 * A listagem e o detalhe de animais são as rotas públicas: com token da equipe,
 * a API devolve todos os status.
 */
import { enviarFotosAnimal, ok, type ArquivoUpload, type Corpo } from '@abraco/api-client';
import type { Role, StatusAnimal } from '@abraco/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

const TODOS = 'todos';

// ── Animais ─────────────────────────────────────────────────────────────

/** Ficha, lista e Central mudam juntas depois de qualquer alteração. */
function useAoAlterarAnimal() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['animais'] }),
      qc.invalidateQueries({ queryKey: chaves.painel }),
    ]);
}

export function useCriarAnimal() {
  const aoAlterar = useAoAlterarAnimal();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/admin/animais', 'post'>) =>
      ok(api.POST('/v1/admin/animais', { body: d })),
    onSuccess: aoAlterar,
  });
}

export function useAtualizarAnimal(id: string) {
  const aoAlterar = useAoAlterarAnimal();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/admin/animais/{id}', 'put'>) =>
      ok(api.PUT('/v1/admin/animais/{id}', { params: { path: { id } }, body: d })),
    onSuccess: aoAlterar,
  });
}

export function useAlterarStatusAnimal(id: string) {
  const aoAlterar = useAoAlterarAnimal();
  return useMutation({
    mutationFn: (status: Exclude<StatusAnimal, 'ADOTADO'>) =>
      ok(
        api.PATCH('/v1/admin/animais/{id}/status', { params: { path: { id } }, body: { status } }),
      ),
    onSuccess: aoAlterar,
  });
}

export function useRemoverAnimal(id: string) {
  const aoAlterar = useAoAlterarAnimal();
  return useMutation({
    mutationFn: () => ok(api.DELETE('/v1/admin/animais/{id}', { params: { path: { id } } })),
    onSuccess: aoAlterar,
  });
}

/** Fotos: enviar (multipart), reordenar (ids na nova ordem) e remover uma. */
export function useFotosAnimal(id: string) {
  const aoAlterar = useAoAlterarAnimal();
  const enviar = useMutation({
    mutationFn: (fotos: readonly ArquivoUpload[]) => enviarFotosAnimal(api, id, fotos),
    onSuccess: aoAlterar,
  });
  const reordenar = useMutation({
    mutationFn: (ids: string[]) =>
      ok(api.PUT('/v1/admin/animais/{id}/fotos', { params: { path: { id } }, body: { ids } })),
    onSuccess: aoAlterar,
  });
  const remover = useMutation({
    mutationFn: (fotoId: string) =>
      ok(
        api.DELETE('/v1/admin/animais/{id}/fotos/{fotoId}', {
          params: { path: { id, fotoId } },
        }),
      ),
    onSuccess: aoAlterar,
  });
  return { enviar, reordenar, remover };
}

// ── Usuários ────────────────────────────────────────────────────────────

export function useUsuariosEquipe(role: Role | null, q: string) {
  const busca = q.trim();
  return useInfiniteQuery({
    queryKey: chaves.usuariosEquipe(role ?? TODOS, busca),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/usuarios', {
          params: {
            query: {
              ...(role ? { role } : {}),
              ...(busca ? { q: busca } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useGerenciarUsuario(id: string) {
  const qc = useQueryClient();
  const aoAlterar = () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] });
  const ativo = useMutation({
    mutationFn: (valor: boolean) =>
      ok(
        api.PATCH('/v1/admin/usuarios/{id}/ativo', {
          params: { path: { id } },
          body: { ativo: valor },
        }),
      ),
    onSuccess: aoAlterar,
  });
  const papel = useMutation({
    mutationFn: (role: 'USUARIO' | 'VOLUNTARIO') =>
      ok(api.PATCH('/v1/admin/usuarios/{id}/role', { params: { path: { id } }, body: { role } })),
    onSuccess: aoAlterar,
  });
  return { ativo, papel };
}

// ── Auditoria ───────────────────────────────────────────────────────────

/** Quem pode aparecer no filtro "feito por" (uma página basta: a equipe é pequena). */
export function useAdmins() {
  return useQuery({
    queryKey: chaves.adminsEquipe,
    queryFn: () =>
      ok(api.GET('/v1/admin/usuarios', { params: { query: { role: 'ADMIN', limite: 50 } } })),
    select: (p) => p.itens,
  });
}

export function useAuditoria(filtro: { adminId: string | null; de: string | null }) {
  return useInfiniteQuery({
    queryKey: chaves.auditoria(filtro.adminId ?? TODOS, filtro.de ?? TODOS),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/auditoria', {
          params: {
            query: {
              ...(filtro.adminId ? { adminId: filtro.adminId } : {}),
              ...(filtro.de ? { de: filtro.de } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}
