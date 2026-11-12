import { Button, cores, espaco, gradienteLaranja, Texto } from '@abraco/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { marcarOnboardingConcluido } from '@/core/preferencias';

import { SLIDES, type Slide } from './slides';

export default function TelaOnboarding() {
  const router = useRouter();
  const { width: largura } = useWindowDimensions();
  const lista = useRef<FlatList<Slide>>(null);
  const deslocamento = useSharedValue(0);
  const [indice, setIndice] = useState(0);
  const ultimo = indice === SLIDES.length - 1;

  const aoRolar = useAnimatedScrollHandler((evento) => {
    deslocamento.set(evento.contentOffset.x);
  });

  const aoTerminarRolagem = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndice(Math.round(e.nativeEvent.contentOffset.x / largura));
  };

  const concluir = async () => {
    await marcarOnboardingConcluido();
    router.replace('/login');
  };

  const avancar = () => {
    if (ultimo) {
      void concluir();
      return;
    }
    const proximo = indice + 1;
    lista.current?.scrollToIndex({ index: proximo, animated: true });
    setIndice(proximo);
  };

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.barraTopo}>
        {ultimo ? null : (
          <Button titulo="Pular" variante="ghost" tamanho="sm" onPress={() => void concluir()} />
        )}
      </View>

      <Animated.FlatList
        ref={lista}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={aoRolar}
        scrollEventThrottle={16}
        onMomentumScrollEnd={aoTerminarRolagem}
        getItemLayout={(_, i) => ({ length: largura, offset: largura * i, index: i })}
        renderItem={({ item, index }) => (
          <ItemSlide slide={item} largura={largura} posicao={index + 1} />
        )}
      />

      <View style={styles.rodape}>
        <View
          style={styles.indicadores}
          accessibilityLabel={`Página ${indice + 1} de ${SLIDES.length}`}
        >
          {SLIDES.map((s, i) => (
            <Indicador key={s.id} indice={i} largura={largura} deslocamento={deslocamento} />
          ))}
        </View>
        <Button
          titulo={ultimo ? 'Começar' : 'Próximo'}
          tamanho="lg"
          larguraTotal
          onPress={avancar}
        />
      </View>
    </SafeAreaView>
  );
}

function ItemSlide({
  slide,
  largura,
  posicao,
}: {
  readonly slide: Slide;
  readonly largura: number;
  readonly posicao: number;
}) {
  const { Icone } = slide;
  const lado = Math.min(largura - espaco.xxxl * 2, 300);

  return (
    <View
      style={[styles.slide, { width: largura }]}
      accessible
      accessibilityLabel={`${slide.titulo}. ${slide.texto}. Página ${posicao} de ${SLIDES.length}`}
    >
      {/* Ilustração provisória — trocar pelas fotos da ONG (proporção 4:3) */}
      <LinearGradient
        colors={gradienteLaranja}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.ilustracao, { width: lado, height: lado * 0.75 }]}
      >
        <Icone size={lado * 0.4} color={cores.creme} weight="duotone" />
      </LinearGradient>

      <View style={styles.textos}>
        <Texto variante="h1" cor={cores.marromTexto} alinhamento="center">
          {slide.titulo}
        </Texto>
        <Texto variante="body1" cor={cores.neutro600} alinhamento="center">
          {slide.texto}
        </Texto>
      </View>
    </View>
  );
}

function Indicador({
  indice,
  largura,
  deslocamento,
}: {
  readonly indice: number;
  readonly largura: number;
  readonly deslocamento: SharedValue<number>;
}) {
  const estilo = useAnimatedStyle(() => {
    const entrada = [(indice - 1) * largura, indice * largura, (indice + 1) * largura];
    return {
      width: interpolate(deslocamento.get(), entrada, [8, 24, 8], 'clamp'),
      opacity: interpolate(deslocamento.get(), entrada, [0.35, 1, 0.35], 'clamp'),
    };
  });
  return <Animated.View style={[styles.ponto, estilo]} />;
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.creme },
  barraTopo: {
    height: 52,
    paddingHorizontal: espaco.lg,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaco.xxl,
    gap: espaco.xxl,
  },
  ilustracao: {
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { gap: espaco.md },
  rodape: { paddingHorizontal: espaco.xl, paddingBottom: espaco.lg, gap: espaco.xl },
  indicadores: { flexDirection: 'row', justifyContent: 'center', gap: espaco.sm },
  ponto: { height: 8, borderRadius: 4, backgroundColor: cores.laranjaTexto },
});
