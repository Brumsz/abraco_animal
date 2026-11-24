import type { Noticia } from '@abraco/api-client';
import { cores, espaco, raio, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { NewspaperIcon } from 'phosphor-react-native';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { dataCurta } from '@/shared/tempo';

import { useNoticias } from '../data/hooks';

/** Protótipo "Jornal": notícias e causas que movem a ONG. */
export default function TelaJornal() {
  const router = useRouter();
  const noticias = useNoticias();
  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={noticias}
        rotuloCarregando="Carregando notícias"
        cabecalho={
          <View style={styles.cabecalho}>
            <CabecalhoTela titulo="Jornal" subtitulo="Notícias e causas que movem a ONG." />
          </View>
        }
        vazio={
          <EstadoVazio
            icone={<NewspaperIcon size={48} color={cores.marca} />}
            titulo="Nenhuma notícia ainda"
            subtitulo="As novidades da causa animal aparecem aqui."
          />
        }
        renderizar={(n) => (
          <CartaoNoticia
            noticia={n}
            aoAbrir={() => {
              router.push({ pathname: '/jornal/[slug]', params: { slug: n.slug } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

function CartaoNoticia({
  noticia: n,
  aoAbrir,
}: {
  readonly noticia: Noticia;
  readonly aoAbrir: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${n.titulo}. ${dataCurta(n.criadoEm)}`}
      onPress={aoAbrir}
      style={({ pressed }) => [styles.cartao, { opacity: pressed ? 0.85 : 1 }]}
    >
      {n.imagem ? (
        <Image source={{ uri: n.imagem }} style={styles.imagem} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.imagem, styles.semImagem]}>
          <NewspaperIcon size={32} color={cores.marca} />
        </View>
      )}
      <View style={styles.textos}>
        <Texto variante="caption" cor={cores.tintaSuave}>
          {dataCurta(n.criadoEm)}
        </Texto>
        <Texto variante="h3" numberOfLines={4} style={styles.titulo}>
          {n.titulo}
        </Texto>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cabecalho: { marginBottom: espaco.lg },
  cartao: {
    flexDirection: 'row',
    gap: espaco.md,
    padding: espaco.md,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  imagem: { width: 110, height: 100, borderRadius: raio.md, backgroundColor: cores.fundoSuave },
  semImagem: { alignItems: 'center', justifyContent: 'center', backgroundColor: cores.marcaClara },
  textos: { flex: 1, gap: espaco.xs },
  titulo: { fontSize: 15, lineHeight: 21 },
});
