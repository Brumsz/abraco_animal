import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { cores } from '../tokens/cores';
import { ALVO_TOQUE_MINIMO, espaco, raio } from '../tokens/layout';
import { fontes } from '../tokens/tipografia';
import { Texto } from './Texto';

export interface ChipProps {
  readonly rotulo: string;
  readonly selecionado: boolean;
  readonly onPress: () => void;
  /**
   * filtro: selecionado = laranja cheio ("Todos", "R$ 25").
   * opcao: selecionado = laranja claro com borda ("Sim", "Fins de semana").
   */
  readonly variante?: 'filtro' | 'opcao';
  /** radio = escolha única; checkbox = várias. */
  readonly papel?: 'radio' | 'checkbox';
  /** Ocupa a largura disponível (pares "Sim | Não"). */
  readonly expandir?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function Chip({
  rotulo,
  selecionado,
  onPress,
  variante = 'opcao',
  papel = 'radio',
  expandir = false,
  style,
}: ChipProps) {
  const filtro = variante === 'filtro';
  const fundo = selecionado ? (filtro ? cores.marcaEscura : cores.marcaClara) : cores.superficie;
  const borda = selecionado ? (filtro ? cores.marcaEscura : cores.marca) : cores.linhaForte;
  const texto = selecionado ? (filtro ? cores.branco : cores.marcaEscura) : cores.tinta;

  return (
    <Pressable
      accessibilityRole={papel}
      accessibilityLabel={rotulo}
      accessibilityState={{ checked: selecionado }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        expandir ? styles.expandir : null,
        filtro ? styles.filtro : styles.opcao,
        {
          backgroundColor: fundo,
          borderColor: borda,
          borderWidth: selecionado && !filtro ? 1.5 : 1,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Texto
        variante="label"
        cor={texto}
        style={{ fontFamily: fontes.interSemiBold, fontSize: 14 }}
        numberOfLines={1}
      >
        {rotulo}
      </Texto>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: ALVO_TOQUE_MINIMO,
    paddingHorizontal: espaco.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtro: { borderRadius: raio.pilula, minHeight: 42 },
  opcao: { borderRadius: raio.md, minHeight: 48 },
  expandir: { flex: 1 },
});
