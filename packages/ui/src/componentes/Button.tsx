import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, duracao, espaco, raio, sombraMarca } from '../tokens/layout';
import { fontes } from '../tokens/tipografia';
import { Texto } from './Texto';

/**
 * primario: laranja cheio ("Entrar") · secundario: laranja claro ("Quero adotar") ·
 * contorno: branco com borda ("Não") · ghost: só texto · destrutivo: vermelho.
 */
export type VarianteBotao = 'primario' | 'secundario' | 'contorno' | 'ghost' | 'destrutivo';
export type TamanhoBotao = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly titulo: string;
  readonly variante?: VarianteBotao;
  readonly tamanho?: TamanhoBotao;
  readonly carregando?: boolean;
  readonly icone?: ReactNode;
  readonly larguraTotal?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

interface Aparencia {
  readonly fundo: string;
  readonly fundoPressionado: string;
  readonly texto: string;
  readonly borda?: string;
  readonly sombra?: ViewStyle;
}

// Todas as combinações de texto/fundo atendem WCAG AA (ver tokens/cores.ts).
const APARENCIAS: Record<VarianteBotao, Aparencia> = {
  primario: {
    fundo: cores.marcaEscura,
    fundoPressionado: cores.marcaPressionada,
    texto: cores.branco,
    sombra: sombraMarca,
  },
  secundario: {
    fundo: cores.marcaClara,
    fundoPressionado: cores.marcaClaraForte,
    texto: cores.marcaEscura,
  },
  contorno: {
    fundo: cores.superficie,
    fundoPressionado: cores.fundoSuave,
    texto: cores.tinta,
    borda: cores.linhaForte,
  },
  ghost: { fundo: 'transparent', fundoPressionado: cores.marcaClara, texto: cores.marcaEscura },
  destrutivo: { fundo: cores.erro, fundoPressionado: '#B91C1C', texto: cores.branco },
};

const TAMANHOS: Record<TamanhoBotao, { altura: number; padding: number; fonte: number }> = {
  sm: { altura: ALVO_TOQUE_MINIMO, padding: espaco.md, fonte: 14 },
  md: { altura: 48, padding: espaco.lg, fonte: 15 },
  lg: { altura: 56, padding: espaco.xl, fonte: 16 },
};

export function Button({
  titulo,
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  icone,
  larguraTotal = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const aparencia = APARENCIAS[variante];
  const medidas = TAMANHOS[tamanho];
  const inativo = Boolean(disabled) || carregando;
  const desabilitado = inativo && !carregando;
  const corTexto = desabilitado ? cores.tintaSuave : aparencia.texto;

  const escala = useSharedValue(1);
  const estiloAnimado = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));

  return (
    <Animated.View style={[larguraTotal ? styles.larguraTotal : null, estiloAnimado, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={titulo}
        accessibilityState={{ disabled: inativo, busy: carregando }}
        disabled={inativo}
        hitSlop={medidas.altura < ALVO_TOQUE_MINIMO ? espaco.sm : 0}
        onPressIn={(e) => {
          escala.set(withTiming(0.97, { duration: duracao.rapida }));
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          escala.set(withTiming(1, { duration: duracao.rapida }));
          onPressOut?.(e);
        }}
        style={({ pressed }) => [
          styles.base,
          {
            minHeight: medidas.altura,
            paddingHorizontal: medidas.padding,
            backgroundColor: pressed ? aparencia.fundoPressionado : aparencia.fundo,
          },
          aparencia.borda ? { borderWidth: 1, borderColor: aparencia.borda } : null,
          desabilitado ? styles.desabilitado : aparencia.sombra,
        ]}
        {...props}
      >
        {carregando ? (
          <ActivityIndicator color={aparencia.texto} accessibilityLabel="Carregando" />
        ) : (
          <View style={styles.conteudo}>
            {icone}
            <Texto
              variante="label"
              cor={corTexto}
              style={{ fontSize: medidas.fonte, lineHeight: 20, fontFamily: fontes.displayBold }}
              numberOfLines={1}
            >
              {titulo}
            </Texto>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: raio.botao,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  larguraTotal: { alignSelf: 'stretch' },
  desabilitado: {
    backgroundColor: cores.linha,
    borderColor: cores.linha,
  },
});
