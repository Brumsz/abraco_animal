/** "Minha conta": resumo, editar perfil, trocar senha, exportar e excluir (LGPD). */
import { ok, type Corpo, type UsuarioPerfil } from '@abraco/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api, encerrarLocalmente, useSessao } from '@/core/sessao';

export function useResumoConta() {
  return useQuery({ queryKey: chaves.resumoConta, queryFn: () => ok(api.GET('/v1/me/resumo')) });
}

/** Atualiza o cache do perfil e a sessão (a saudação da Home usa o nome da sessão). */
function aplicarPerfil(qc: ReturnType<typeof useQueryClient>, u: UsuarioPerfil): void {
  qc.setQueryData(chaves.perfil, u);
  useSessao.setState({ usuario: u });
}

export function useAtualizarPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Corpo<'/v1/me', 'patch'>) => ok(api.PATCH('/v1/me', { body: d })),
    onSuccess: (u) => {
      aplicarPerfil(qc, u);
    },
  });
}

export function useAlterarSenha() {
  return useMutation({
    mutationFn: (d: Corpo<'/v1/me/senha', 'post'>) => ok(api.POST('/v1/me/senha', { body: d })),
  });
}

/** Cópia dos dados (LGPD). Nunca vai para o cache: tem CPF e nascimento. */
export function useExportarDados() {
  return useMutation({ mutationFn: () => ok(api.GET('/v1/me/exportacao')) });
}

export function useExcluirConta() {
  return useMutation({
    mutationFn: (senha: string) => ok(api.DELETE('/v1/me', { body: { senha } })),
    // A API já revogou tudo: só falta limpar o aparelho (volta para o login).
    onSuccess: () => encerrarLocalmente(),
  });
}
