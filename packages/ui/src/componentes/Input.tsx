import { EyeIcon, EyeSlashIcon, WarningCircleIcon } from 'phosphor-react-native';
import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, espaco, raio } from '../tokens/layout';
import { fontes, MULTIPLICADOR_MAXIMO_FONTE } from '../tokens/tipografia';
import { Texto } from './Texto';

export interface InputProps extends Omit<TextInputProps, 'editable'> {
  /** Nome do campo: aparece acima (ou só para leitor de tela, com `rotuloOculto`). */
  readonly rotulo: string;
  /** Telas de login/cadastro do protótipo: só ícone + placeholder, sem rótulo visível. */
  readonly rotuloOculto?: boolean;
  readonly erro?: string | undefined;
  readonly ajuda?: string;
  readonly desabilitado?: boolean;
  /** Campo de senha com botão mostrar/ocultar. */
  readonly senha?: boolean;
  /** Ícone à esquerda; recebe a cor (laranja com foco, cinza sem). */
  readonly icone?: (cor: string) => ReactNode;
  readonly iconeDireita?: ReactNode;
  readonly ref?: Ref<ComponentRef<typeof TextInput>>;
}

/** Campo do protótipo: 56 px, raio 14, borda #D6CEC5; foco com borda laranja. */
export function Input({
  rotulo,
  rotuloOculto = false,
  erro,
  ajuda,
  desabilitado = false,
  senha = false,
  icone,
  iconeDireita,
  placeholder,
  multiline,
  onFocus,
  onBlur,
  ref,
  ...props
}: InputProps) {
  const [focado, setFocado] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  const corBorda = erro ? cores.erro : focado ? cores.marca : cores.linhaForte;
  const corIcone = erro ? cores.erro : focado ? cores.marca : cores.tintaSuave;
  const mensagem = erro ?? ajuda;

  return (
    <View style={styles.container}>
      {rotuloOculto ? null : (
        <Texto variante="label" cor={cores.tintaCorpo} importantForAccessibility="no">
          {rotulo}
        </Texto>
      )}

      <View
        style={[
          styles.campo,
          multiline ? styles.campoMultilinha : null,
          { borderColor: corBorda, borderWidth: focado || erro ? 1.5 : 1 },
          desabilitado ? styles.campoDesabilitado : null,
        ]}
      >
        {icone ? <View style={styles.iconeEsquerda}>{icone(corIcone)}</View> : null}

        <TextInput
          ref={ref}
          accessibilityLabel={rotulo}
          accessibilityHint={erro ? `Erro: ${erro}` : ajuda}
          accessibilityState={{ disabled: desabilitado }}
          editable={!desabilitado}
          placeholder={placeholder ?? (rotuloOculto ? rotulo : undefined)}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          secureTextEntry={senha && !senhaVisivel}
          placeholderTextColor={cores.tintaSuave}
          selectionColor={cores.marca}
          cursorColor={cores.marca}
          maxFontSizeMultiplier={MULTIPLICADOR_MAXIMO_FONTE}
          onFocus={(e) => {
            setFocado(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocado(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline ? styles.inputMultilinha : null,
            desabilitado ? styles.textoDesabilitado : null,
          ]}
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
            style={styles.iconeDireita}
            testID="alternar-senha"
          >
            {senhaVisivel ? (
              <EyeSlashIcon size={20} color={cores.tintaSuave} />
            ) : (
              <EyeIcon size={20} color={cores.tintaSuave} />
            )}
          </Pressable>
        ) : iconeDireita ? (
          <View style={styles.iconeDireita}>{iconeDireita}</View>
        ) : null}
      </View>

      {mensagem ? (
        <View style={styles.mensagem} accessibilityLiveRegion={erro ? 'polite' : 'none'}>
          {erro ? <WarningCircleIcon size={16} color={cores.erro} weight="fill" /> : null}
          <Texto variante="caption" cor={erro ? cores.erro : cores.tintaSuave} style={styles.flex}>
            {mensagem}
          </Texto>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: espaco.sm },
  campo: {
    minHeight: 56,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espaco.lg,
    gap: espaco.md,
  },
  campoMultilinha: { minHeight: 120, alignItems: 'flex-start', paddingVertical: espaco.md },
  campoDesabilitado: { backgroundColor: cores.fundoSuave },
  iconeEsquerda: { width: 20, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: ALVO_TOQUE_MINIMO,
    fontFamily: fontes.interRegular,
    fontSize: 15,
    color: cores.tinta,
  },
  inputMultilinha: { minHeight: 96 },
  textoDesabilitado: { color: cores.tintaSuave },
  iconeDireita: {
    minWidth: ALVO_TOQUE_MINIMO,
    minHeight: ALVO_TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -espaco.md,
  },
  mensagem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.xs,
    paddingHorizontal: espaco.xs,
  },
});
