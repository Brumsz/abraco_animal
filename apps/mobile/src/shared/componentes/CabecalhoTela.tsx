import { cores, espaco, Texto } from '@abraco/ui';
import { StyleSheet, View } from 'react-native';

/** Título grande das telas ("Adotar", "Doar com Pix") com a linha de apoio. */
export function CabecalhoTela({
  titulo,
  subtitulo,
}: {
  readonly titulo: string;
  readonly subtitulo?: string;
}) {
  return (
    <View style={styles.cabecalho}>
      <Texto variante="titulo" accessibilityRole="header">
        {titulo}
      </Texto>
      {subtitulo ? (
        <Texto variante="body1" cor={cores.tintaSuave}>
          {subtitulo}
        </Texto>
      ) : null}
    </View>
  );
}

/** Margem lateral das telas no protótipo. */
export const MARGEM_TELA = 20;

const styles = StyleSheet.create({
  cabecalho: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: espaco.xs + 2 },
});
