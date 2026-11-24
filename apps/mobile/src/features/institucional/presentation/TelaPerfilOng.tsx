import type { PerguntaFaq } from '@abraco/api-client';
import { BotaoVoltar, Chip, cores, espaco, fontes, raio, SkeletonLoader, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { CaretDownIcon, CaretRightIcon, InstagramLogoIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONFIG } from '@/core/config';
import { TextoMarkdown } from '@/features/noticias/presentation/TextoMarkdown';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { FundoMarca } from '@/shared/componentes/FundoMarca';
import { estiloChips } from '@/shared/componentes/GrupoEscolha';
import { Logo } from '@/shared/componentes/Logo';

import { useFaq, usePerfilOng } from '../data/hooks';

const ABAS = [
  { chave: 'SOBRE_NOS', rotulo: 'Sobre nós' },
  { chave: 'FUNDACAO', rotulo: 'Fundação' },
  { chave: 'FUNDADORES', rotulo: 'Fundadores' },
  { chave: 'DUVIDAS', rotulo: 'Dúvidas' },
] as const;
type Aba = (typeof ABAS)[number]['chave'];

/** Protótipos "Perfil ONG" (Sobre nós, Fundação, Fundadores e Dúvidas). */
export default function TelaPerfilOng() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [aba, setAba] = useState<Aba>('SOBRE_NOS');

  return (
    <SafeAreaView style={styles.tela} edges={['bottom']}>
      <FundoMarca style={[styles.cabecalho, { paddingTop: insets.top + espaco.sm }]}>
        <BotaoVoltar
          tema="claro"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/inicio');
          }}
        />
        <View style={styles.marca}>
          <View importantForAccessibility="no-hide-descendants">
            <Logo largura={64} />
          </View>
          <View style={styles.nome}>
            <Texto variante="h1" cor={cores.branco} accessibilityRole="header">
              Abraço Animal
            </Texto>
            <Texto variante="body2" cor={cores.branco}>
              Resgate de cavalos
            </Texto>
          </View>
        </View>
      </FundoMarca>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[estiloChips.linha, styles.abas]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Seções"
      >
        {ABAS.map((a) => (
          <Chip
            key={a.chave}
            rotulo={a.rotulo}
            selecionado={aba === a.chave}
            onPress={() => {
              setAba(a.chave);
            }}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.conteudo}>
        {aba === 'DUVIDAS' ? <Duvidas /> : <Secao secao={aba} />}
      </ScrollView>

      {CONFIG.instagramUrl ? <Instagram url={CONFIG.instagramUrl} /> : null}
    </SafeAreaView>
  );
}

function Carregando() {
  return (
    <View style={styles.carregando} accessible accessibilityLabel="Carregando">
      <SkeletonLoader altura={28} raio={8} />
      <SkeletonLoader altura={96} raio={8} />
    </View>
  );
}

function Secao({ secao }: { readonly secao: Exclude<Aba, 'DUVIDAS'> }) {
  const perfil = usePerfilOng();
  if (perfil.isPending) return <Carregando />;
  if (perfil.isError) {
    return <EstadoErro erro={perfil.error} aoTentarDeNovo={() => void perfil.refetch()} />;
  }
  const s = perfil.data.find((x) => x.secao === secao);
  const rotulo = ABAS.find((a) => a.chave === secao)?.rotulo ?? '';
  return (
    <View style={styles.secao}>
      <Texto variante="h2" accessibilityRole="header">
        {s?.titulo ?? rotulo}
      </Texto>
      {s ? (
        <TextoMarkdown conteudo={s.conteudo} />
      ) : (
        <Texto variante="body1" cor={cores.tintaSuave}>
          Em breve a ONG conta mais por aqui.
        </Texto>
      )}
    </View>
  );
}

function Duvidas() {
  const faq = useFaq();
  if (faq.isPending) return <Carregando />;
  if (faq.isError) {
    return <EstadoErro erro={faq.error} aoTentarDeNovo={() => void faq.refetch()} />;
  }
  return (
    <View style={styles.secao}>
      <Texto variante="h2" accessibilityRole="header">
        Dúvidas
      </Texto>
      {faq.data.length === 0 ? (
        <Texto variante="body1" cor={cores.tintaSuave}>
          Ainda não há perguntas por aqui. Fale com a ONG pelo chat.
        </Texto>
      ) : (
        faq.data.map((p) => <Pergunta key={p.id} pergunta={p} />)
      )}
    </View>
  );
}

function Pergunta({ pergunta: p }: { readonly pergunta: PerguntaFaq }) {
  const [aberta, setAberta] = useState(false);
  return (
    <View style={styles.pergunta}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: aberta }}
        accessibilityLabel={p.pergunta}
        onPress={() => {
          setAberta((v) => !v);
        }}
        style={styles.cabecalhoPergunta}
      >
        <Texto variante="body1" style={styles.textoPergunta}>
          {p.pergunta}
        </Texto>
        <CaretDownIcon
          size={18}
          color={cores.tintaSuave}
          style={{ transform: [{ rotate: aberta ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {aberta ? (
        <Texto variante="body2" cor={cores.tintaCorpo} style={styles.resposta}>
          {p.resposta}
        </Texto>
      ) : null}
    </View>
  );
}

function Instagram({ url }: { readonly url: string }) {
  return (
    <View style={styles.rodape}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Nos siga no Instagram"
        onPress={() => void Linking.openURL(url)}
        style={({ pressed }) => [styles.instagram, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={styles.circulo}>
          <InstagramLogoIcon size={20} color={cores.marca} />
        </View>
        <Texto variante="body1" style={styles.textoInstagram}>
          Nos siga no Instagram
        </Texto>
        <CaretRightIcon size={18} color={cores.tintaSuave} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  cabecalho: { paddingHorizontal: MARGEM_TELA, paddingBottom: espaco.xl, gap: espaco.lg },
  marca: { flexDirection: 'row', alignItems: 'center', gap: espaco.lg },
  nome: { flex: 1 },
  abas: { paddingHorizontal: MARGEM_TELA, paddingVertical: espaco.lg },
  conteudo: { paddingHorizontal: MARGEM_TELA, paddingBottom: espaco.xl },
  carregando: { gap: espaco.md },
  secao: { gap: espaco.md },
  pergunta: {
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  cabecalhoPergunta: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
  },
  textoPergunta: { flex: 1, fontFamily: fontes.interSemiBold },
  resposta: { paddingHorizontal: espaco.lg, paddingBottom: espaco.lg },
  rodape: { paddingHorizontal: MARGEM_TELA, paddingVertical: espaco.md },
  instagram: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    padding: espaco.lg,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  circulo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoInstagram: { flex: 1, fontFamily: fontes.interSemiBold },
});
