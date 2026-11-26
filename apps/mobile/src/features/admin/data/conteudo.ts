/**
 * Gestão de conteúdo da equipe: notícias (Markdown + capa), posts do feed (imagens),
 * seções do perfil da ONG e FAQ. Cada alteração também invalida o que o público vê.
 */
import {
  criarPost,
  definirCapaNoticia,
  ok,
  type ArquivoUpload,
  type Corpo,
} from '@abraco/api-client';
import type { SecaoPerfilOng } from '@abraco/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api } from '@/core/sessao';

type Qc = ReturnType<typeof useQueryClient>;
const invalidar = (qc: Qc, ...prefixos: (readonly string[])[]) =>
  Promise.all(prefixos.map((queryKey) => qc.invalidateQueries({ queryKey })));

// ── Notícias ────────────────────────────────────────────────────────────

export type FiltroNoticias = 'todas' | 'publicadas' | 'rascunhos';

export function useNoticiasEquipe(filtro: FiltroNoticias) {
  return useInfiniteQuery({
    queryKey: chaves.noticiasEquipe(filtro),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/noticias', {
          params: {
            query: {
              ...(filtro === 'todas'
                ? {}
                : { publicado: filtro === 'publicadas' ? 'true' : 'false' }),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useNoticiaEquipe(id: string) {
  return useQuery({
    queryKey: chaves.noticiaEquipe(id),
    queryFn: () => ok(api.GET('/v1/admin/noticias/{id}', { params: { path: { id } } })),
  });
}

function useAoAlterarNoticia() {
  const qc = useQueryClient();
  return () => invalidar(qc, ['admin', 'noticias'], ['noticias']);
}

/** Sem id = criar; com id = editar (o slug fica o mesmo: links antigos não quebram). */
export function useSalvarNoticia(id: string | null) {
  const aoAlterar = useAoAlterarNoticia();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/admin/noticias', 'post'>) =>
      id
        ? ok(api.PUT('/v1/admin/noticias/{id}', { params: { path: { id } }, body: d }))
        : ok(api.POST('/v1/admin/noticias', { body: d })),
    onSuccess: aoAlterar,
  });
}

export function useGerenciarNoticia(id: string) {
  const aoAlterar = useAoAlterarNoticia();
  const publicar = useMutation({
    mutationFn: (publicado: boolean) =>
      ok(
        api.PUT('/v1/admin/noticias/{id}/publicacao', {
          params: { path: { id } },
          body: { publicado },
        }),
      ),
    onSuccess: aoAlterar,
  });
  const capa = useMutation({
    mutationFn: (imagem: ArquivoUpload | null) =>
      imagem
        ? definirCapaNoticia(api, id, imagem)
        : ok(api.DELETE('/v1/admin/noticias/{id}/imagem', { params: { path: { id } } })),
    onSuccess: aoAlterar,
  });
  const remover = useMutation({
    mutationFn: () => ok(api.DELETE('/v1/admin/noticias/{id}', { params: { path: { id } } })),
    onSuccess: aoAlterar,
  });
  return { publicar, capa, remover };
}

// ── Posts ───────────────────────────────────────────────────────────────

export function usePostsEquipe() {
  return useInfiniteQuery({
    queryKey: chaves.postsEquipe,
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/admin/posts', {
          params: { query: pageParam ? { cursor: pageParam } : {} },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

function useAoAlterarPost() {
  const qc = useQueryClient();
  return () => invalidar(qc, chaves.postsEquipe, ['feed']);
}

export function useCriarPost() {
  const aoAlterar = useAoAlterarPost();
  return useMutation({
    mutationFn: (d: { legenda: string; imagens: readonly ArquivoUpload[] }) =>
      criarPost(api, d.legenda, d.imagens),
    onSuccess: aoAlterar,
  });
}

export function useGerenciarPost(id: string) {
  const aoAlterar = useAoAlterarPost();
  const legenda = useMutation({
    mutationFn: (texto: string) =>
      ok(api.PATCH('/v1/admin/posts/{id}', { params: { path: { id } }, body: { legenda: texto } })),
    onSuccess: aoAlterar,
  });
  const publicar = useMutation({
    mutationFn: (publicado: boolean) =>
      ok(
        api.PUT('/v1/admin/posts/{id}/publicacao', {
          params: { path: { id } },
          body: { publicado },
        }),
      ),
    onSuccess: aoAlterar,
  });
  const remover = useMutation({
    mutationFn: () => ok(api.DELETE('/v1/admin/posts/{id}', { params: { path: { id } } })),
    onSuccess: aoAlterar,
  });
  return { legenda, publicar, remover };
}

// ── Perfil da ONG ───────────────────────────────────────────────────────

export function useSecoesEquipe() {
  return useQuery({
    queryKey: chaves.secoesEquipe,
    queryFn: () => ok(api.GET('/v1/admin/perfil-ong')),
  });
}

export function useSalvarSecao(secao: SecaoPerfilOng) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/admin/perfil-ong/{secao}', 'put'>) =>
      ok(api.PUT('/v1/admin/perfil-ong/{secao}', { params: { path: { secao } }, body: d })),
    onSuccess: () => invalidar(qc, chaves.secoesEquipe, chaves.perfilOng),
  });
}

// ── FAQ ─────────────────────────────────────────────────────────────────

export function useFaqEquipe() {
  return useQuery({
    queryKey: chaves.faqEquipe,
    queryFn: () => ok(api.GET('/v1/admin/faq')),
  });
}

export function useGerenciarFaq() {
  const qc = useQueryClient();
  const aoAlterar = () => invalidar(qc, chaves.faqEquipe, chaves.faq);
  const salvar = useMutation({
    mutationFn: ({ id, ...d }: Corpo<'/v1/admin/faq', 'post'> & { id: string | null }) =>
      id
        ? ok(api.PUT('/v1/admin/faq/{id}', { params: { path: { id } }, body: d }))
        : ok(api.POST('/v1/admin/faq', { body: d })),
    onSuccess: aoAlterar,
  });
  const remover = useMutation({
    mutationFn: (id: string) => ok(api.DELETE('/v1/admin/faq/{id}', { params: { path: { id } } })),
    onSuccess: aoAlterar,
  });
  const reordenar = useMutation({
    mutationFn: (ids: string[]) => ok(api.PUT('/v1/admin/faq/ordem', { body: { ids } })),
    onSuccess: aoAlterar,
  });
  return { salvar, remover, reordenar };
}
