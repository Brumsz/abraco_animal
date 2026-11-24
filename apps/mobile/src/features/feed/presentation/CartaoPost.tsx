import type { Post } from '@abraco/api-client';
import { cores, espaco, fontes, sombraSuave, Texto } from '@abraco/ui';
import { HeartIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { tempoRelativo } from '@/shared/tempo';

const ALTURA_IMAGEM = 210;

/** Post do "Laços & Abraços" (protótipo Home): autor, imagens, legenda e curtida. */
export function CartaoPost({
  post,
  aoCurtir,
}: {
  readonly post: Post;
  readonly aoCurtir: (curtir: boolean) => void;
}) {
  const [largura, setLargura] = useState(0);
  return (
    <View style={styles.cartao}>
      <View style={styles.autor}>
        <View style={styles.iconeAutor} importantForAccessibility="no-hide-descendants">
          <HeartIcon size={18} color={cores.marca} />
        </View>
        <View>
          <Texto variante="h3" style={styles.nomeAutor}>
            Abraço Animal
          </Texto>
          <Texto variante="caption" cor={cores.tintaSuave} style={styles.quando}>
            {tempoRelativo(post.criadoEm)}
          </Texto>
        </View>
      </View>

      <View
        onLayout={(e) => {
          setLargura(e.nativeEvent.layout.width);
        }}
      >
        {largura > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.imagens}
            accessibilityLabel={
              post.imagens.length > 1 ? `${String(post.imagens.length)} fotos` : 'Foto do post'
            }
          >
            {post.imagens.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.url }}
                style={[styles.imagem, { width: largura }]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.imagens} />
        )}
      </View>

      {post.legenda ? (
        <Texto variante="body2" cor={cores.tintaCorpo}>
          {post.legenda}
        </Texto>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={post.curtidoPorMim ? 'Descurtir' : 'Curtir'}
        accessibilityHint={`${String(post.totalCurtidas)} curtidas`}
        accessibilityState={{ selected: post.curtidoPorMim }}
        hitSlop={10}
        onPress={() => {
          aoCurtir(!post.curtidoPorMim);
        }}
        style={styles.curtidas}
      >
        <HeartIcon size={22} color={cores.marca} weight={post.curtidoPorMim ? 'fill' : 'regular'} />
        <Texto variante="label" cor={cores.tintaCorpo}>
          {post.totalCurtidas}
        </Texto>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: cores.linha,
    padding: 14,
    gap: espaco.md,
    ...sombraSuave,
  },
  autor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconeAutor: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nomeAutor: { fontFamily: fontes.displaySemiBold, fontSize: 16 },
  quando: { fontFamily: fontes.interMedium, fontSize: 11, lineHeight: 14 },
  imagens: { height: ALTURA_IMAGEM, borderRadius: 16, overflow: 'hidden' },
  imagem: { height: ALTURA_IMAGEM, backgroundColor: cores.fundoSuave },
  curtidas: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
