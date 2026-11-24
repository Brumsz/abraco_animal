import { cores, espaco, Texto } from '@abraco/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/** Grupo de chips (escolha única) com rótulo, ajuda e erro — como os campos do protótipo. */
export function GrupoEscolha({
  rotulo,
  ajuda,
  erro,
  children,
}: {
  readonly rotulo: string;
  readonly ajuda?: string;
  readonly erro: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.grupo} accessibilityRole="radiogroup" accessibilityLabel={rotulo}>
      <Texto variante="label" cor={cores.tintaCorpo}>
        {rotulo}
      </Texto>
      {ajuda ? (
        <Texto variante="caption" cor={cores.tintaSuave}>
          {ajuda}
        </Texto>
      ) : null}
      {children}
      {erro ? (
        <Texto variante="caption" cor={cores.erroTexto} accessibilityRole="alert">
          {erro}
        </Texto>
      ) : null}
    </View>
  );
}

/** Linha de chips que quebra (moradia, espécie, porte). */
export const estiloChips = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  par: { flexDirection: 'row', gap: espaco.md },
});

const styles = StyleSheet.create({ grupo: { gap: espaco.sm } });
