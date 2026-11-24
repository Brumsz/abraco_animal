import { cores, espaco, Texto } from '@abraco/ui';
import { HourglassMediumIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { TelaComVoltar } from './TelaComVoltar';

/** Destinos já ligados na navegação cuja tela chega na próxima parte (10e). */
export function TelaEmBreve({
  titulo,
  texto,
}: {
  readonly titulo: string;
  readonly texto: string;
}) {
  return (
    <TelaComVoltar>
      <View style={styles.conteudo}>
        <View style={styles.icone} importantForAccessibility="no-hide-descendants">
          <HourglassMediumIcon size={36} color={cores.marca} />
        </View>
        <Texto variante="titulo" accessibilityRole="header">
          {titulo}
        </Texto>
        <Texto variante="body1" cor={cores.tintaCorpo}>
          {texto}
        </Texto>
      </View>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingHorizontal: 28, paddingTop: 40, gap: espaco.lg },
  icone: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
