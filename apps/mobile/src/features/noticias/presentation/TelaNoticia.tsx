import { cores, espaco, raio, SkeletonLoader, Texto } from '@abraco/ui';
import { useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { dataCurta } from '@/shared/tempo';

import { useNoticia } from '../data/hooks';
import { TextoMarkdown } from './TextoMarkdown';

/** Leitura de uma notícia do Jornal. */
export default function TelaNoticia() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const noticia = useNoticia(slug);

  let corpo;
  if (noticia.isPending) {
    corpo = (
      <View style={styles.conteudo} accessible accessibilityLabel="Carregando notícia">
        <SkeletonLoader altura={200} raio={20} />
        <SkeletonLoader altura={28} raio={8} />
        <SkeletonLoader altura={120} raio={8} />
      </View>
    );
  } else if (noticia.isError) {
    corpo = <EstadoErro erro={noticia.error} aoTentarDeNovo={() => void noticia.refetch()} />;
  } else {
    const n = noticia.data;
    corpo = (
      <ScrollView contentContainerStyle={styles.conteudo}>
        {n.imagem ? (
          <Image source={{ uri: n.imagem }} style={styles.capa} accessibilityIgnoresInvertColors />
        ) : null}
        <Texto variante="caption" cor={cores.tintaSuave}>
          {dataCurta(n.criadoEm)}
        </Texto>
        <Texto variante="h1" accessibilityRole="header">
          {n.titulo}
        </Texto>
        <Texto variante="body1" cor={cores.tintaSuave}>
          {n.resumo}
        </Texto>
        <View style={styles.divisor} />
        <TextoMarkdown conteudo={n.conteudo ?? ''} />
      </ScrollView>
    );
  }
  return <TelaComVoltar>{corpo}</TelaComVoltar>;
}

const styles = StyleSheet.create({
  conteudo: {
    paddingHorizontal: MARGEM_TELA,
    paddingTop: espaco.lg,
    paddingBottom: espaco.xxl,
    gap: espaco.md,
  },
  capa: { height: 200, borderRadius: raio.lg, backgroundColor: cores.fundoSuave },
  divisor: { height: 1, backgroundColor: cores.linha, marginVertical: espaco.xs },
});
