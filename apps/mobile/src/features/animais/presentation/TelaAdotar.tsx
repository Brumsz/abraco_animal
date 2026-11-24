import type { AnimalResumo } from '@abraco/api-client';
import { Chip, cores, espaco, SkeletonLoader } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { PawPrintIcon } from 'phosphor-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAnimais } from '@/features/animais/data/hooks';
import { FILTROS_TIPO, TIPOS } from '@/features/animais/domain/rotulos';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';

import { CartaoAnimal } from './CartaoAnimal';

type Tipo = (typeof FILTROS_TIPO)[number];

/** Aba Adotar: filtros por espécie e grade com rolagem infinita. */
export default function TelaAdotar() {
  const router = useRouter();
  const espacoBarra = useEspacoBarra();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const consulta = useAnimais(tipo ? { tipo } : {});
  const animais = consulta.data?.pages.flatMap((p) => p.itens) ?? [];

  const abrir = (a: AnimalResumo) => {
    router.push({ pathname: '/animal/[id]', params: { id: a.id } });
  };
  const adotar = (a: AnimalResumo) => {
    router.push({ pathname: '/adocao/[animalId]', params: { animalId: a.id } });
  };

  const cabecalho = (
    <View>
      <CabecalhoTela titulo="Adotar" subtitulo="Encontre um novo melhor amigo." />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtros}
        accessibilityRole="radiogroup"
        accessibilityLabel="Filtrar por espécie"
      >
        <Chip
          variante="filtro"
          rotulo="Todos"
          selecionado={tipo === null}
          onPress={() => {
            setTipo(null);
          }}
        />
        {FILTROS_TIPO.map((t) => (
          <Chip
            key={t}
            variante="filtro"
            rotulo={TIPOS[t].plural}
            selecionado={tipo === t}
            onPress={() => {
              setTipo(t);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );

  let vazio;
  if (consulta.isPending) vazio = <GradeCarregando />;
  else if (consulta.isError)
    vazio = <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  else
    vazio = (
      <EstadoVazio
        icone={<PawPrintIcon size={48} color={cores.marca} />}
        titulo={
          tipo
            ? `Nenhum ${TIPOS[tipo].singular.toLowerCase()} esperando agora`
            : 'Nenhum animal esperando agora'
        }
        subtitulo="Novos amigos chegam sempre. Volte em breve!"
      />
    );

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <FlatList
        data={animais}
        keyExtractor={(a) => a.id}
        numColumns={2}
        ListHeaderComponent={cabecalho}
        ListEmptyComponent={vazio}
        columnWrapperStyle={styles.linha}
        contentContainerStyle={[styles.lista, { paddingBottom: espacoBarra }]}
        renderItem={({ item }) => (
          <View style={styles.coluna}>
            <CartaoAnimal
              animal={item}
              aoAbrir={() => {
                abrir(item);
              }}
              aoQuererAdotar={() => {
                adotar(item);
              }}
            />
          </View>
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (consulta.hasNextPage && !consulta.isFetchingNextPage) void consulta.fetchNextPage();
        }}
        ListFooterComponent={
          consulta.isFetchingNextPage ? (
            <ActivityIndicator color={cores.marca} style={styles.mais} />
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={consulta.isRefetching && !consulta.isFetchingNextPage}
            onRefresh={() => void consulta.refetch()}
            tintColor={cores.marca}
            colors={[cores.marca]}
          />
        }
      />
    </SafeAreaView>
  );
}

function GradeCarregando() {
  return (
    <View
      style={[styles.linha, styles.carregando]}
      accessible
      accessibilityLabel="Carregando animais"
    >
      {[0, 1].map((i) => (
        <View key={i} style={styles.coluna}>
          <SkeletonLoader altura={240} raio={22} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  lista: { gap: 14 },
  filtros: {
    paddingHorizontal: MARGEM_TELA,
    paddingTop: 18,
    paddingBottom: espaco.xs,
    gap: espaco.sm,
  },
  linha: { paddingHorizontal: MARGEM_TELA, gap: 14 },
  coluna: { flex: 1, maxWidth: '50%' },
  carregando: { flexDirection: 'row', paddingTop: espaco.lg },
  mais: { marginVertical: espaco.lg },
});
