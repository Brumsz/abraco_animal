import { cores, espaco, raio } from '@abraco/ui';
import { CaretRightIcon } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';

import bannerJornal from '../../../../assets/imagens/banners/banner-jornal.png';
import bannerProteger from '../../../../assets/imagens/banners/banner-proteger.png';
import bannerVerbos from '../../../../assets/imagens/banners/banner-verbos-do-amor.png';

export interface Banner {
  readonly id: string;
  readonly imagem: ImageSourcePropType;
  /** Texto do banner para leitores de tela (a arte é imagem). */
  readonly descricao: string;
  readonly destino: '/verbos-do-amor' | '/jornal' | null;
}

/** Os 3 banners do protótipo (Home - Carrossel 1, 2 e 3). */
export const BANNERS: readonly Banner[] = [
  {
    id: 'proteger',
    imagem: bannerProteger,
    descricao:
      'Amar os animais é agir para protegê-los. Cuidar do planeta também significa cuidar de seus seres.',
    destino: null,
  },
  {
    id: 'verbos',
    imagem: bannerVerbos,
    descricao: 'Verbos do Amor: formas de ajudar a ONG',
    destino: '/verbos-do-amor',
  },
  {
    id: 'jornal',
    imagem: bannerJornal,
    descricao: 'Jornal: sobre animais no Brasil',
    destino: '/jornal',
  },
];

const ALTURA = 250;
const MARGEM = 20;

export function Carrossel({ aoAbrir }: { readonly aoAbrir: (b: Banner) => void }) {
  const { width } = useWindowDimensions();
  const largura = width - MARGEM * 2;
  const lista = useRef<FlatList<Banner>>(null);
  const [atual, setAtual] = useState(0);

  const irPara = (i: number) => {
    lista.current?.scrollToIndex({ index: i, animated: true });
    setAtual(i);
  };

  return (
    <View style={styles.area}>
      <FlatList
        ref={lista}
        data={BANNERS}
        keyExtractor={(b) => b.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_d, i) => ({ length: largura, offset: largura * i, index: i })}
        onMomentumScrollEnd={(e) => {
          setAtual(Math.round(e.nativeEvent.contentOffset.x / largura));
        }}
        style={[styles.lista, { width: largura }]}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole={item.destino ? 'link' : 'image'}
            accessibilityLabel={`${item.descricao}. Banner ${String(index + 1)} de ${String(BANNERS.length)}`}
            disabled={!item.destino}
            onPress={() => {
              aoAbrir(item);
            }}
          >
            <Image
              source={item.imagem}
              style={{ width: largura, height: ALTURA }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        )}
      />
      <View style={styles.pontos} importantForAccessibility="no-hide-descendants">
        {BANNERS.map((b, i) => (
          <View key={b.id} style={[styles.ponto, i === atual ? styles.pontoAtivo : null]} />
        ))}
      </View>
      {atual < BANNERS.length - 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo banner"
          onPress={() => {
            irPara(atual + 1);
          }}
          style={styles.seta}
        >
          <CaretRightIcon size={22} color={cores.tinta} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    marginHorizontal: MARGEM,
    marginTop: 18,
    height: ALTURA,
    borderRadius: raio.lg + 4,
    overflow: 'hidden',
    backgroundColor: '#FFF4DE',
  },
  lista: { height: ALTURA },
  pontos: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(28,25,23,0.35)',
  },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  pontoAtivo: { width: 22, backgroundColor: cores.branco },
  seta: {
    position: 'absolute',
    right: -espaco.md,
    top: (ALTURA - 48) / 2,
    width: 44,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF4DE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: espaco.md,
  },
});
