/** Autenticação: login, cadastro, perfil, sair e recuperação de senha. */
import { ok, type Corpo } from '@abraco/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';

import { chaves } from '@/core/consultas';
import { api, entrar, obterDeviceId, sair, useSessao } from '@/core/sessao';

type SemAparelho<T> = Omit<T, 'deviceId'>;

export function useEntrar() {
  return useMutation({
    mutationFn: async (dados: SemAparelho<Corpo<'/v1/auth/login', 'post'>>) => {
      const sessao = await ok(
        api.POST('/v1/auth/login', { body: { ...dados, deviceId: await obterDeviceId() } }),
      );
      await entrar(sessao);
      return sessao.usuario;
    },
  });
}

export function useCadastrar() {
  return useMutation({
    mutationFn: async (dados: SemAparelho<Corpo<'/v1/auth/cadastro', 'post'>>) => {
      const sessao = await ok(
        api.POST('/v1/auth/cadastro', { body: { ...dados, deviceId: await obterDeviceId() } }),
      );
      await entrar(sessao);
      return sessao.usuario;
    },
  });
}

export function usePerfil() {
  const autenticado = useSessao((s) => s.estado === 'autenticado');
  return useQuery({
    queryKey: chaves.perfil,
    queryFn: () => ok(api.GET('/v1/me')),
    enabled: autenticado,
  });
}

export function useSair() {
  return useMutation({ mutationFn: sair });
}

/** Recuperação em 3 passos (e-mail → código de 6 dígitos → nova senha). */
export function useSolicitarRecuperacao() {
  return useMutation({
    mutationFn: (email: string) =>
      ok(api.POST('/v1/auth/recuperar-senha/solicitar', { body: { email } })),
  });
}

export function useVerificarCodigo() {
  return useMutation({
    mutationFn: (dados: Corpo<'/v1/auth/recuperar-senha/verificar-codigo', 'post'>) =>
      ok(api.POST('/v1/auth/recuperar-senha/verificar-codigo', { body: dados })),
  });
}

export function useRedefinirSenha() {
  return useMutation({
    mutationFn: (dados: Corpo<'/v1/auth/recuperar-senha/redefinir', 'post'>) =>
      ok(api.POST('/v1/auth/recuperar-senha/redefinir', { body: dados })),
  });
}
