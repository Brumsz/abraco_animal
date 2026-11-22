import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { cores } from '../tokens/cores';
import { espaco, raio } from '../tokens/layout';
import { fontes } from '../tokens/tipografia';
import { Texto } from './Texto';

export interface CampoCodigoProps {
  readonly valor: string;
  readonly onChange: (codigo: string) => void;
  readonly digitos?: number;
  readonly erro?: string | undefined;
  /** Chamado quando todos os dígitos foram preenchidos. */
  readonly aoCompletar?: (codigo: string) => void;
}

/**
 * Código de verificação em caixas (protótipo "Recuperar senha - Código").
 * Um único TextInput invisível recebe o texto: colar o código e o preenchimento
 * automático do SMS/e-mail (oneTimeCode) funcionam; as caixas só desenham.
 */
export function CampoCodigo({ valor, onChange, digitos = 6, erro, aoCompletar }: CampoCodigoProps) {
  const entrada = useRef<ComponentRef<typeof TextInput>>(null);
  const [focado, setFocado] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => entrada.current?.focus()}
        style={styles.caixas}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {Array.from({ length: digitos }, (_, i) => {
          const atual = focado && i === Math.min(valor.length, digitos - 1);
          return (
            <View
              key={i}
              style={[
                styles.caixa,
                {
                  borderColor: erro ? cores.erro : atual ? cores.marca : cores.linhaForte,
                  borderWidth: atual || erro ? 1.5 : 1,
                },
              ]}
            >
              <Texto variante="h2" cor={cores.tinta}>
                {valor[i] ?? ''}
              </Texto>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={entrada}
        value={valor}
        onChangeText={(texto) => {
          const limpo = texto.replace(/\D/g, '').slice(0, digitos);
          onChange(limpo);
          if (limpo.length === digitos) aoCompletar?.(limpo);
        }}
        onFocus={() => {
          setFocado(true);
        }}
        onBlur={() => {
          setFocado(false);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={digitos}
        autoFocus
        accessibilityLabel={`Código de ${String(digitos)} dígitos`}
        accessibilityHint={erro ? `Erro: ${erro}` : undefined}
        style={styles.oculto}
        caretHidden
      />

      {erro ? (
        <Texto variante="caption" cor={cores.erro} accessibilityLiveRegion="polite">
          {erro}
        </Texto>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: espaco.sm },
  caixas: { flexDirection: 'row', justifyContent: 'space-between', gap: espaco.sm },
  caixa: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 46 / 58,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fica sobre as caixas (para receber toque/foco), mas invisível.
  oculto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 58,
    opacity: 0.01,
    color: 'transparent',
    fontFamily: fontes.interRegular,
  },
});
