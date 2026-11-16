/** Chat com a ONG: conversas, mensagens, envio e tempo real. */
import { ok, type EventoChat } from '@abraco/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { chat } from '@/core/chat';
import { chaves } from '@/core/consultas';
import { api, useSessao } from '@/core/sessao';
import { incluirMensagem, marcarLidas, type PaginaMensagens } from './cache';

export function useConversas() {
  return useQuery({ queryKey: chaves.conversas, queryFn: () => ok(api.GET('/v1/conversas')) });
}

export function useAbrirConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { mensagem: string; assunto?: string | null }) =>
      ok(api.POST('/v1/conversas', { body: d })),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.conversas }),
  });
}

export function useMensagens(conversaId: string) {
  return useInfiniteQuery({
    queryKey: chaves.mensagens(conversaId),
    queryFn: ({ pageParam }) =>
      ok(
        api.GET('/v1/conversas/{id}/mensagens', {
          params: { path: { id: conversaId }, query: pageParam ? { cursor: pageParam } : {} },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useEnviarMensagem(conversaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conteudo: string) =>
      ok(
        api.POST('/v1/conversas/{id}/mensagens', {
          params: { path: { id: conversaId } },
          body: { conteudo },
        }),
      ),
    // A resposta já entra no cache (o evento do WebSocket que chegar depois não duplica).
    onSuccess: (m) => {
      qc.setQueryData(chaves.mensagens(conversaId), (d: Parameters<typeof incluirMensagem>[0]) =>
        incluirMensagem(d, m),
      );
      void qc.invalidateQueries({ queryKey: chaves.conversas });
    },
  });
}

export function useMarcarMensagensLidas(conversaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ateMensagemId: string) =>
      ok(
        api.POST('/v1/conversas/{id}/lidas', {
          params: { path: { id: conversaId } },
          body: { ateMensagemId },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.conversas }),
  });
}

/** Quem está digitando, por conversa (some sozinho depois de 4 s sem novo aviso). */
export const useDigitando = create<Record<string, number>>(() => ({}));
const DIGITANDO_MS = 4000;

function aplicarEvento(qc: ReturnType<typeof useQueryClient>, e: EventoChat) {
  const chave = chaves.mensagens(e.conversaId);
  switch (e.tipo) {
    case 'mensagem.nova':
      qc.setQueryData(chave, (d: Parameters<typeof incluirMensagem>[0]) =>
        incluirMensagem(d, e.mensagem),
      );
      // Chegou a mensagem: o "digitando…" daquela conversa some.
      useDigitando.setState(
        (s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== e.conversaId)),
        true,
      );
      void qc.invalidateQueries({ queryKey: chaves.conversas });
      break;
    case 'mensagem.lida': {
      const atual = qc.getQueryData<Parameters<typeof marcarLidas>[0]>(chave);
      const novo = marcarLidas(atual, e.ateMensagemId, e.leitorEhEquipe);
      if (novo === null) void qc.invalidateQueries({ queryKey: chave });
      else qc.setQueryData(chave, novo);
      break;
    }
    case 'conversa.encerrada':
      void qc.invalidateQueries({ queryKey: chaves.conversas });
      break;
    case 'digitando':
      useDigitando.setState({ [e.conversaId]: Date.now() + DIGITANDO_MS });
      break;
  }
}

/**
 * Liga o WebSocket enquanto houver sessão e o app estiver em primeiro plano
 * (em segundo plano a conexão é fechada: economiza bateria e dados).
 * Use uma vez, no layout das telas logadas.
 */
export function useChatAoVivo(): void {
  const qc = useQueryClient();
  const autenticado = useSessao((s) => s.estado === 'autenticado');

  useEffect(() => {
    if (!autenticado) return;
    const parar = chat.ouvir((e) => {
      aplicarEvento(qc, e);
    });
    if (AppState.currentState === 'active') chat.conectar();
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        chat.conectar();
        // O que chegou enquanto estava fechado vem pela REST.
        void qc.invalidateQueries({ queryKey: ['chat'] });
      } else chat.desconectar();
    });
    return () => {
      parar();
      assinatura.remove();
      chat.desconectar();
    };
  }, [autenticado, qc]);
}

export type { PaginaMensagens };
