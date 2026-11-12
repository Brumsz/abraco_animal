import { XIcon } from 'phosphor-react-native';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, espaco, raio } from '../tokens/layout';
import { Texto } from './Texto';

export interface BottomSheetProps {
  readonly visivel: boolean;
  readonly aoFechar: () => void;
  readonly titulo: string;
  readonly children: ReactNode;
  /** Rodapé fixo (ex.: botões de ação), fora da área rolável. */
  readonly rodape?: ReactNode;
  /** false impede fechar tocando fora (ex.: formulário com dados preenchidos). */
  readonly fecharAoTocarFora?: boolean;
}

/**
 * Painel inferior para confirmações e formulários secundários.
 * Fecha pelo botão X, pelo botão voltar do Android ou tocando fora.
 */
export function BottomSheet({
  visivel,
  aoFechar,
  titulo,
  children,
  rodape,
  fecharAoTocarFora = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reduzirMovimento = useReducedMotion();

  return (
    <Modal
      visible={visivel}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={aoFechar}
    >
      {visivel ? (
        <KeyboardAvoidingView
          style={styles.raiz}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            entering={reduzirMovimento ? undefined : FadeIn.duration(200)}
            exiting={reduzirMovimento ? undefined : FadeOut.duration(150)}
            style={StyleSheet.absoluteFill}
          >
            <Pressable
              style={styles.fundo}
              onPress={fecharAoTocarFora ? aoFechar : undefined}
              accessibilityLabel="Fechar"
              importantForAccessibility="no"
            />
          </Animated.View>

          <Animated.View
            entering={reduzirMovimento ? undefined : SlideInDown.duration(250)}
            exiting={reduzirMovimento ? undefined : SlideOutDown.duration(200)}
            style={[styles.painel, { paddingBottom: insets.bottom + espaco.lg }]}
            accessibilityViewIsModal
          >
            <View style={styles.alca} importantForAccessibility="no" />
            <View style={styles.cabecalho}>
              <Texto variante="h3" cor={cores.marromTexto} style={styles.titulo}>
                {titulo}
              </Texto>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                onPress={aoFechar}
                style={styles.fechar}
              >
                <XIcon size={22} color={cores.neutro600} />
              </Pressable>
            </View>
            <View style={styles.conteudo}>{children}</View>
            {rodape ? <View style={styles.rodape}>{rodape}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, justifyContent: 'flex-end' },
  fundo: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.5)' },
  painel: {
    backgroundColor: cores.branco,
    borderTopLeftRadius: raio.xl,
    borderTopRightRadius: raio.xl,
    paddingHorizontal: espaco.xl,
    maxHeight: '90%',
  },
  alca: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: cores.neutro200,
    marginTop: espaco.sm,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: espaco.md,
    paddingBottom: espaco.sm,
  },
  titulo: { flex: 1 },
  fechar: {
    width: ALVO_TOQUE_MINIMO,
    height: ALVO_TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -espaco.md,
  },
  conteudo: { flexShrink: 1 },
  rodape: { paddingTop: espaco.lg, gap: espaco.sm },
});
