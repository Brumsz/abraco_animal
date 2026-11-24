import type { AnimalResumo } from '@abraco/api-client';
import { cores, espaco, fontes, sombraSuave, Texto } from '@abraco/ui';
import { PawPrintIcon } from 'phosphor-react-native';
import { Image, Pressable, StyleSheet, View } from 'react-native';

/** Cartão da grade do Adotar (protótipo "Adotar - Lista"). */
export function CartaoAnimal({
  animal,
  aoAbrir,
  aoQuererAdotar,
}: {
  readonly animal: AnimalResumo;
  readonly aoAbrir: () => void;
  readonly aoQuererAdotar: () => void;
}) {
  return (
    <View style={styles.cartao}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${animal.nome}, ${animal.raca}. Ver detalhes`}
        onPress={aoAbrir}
        style={({ pressed }) => [styles.topo, { opacity: pressed ? 0.85 : 1 }]}
      >
        <FotoAnimal url={animal.fotoCapa?.url ?? null} altura={148} raio={16} />
        <View style={styles.textos}>
          <Texto variante="h3" numberOfLines={1}>
            {animal.nome}
          </Texto>
          <Texto variante="caption" cor={cores.tintaSuave} numberOfLines={1}>
            {animal.raca}
          </Texto>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Quero adotar ${animal.nome}`}
        onPress={aoQuererAdotar}
        style={({ pressed }) => [
          styles.botao,
          { backgroundColor: pressed ? cores.marcaClaraForte : cores.marcaClara },
        ]}
      >
        <Texto variante="label" cor={cores.marcaEscura} style={styles.textoBotao}>
          Quero adotar
        </Texto>
      </Pressable>
    </View>
  );
}

/** Foto do animal ou, sem foto, um quadro com a patinha (nunca espaço vazio). */
export function FotoAnimal({
  url,
  altura,
  raio: r,
}: {
  readonly url: string | null;
  readonly altura: number;
  readonly raio: number;
}) {
  if (!url) {
    return (
      <View style={[styles.semFoto, { height: altura, borderRadius: r }]}>
        <PawPrintIcon size={40} color={cores.marca} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ height: altura, borderRadius: r, backgroundColor: cores.fundoSuave }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  cartao: {
    flex: 1,
    backgroundColor: cores.superficie,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: cores.linha,
    paddingTop: 6,
    paddingHorizontal: 6,
    paddingBottom: 14,
    gap: espaco.sm + 2,
    ...sombraSuave,
  },
  topo: { gap: espaco.sm + 2 },
  textos: { paddingHorizontal: espaco.sm, gap: 2 },
  botao: {
    height: 40,
    marginHorizontal: espaco.sm,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoBotao: { fontFamily: fontes.interSemiBold, fontWeight: '700' },
  semFoto: {
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
