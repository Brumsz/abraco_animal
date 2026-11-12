import { EyeIcon, EyeSlashIcon, WarningCircleIcon } from 'phosphor-react-native';
import { useEffect, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, duracao, espaco, raio } from '../tokens/layout';
import { fontes, MULTIPLICADOR_MAXIMO_FONTE } from '../tokens/tipografia';
import { Texto } from './Texto';

export interface InputProps extends Omit<TextInputProps, 'placeholder' | 'editable'> {
  readonly rotulo: string;
  readonly erro?: string | undefined;
  readonly ajuda?: string;
  readonly desabilitado?: boolean;
  /** Campo de senha com botão mostrar/ocultar. */
  readonly senha?: boolean;
  readonly iconeDireita?: ReactNode;
  readonly ref?: Ref<ComponentRef<typeof TextInput>>;
}

const ALTURA = 56;
const LINHA_ROTULO = 24;
/** Posição inicial: centralizado no campo. Flutuando: centralizado sobre a borda superior. */
const TOPO_ROTULO = (ALTURA - LINHA_ROTULO) / 2;

export function Input({
  rotulo,
  erro,
  ajuda,
  desabilitado = false,
  senha = false,
  iconeDireita,
  value,
  defaultValue,
  onFocus,
  onBlur,
  ref,
  ...props
}: InputProps) {
  const [focado, setFocado] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const reduzirMovimento = useReducedMotion();

  const preenchido = Boolean(value ?? defaultValue);
  const flutuando = useSharedValue(preenchido ? 1 : 0);
  const foco = useSharedValue(0);

  useEffect(() => {
    const config = { duration: reduzirMovimento ? 0 : duracao.rapida };
    flutuando.set(withTiming(focado || preenchido ? 1 : 0, config));
    foco.set(withTiming(focado ? 1 : 0, config));
  }, [focado, preenchido, reduzirMovimento, flutuando, foco]);

  // Contraste de componentes (WCAG 1.4.11 ≥ 3:1): borda neutro500, foco laranjaTexto.
  const corBordaBase = erro ? cores.erroForte : cores.neutro500;
  const estiloBorda = useAnimatedStyle(() => ({
    borderColor: erro
      ? cores.erroForte
      : interpolateColor(foco.get(), [0, 1], [corBordaBase, cores.laranjaTexto]),
    borderWidth: interpolate(foco.get(), [0, 1], [1.5, 2]),
  }));
  const estiloRotulo = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(flutuando.get(), [0, 1], [0, -(TOPO_ROTULO + LINHA_ROTULO / 2)]) },
      { scale: interpolate(flutuando.get(), [0, 1], [1, 0.8]) },
    ],
  }));

  const corRotulo = erro ? cores.erroForte : focado ? cores.laranjaTexto : cores.neutro600;
  const mensagem = erro ?? ajuda;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.campo, desabilitado ? styles.campoDesabilitado : null, estiloBorda]}
      >
        <Animated.Text
          style={[styles.rotulo, { color: corRotulo }, estiloRotulo]}
          maxFontSizeMultiplier={1.4}
          pointerEvents="none"
          importantForAccessibility="no"
        >
          {rotulo}
        </Animated.Text>

        <TextInput
          ref={ref}
          accessibilityLabel={rotulo}
          accessibilityHint={erro ? `Erro: ${erro}` : ajuda}
          accessibilityState={{ disabled: desabilitado }}
          editable={!desabilitado}
          value={value}
          defaultValue={defaultValue}
          secureTextEntry={senha && !senhaVisivel}
          placeholderTextColor={cores.neutro500}
          selectionColor={cores.laranjaTexto}
          maxFontSizeMultiplier={MULTIPLICADOR_MAXIMO_FONTE}
          onFocus={(e) => {
            setFocado(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocado(false);
            onBlur?.(e);
          }}
          style={[styles.input, desabilitado ? styles.textoDesabilitado : null]}
          {...props}
        />

        {senha ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={() => {
              setSenhaVisivel((v) => !v);
            }}
            hitSlop={espaco.sm}
            style={styles.icone}
            testID="alternar-senha"
          >
            {senhaVisivel ? (
              <EyeSlashIcon size={22} color={cores.neutro600} />
            ) : (
              <EyeIcon size={22} color={cores.neutro600} />
            )}
          </Pressable>
        ) : iconeDireita ? (
          <View style={styles.icone}>{iconeDireita}</View>
        ) : null}
      </Animated.View>

      {mensagem ? (
        <View style={styles.mensagem} accessibilityLiveRegion={erro ? 'polite' : 'none'}>
          {erro ? <WarningCircleIcon size={16} color={cores.erroForte} weight="fill" /> : null}
          <Texto variante="caption" cor={erro ? cores.erroForte : cores.neutro600}>
            {mensagem}
          </Texto>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: espaco.xs },
  campo: {
    minHeight: ALTURA,
    borderRadius: raio.md,
    backgroundColor: cores.branco,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espaco.lg,
  },
  campoDesabilitado: { backgroundColor: cores.neutro100 },
  rotulo: {
    position: 'absolute',
    top: TOPO_ROTULO,
    left: espaco.lg - 4,
    paddingHorizontal: 4,
    backgroundColor: cores.branco,
    fontFamily: fontes.interRegular,
    fontSize: 16,
    lineHeight: LINHA_ROTULO,
    transformOrigin: 'left center',
  },
  input: {
    flex: 1,
    minHeight: ALVO_TOQUE_MINIMO,
    paddingTop: espaco.md,
    paddingBottom: espaco.xs,
    fontFamily: fontes.interRegular,
    fontSize: 16,
    color: cores.neutro900,
  },
  textoDesabilitado: { color: cores.neutro500 },
  icone: {
    minWidth: ALVO_TOQUE_MINIMO,
    minHeight: ALVO_TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -espaco.sm,
  },
  mensagem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.xs,
    paddingHorizontal: espaco.xs,
  },
});
