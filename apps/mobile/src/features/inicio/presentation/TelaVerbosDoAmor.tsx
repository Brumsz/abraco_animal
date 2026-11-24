import {
  BottomSheet,
  Button,
  cores,
  espaco,
  fontes,
  sombraSuave,
  Texto,
  useToast,
} from '@abraco/ui';
import { useRouter } from 'expo-router';
import { HeartIcon, PawPrintIcon } from 'phosphor-react-native';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';

import fotoAdotar from '../../../../assets/imagens/verbos/adotar.jpg';
import fotoApadrinhar from '../../../../assets/imagens/verbos/apadrinhar.jpg';
import fotoDoar from '../../../../assets/imagens/verbos/doar.jpg';
import fotoVoluntariar from '../../../../assets/imagens/verbos/voluntariar.jpg';

type Verbo = 'adotar' | 'doar' | 'voluntariar' | 'apadrinhar';

const CARTOES: readonly {
  id: Verbo;
  titulo: string;
  texto: string;
  foto: ImageSourcePropType;
}[] = [
  {
    id: 'adotar',
    titulo: 'Adotar',
    texto: 'Adote um amigo e transforme sua vida.',
    foto: fotoAdotar,
  },
  {
    id: 'doar',
    titulo: 'Doar',
    texto: 'Ajude a transformar vidas: doe para nossa ONG.',
    foto: fotoDoar,
  },
  {
    id: 'voluntariar',
    titulo: 'Voluntariar',
    texto: 'Venha fazer a diferença com a gente.',
    foto: fotoVoluntariar,
  },
  {
    id: 'apadrinhar',
    titulo: 'Apadrinhar',
    texto: 'Apadrinhe um amigo e ajude a ONG.',
    foto: fotoApadrinhar,
  },
];

/** Protótipo "Verbos do Amor": as 4 formas de ajudar. "Doar" oferece Pix ou doar um animal. */
export default function TelaVerbosDoAmor() {
  const router = useRouter();
  const toast = useToast();
  const [escolherDoacao, setEscolherDoacao] = useState(false);

  const abrir = (v: Verbo) => {
    if (v === 'adotar') router.push('/adotar');
    else if (v === 'doar') setEscolherDoacao(true);
    else if (v === 'voluntariar') router.push('/voluntariar');
    else {
      router.push('/adotar');
      toast.mostrar({ mensagem: 'Escolha um animal e toque em "Apadrinhar".' });
    }
  };

  const linhas = [CARTOES.slice(0, 2), CARTOES.slice(2, 4)];

  return (
    <TelaComVoltar>
      <ScrollView contentContainerStyle={styles.rolagem}>
        <CabecalhoTela
          titulo="Verbos do Amor"
          subtitulo="Escolha como você quer fazer a diferença."
        />
        <View style={styles.grade}>
          {linhas.map((linha) => (
            <View key={linha[0]?.id} style={styles.linha}>
              {linha.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.titulo}. ${c.texto}`}
                  onPress={() => {
                    abrir(c.id);
                  }}
                  style={({ pressed }) => [styles.cartao, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <Image
                    source={c.foto}
                    style={styles.foto}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                  <View style={styles.textos}>
                    <Texto variante="h2" style={styles.titulo}>
                      {c.titulo}
                    </Texto>
                    <Texto variante="caption" cor={cores.tintaSuave} style={styles.texto}>
                      {c.texto}
                    </Texto>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <BottomSheet
        visivel={escolherDoacao}
        aoFechar={() => {
          setEscolherDoacao(false);
        }}
        titulo="Como você quer doar?"
      >
        <Button
          titulo="Doar com Pix"
          icone={<HeartIcon size={20} color={cores.branco} weight="fill" />}
          onPress={() => {
            setEscolherDoacao(false);
            router.push('/doar');
          }}
          larguraTotal
        />
        <Button
          titulo="Doar um animal"
          variante="contorno"
          icone={<PawPrintIcon size={20} color={cores.tinta} />}
          onPress={() => {
            setEscolherDoacao(false);
            router.push('/doar-animal');
          }}
          larguraTotal
        />
        <Texto variante="caption" cor={cores.tintaSuave} alinhamento="center">
          Doar um animal: a equipe analisa e combina a retirada com você.
        </Texto>
      </BottomSheet>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  rolagem: { paddingBottom: espaco.xl },
  grade: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: 14 },
  linha: { flexDirection: 'row', gap: 14 },
  cartao: {
    flex: 1,
    minHeight: 280,
    backgroundColor: cores.superficie,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: cores.linha,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 14,
    gap: 10,
    ...sombraSuave,
  },
  foto: { height: 150, width: '100%', borderRadius: 18 },
  textos: { paddingHorizontal: 4, gap: 2 },
  titulo: { fontFamily: fontes.displayExtra, lineHeight: 26 },
  texto: { lineHeight: 17 },
});
