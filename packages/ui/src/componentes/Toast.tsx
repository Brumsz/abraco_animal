import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from 'phosphor-react-native';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, espaco, raio, sombraSuave } from '../tokens/layout';
import { Texto } from './Texto';

export type TipoToast = 'sucesso' | 'erro' | 'info';

export interface OpcoesToast {
  readonly tipo?: TipoToast;
  readonly mensagem: string;
  /** Padrão: 4s. Erros ficam 6s para dar tempo de ler. */
  readonly duracaoMs?: number;
}

interface ToastAtivo extends Required<OpcoesToast> {
  readonly id: number;
}

interface ContextoToast {
  mostrar(opcoes: OpcoesToast): void;
  esconder(): void;
}

const Contexto = createContext<ContextoToast | null>(null);

const VISUAL: Record<TipoToast, { borda: string; Icone: typeof InfoIcon }> = {
  sucesso: { borda: '#16A34A', Icone: CheckCircleIcon },
  erro: { borda: cores.erroForte, Icone: WarningCircleIcon },
  info: { borda: cores.laranjaTexto, Icone: InfoIcon },
};

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastAtivo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proximoId = useRef(0);

  const esconder = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const mostrar = useCallback(({ tipo = 'info', mensagem, duracaoMs }: OpcoesToast) => {
    if (timer.current) clearTimeout(timer.current);
    const duracao = duracaoMs ?? (tipo === 'erro' ? 6000 : 4000);
    proximoId.current += 1;
    setToast({ id: proximoId.current, tipo, mensagem, duracaoMs: duracao });
    // iOS não tem live region: anuncia explicitamente para o VoiceOver.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(mensagem);
    timer.current = setTimeout(() => {
      setToast(null);
    }, duracao);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const valor = useMemo(() => ({ mostrar, esconder }), [mostrar, esconder]);

  return (
    <Contexto value={valor}>
      {children}
      {toast ? <ItemToast key={toast.id} toast={toast} aoFechar={esconder} /> : null}
    </Contexto>
  );
}

function ItemToast({
  toast,
  aoFechar,
}: {
  readonly toast: ToastAtivo;
  readonly aoFechar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduzirMovimento = useReducedMotion();
  const { borda, Icone } = VISUAL[toast.tipo];

  return (
    <Animated.View
      entering={reduzirMovimento ? undefined : FadeInUp.duration(200)}
      exiting={reduzirMovimento ? undefined : FadeOutUp.duration(150)}
      style={[styles.posicao, { top: insets.top + espaco.sm }]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.toast, { borderLeftColor: borda }]}
        accessibilityRole="alert"
        accessibilityLiveRegion={toast.tipo === 'erro' ? 'assertive' : 'polite'}
        testID={`toast-${toast.tipo}`}
      >
        <Icone size={22} color={borda} weight="fill" />
        <Texto variante="body2" style={styles.mensagem}>
          {toast.mensagem}
        </Texto>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar aviso"
          onPress={aoFechar}
          hitSlop={espaco.sm}
          style={styles.fechar}
        >
          <XIcon size={18} color={cores.neutro600} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function useToast(): ContextoToast {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return contexto;
}

const styles = StyleSheet.create({
  posicao: { position: 'absolute', left: espaco.lg, right: espaco.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    backgroundColor: cores.branco,
    borderRadius: raio.md,
    borderLeftWidth: 4,
    paddingLeft: espaco.lg,
    paddingVertical: espaco.sm,
    minHeight: 56,
    ...sombraSuave,
  },
  mensagem: { flex: 1 },
  fechar: {
    width: ALVO_TOQUE_MINIMO,
    height: ALVO_TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
