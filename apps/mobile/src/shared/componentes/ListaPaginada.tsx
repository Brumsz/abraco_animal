import { cores, espaco, SkeletonLoader } from '@abraco/ui';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { MARGEM_TELA } from './CabecalhoTela';
import { EstadoErro } from './EstadoTela';

/**
 * Lista com rolagem infinita (páginas `{ itens, proximoCursor }`): carregando,
 * erro com "Tentar de novo", vazio, puxar para atualizar e "carregar mais".
 */
export function ListaPaginada<T extends { id: string }>({
  consulta,
  renderizar,
  cabecalho,
  vazio,
  rotuloCarregando,
  espacoFinal = espaco.xxl,
  filtrar,
}: {
  readonly consulta: UseInfiniteQueryResult<InfiniteData<{ itens: T[] }>>;
  readonly renderizar: (item: T) => ReactElement;
  readonly cabecalho?: ReactElement;
  readonly vazio: ReactNode;
  readonly rotuloCarregando: string;
  readonly espacoFinal?: number;
  /** Filtro local sobre o que já carregou (ex.: busca por nome sem rota de busca na API). */
  readonly filtrar?: (item: T) => boolean;
}) {
  const todos = consulta.data?.pages.flatMap((p) => p.itens) ?? [];
  const itens = filtrar ? todos.filter(filtrar) : todos;

  let semItens: ReactNode;
  if (consulta.isPending) {
    semItens = (
      <View style={styles.carregando} accessible accessibilityLabel={rotuloCarregando}>
        <SkeletonLoader altura={96} raio={20} />
        <SkeletonLoader altura={96} raio={20} />
      </View>
    );
  } else if (consulta.isError) {
    semItens = <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  } else {
    semItens = vazio;
  }

  return (
    <FlatList
      data={itens}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={cabecalho}
      ListEmptyComponent={<>{semItens}</>}
      renderItem={({ item }) => <View style={styles.item}>{renderizar(item)}</View>}
      contentContainerStyle={{ paddingBottom: espacoFinal }}
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
  );
}

const styles = StyleSheet.create({
  item: { paddingHorizontal: MARGEM_TELA, marginBottom: espaco.md },
  carregando: { paddingHorizontal: MARGEM_TELA, gap: espaco.md },
  mais: { marginVertical: espaco.lg },
});
