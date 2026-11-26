/**
 * Push no aparelho: permissão, token da Expo, registro na API e toque na
 * notificação. Só funciona em app instalado (development build / EAS), não no
 * Expo Go — lá tudo vira "indisponível" sem quebrar nada.
 */
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { obterDeviceId } from '@/core/armazenamento-seguro';
import { definirPreferenciaPush, preferenciaPush } from '@/core/preferencias';
import { api, useSessao } from '@/core/sessao';

import { lerPayload, rotaDoPush } from '../domain/push';

/** Canal Android usado pela API (channelId: 'padrao'). */
const CANAL = 'padrao';

export type ResultadoPush = 'ligado' | 'negado' | 'indisponivel';

// Com o app aberto, a notificação aparece como banner (e o sino atualiza).
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

function projetoEas(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/**
 * Liga o push: pede permissão (se `pedir`), obtém o token e o registra na API.
 * Emulador, Expo Go ou projeto sem `eas init` → 'indisponivel'.
 */
export async function ligarPush(pedir: boolean): Promise<ResultadoPush> {
  const projectId = projetoEas();
  if (!Device.isDevice || !projectId) return 'indisponivel';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: 'Avisos da ONG',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted && pedir) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return 'negado';
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    const deviceId = await obterDeviceId();
    const { response } = await api.POST('/v1/me/dispositivos-push', {
      body: { deviceId, expoToken },
    });
    return response.ok ? 'ligado' : 'indisponivel';
  } catch {
    return 'indisponivel';
  }
}

export async function desligarPush(): Promise<void> {
  const deviceId = await obterDeviceId();
  await api.DELETE('/v1/me/dispositivos-push/{deviceId}', { params: { path: { deviceId } } });
}

export async function permissaoPushConcedida(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Use uma vez no layout da área logada:
 *  - entrou: registra o aparelho (pergunta a permissão só na primeira vez; quem
 *    desligou nas Configurações não é incomodado);
 *  - notificação chegou com o app aberto: atualiza o sino;
 *  - tocou na notificação: abre a tela do tipo e marca como lida.
 */
export function usePushNotificacoes(): void {
  const router = useRouter();
  const qc = useQueryClient();
  const autenticado = useSessao((s) => s.estado === 'autenticado');
  const tratadas = useRef(new Set<string>());

  useEffect(() => {
    if (!autenticado) return;
    void (async () => {
      const preferencia = await preferenciaPush();
      if (preferencia === 'desligado') return;
      const r = await ligarPush(preferencia === null);
      if (r !== 'indisponivel')
        await definirPreferenciaPush(r === 'ligado' ? 'ligado' : 'desligado');
    })();
  }, [autenticado]);

  useEffect(() => {
    if (!autenticado) return;
    const abrir = (resposta: Notifications.NotificationResponse) => {
      const id = resposta.notification.request.identifier;
      if (tratadas.current.has(id)) return;
      tratadas.current.add(id);
      const dados: unknown = resposta.notification.request.content.data;
      const payload = lerPayload(dados);
      if (payload) {
        void api
          .POST('/v1/notificacoes/{id}/lida', { params: { path: { id: payload.notificacaoId } } })
          .then(() => qc.invalidateQueries({ queryKey: ['notificacoes'] }));
      }
      router.push(rotaDoPush(dados) as Href);
    };
    // App aberto pelo toque (estava fechado).
    const inicial = Notifications.getLastNotificationResponse();
    if (inicial) abrir(inicial);
    const toque = Notifications.addNotificationResponseReceivedListener(abrir);
    const chegou = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: ['notificacoes'] });
    });
    return () => {
      toque.remove();
      chegou.remove();
    };
  }, [autenticado, router, qc]);
}
