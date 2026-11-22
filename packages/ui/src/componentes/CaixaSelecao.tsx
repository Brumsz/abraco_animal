import { CheckIcon } from 'phosphor-react-native';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, espaco } from '../tokens/layout';
import { Texto } from './Texto';

export interface CaixaSelecaoProps {
  readonly marcada: boolean;
  readonly onChange: (marcada: boolean) => void;
  /** Texto lido pelo leitor de tela (o conteúdo visível pode ter links). */
  readonly rotulo: string;
  readonly children?: ReactNode;
  readonly erro?: string | undefined;
}

/** Caixa de seleção (aceite de termos, consentimento LGPD). */
export function CaixaSelecao({ marcada, onChange, rotulo, children, erro }: CaixaSelecaoProps) {
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={rotulo}
        accessibilityState={{ checked: marcada }}
        accessibilityHint={erro ? `Erro: ${erro}` : undefined}
        onPress={() => {
          onChange(!marcada);
        }}
        style={styles.linha}
      >
        <View
          style={[
            styles.caixa,
            marcada ? styles.marcada : null,
            erro && !marcada ? { borderColor: cores.erro } : null,
          ]}
        >
          {marcada ? <CheckIcon size={14} color={cores.branco} weight="bold" /> : null}
        </View>
        <View style={styles.texto}>
          {children ?? (
            <Texto variante="body2" cor={cores.tintaCorpo}>
              {rotulo}
            </Texto>
          )}
        </View>
      </Pressable>
      {erro ? (
        <Texto variante="caption" cor={cores.erro} style={styles.erro}>
          {erro}
        </Texto>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: espaco.xs },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: ALVO_TOQUE_MINIMO,
  },
  caixa: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: cores.linhaForte,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcada: { backgroundColor: cores.marcaEscura, borderColor: cores.marcaEscura },
  texto: { flex: 1 },
  erro: { paddingLeft: 22 + espaco.md },
});
