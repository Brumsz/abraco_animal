import type { Post } from '@abraco/api-client';
import { cores, espaco, fontes, SkeletonLoader, Texto, useToast } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { BellIcon, NewspaperIcon } from 'phosphor-react-native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessao } from '@/core/sessao';
import { useCurtir, usePosts } from '@/features/feed/data/hooks';
import { CartaoPost } from '@/features/feed/presentation/CartaoPost';
import { useNaoLidas } from '@/features/notificacoes/data/hooks';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';
import { Logo } from '@/shared/componentes/Logo';
import { mensagemDeErro } from '@/shared/erros';

import { Carrossel } from './Carrossel';

/** Protótipo "Home": saudação, sino, carrossel e o feed "Laços & Abraços". */
export default function TelaInicio() {
  const router = useRouter();
  const toast = useToast();
  const espacoBarra = useEspacoBarra();
  const posts = usePosts();
  const curtir = useCurtir();
  const itens = posts.data?.pages.flatMap((p) => p.itens) ?? [];

  const aoCurtir = (post: Post, valor: boolean) => {
    curtir.mutate(
      { id: post.id, curtir: valor },
      {
        onError: (e) => {
          toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
        },
      },
    );
  };

  let vazio;
  if (posts.isPending) {
    vazio = (
      <View style={styles.carregando} accessible accessibilityLabel="Carregando publicações">
        <SkeletonLoader altura={300} raio={24} />
      </View>
    );
  } else if (posts.isError) {
    vazio = <EstadoErro erro={posts.error} aoTentarDeNovo={() => void posts.refetch()} />;
  } else {
    vazio = (
      <EstadoVazio
        icone={<NewspaperIcon size={48} color={cores.marca} />}
        titulo="Nenhuma publicação ainda"
        subtitulo="As novidades dos resgatados aparecem aqui."
      />
    );
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <FlatList
        data={itens}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View>
            <BarraTopo
              aoAbrirNotificacoes={() => {
                router.push('/notificacoes');
              }}
            />
            <Carrossel
              aoAbrir={(b) => {
                if (b.destino) router.push(b.destino);
              }}
            />
            <Texto variante="h2" accessibilityRole="header" style={styles.secao}>
              Laços &amp; Abraços
            </Texto>
          </View>
        }
        ListEmptyComponent={vazio}
        renderItem={({ item }) => (
          <View style={styles.post}>
            <CartaoPost
              post={item}
              aoCurtir={(valor) => {
                aoCurtir(item, valor);
              }}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: espacoBarra }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
        ListFooterComponent={
          posts.isFetchingNextPage ? (
            <ActivityIndicator color={cores.marca} style={styles.mais} />
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={posts.isRefetching && !posts.isFetchingNextPage}
            onRefresh={() => void posts.refetch()}
            tintColor={cores.marca}
            colors={[cores.marca]}
          />
        }
      />
    </SafeAreaView>
  );
}

function BarraTopo({ aoAbrirNotificacoes }: { readonly aoAbrirNotificacoes: () => void }) {
  const nome = useSessao((s) => s.usuario?.nome.split(' ')[0] ?? '');
  const naoLidas = useNaoLidas().data?.total ?? 0;
  return (
    <View style={styles.topo}>
      <View style={styles.avatar} importantForAccessibility="no-hide-descendants">
        <Logo largura={24} />
      </View>
      <View style={styles.saudacao}>
        <Texto variante="label" cor={cores.tintaSuave} style={styles.ola}>
          {nome ? `Olá, ${nome}!` : 'Olá, bem-vindo(a)'}
        </Texto>
        <Texto variante="h3" style={styles.ong}>
          ONG Abraço Animal
        </Texto>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          naoLidas > 0 ? `Notificações, ${String(naoLidas)} não lidas` : 'Notificações'
        }
        onPress={aoAbrirNotificacoes}
        style={({ pressed }) => [styles.sino, { opacity: pressed ? 0.7 : 1 }]}
      >
        <BellIcon size={22} color={cores.tintaCorpo} />
        {naoLidas > 0 ? (
          <View style={styles.contador}>
            <Texto variante="caption" cor={cores.branco} style={styles.textoContador}>
              {naoLidas > 9 ? '9+' : naoLidas}
            </Texto>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: MARGEM_TELA,
    paddingTop: espaco.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cores.marcaDestaque,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  saudacao: { flex: 1 },
  ola: { fontFamily: fontes.interRegular },
  ong: { fontFamily: fontes.displaySemiBold, fontSize: 16 },
  sino: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contador: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: cores.erro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoContador: { fontFamily: fontes.interSemiBold, fontSize: 10, lineHeight: 12 },
  secao: { paddingHorizontal: MARGEM_TELA, marginTop: espaco.xl, marginBottom: espaco.lg },
  post: { paddingHorizontal: MARGEM_TELA, marginBottom: 14 },
  carregando: { paddingHorizontal: MARGEM_TELA },
  mais: { marginVertical: espaco.lg },
});
