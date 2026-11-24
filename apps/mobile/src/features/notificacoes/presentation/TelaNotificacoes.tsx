import type { Notificacao } from '@abraco/api-client';
import { Button, cores, espaco, raio, SkeletonLoader, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import {
  BellSimpleIcon,
  ChatCircleIcon,
  HandHeartIcon,
  HeartIcon,
  PawPrintIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import {
  useMarcarNotificacaoLida,
  useMarcarTodasLidas,
  useNotificacoes,
} from '@/features/notificacoes/data/hooks';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { tempoRelativo } from '@/shared/tempo';

const ICONES: Record<Notificacao['tipo'], typeof BellSimpleIcon> = {
  ADOCAO_APROVADA: PawPrintIcon,
  ADOCAO_RECUSADA: PawPrintIcon,
  ADOCAO_ANIMAL_ADOTADO: PawPrintIcon,
  DOACAO_ANIMAL_ATUALIZADA: HandHeartIcon,
  DOACAO_FINANCEIRA_CONFIRMADA: HeartIcon,
  VOLUNTARIADO_ATUALIZADO: UsersThreeIcon,
  CHAT_NOVA_MENSAGEM: ChatCircleIcon,
  GERAL: BellSimpleIcon,
};

/** Lista do sino (sem protótipo): toque marca como lida; mensagens abrem o chat. */
export default function TelaNotificacoes() {
  const router = useRouter();
  const consulta = useNotificacoes();
  const marcar = useMarcarNotificacaoLida();
  const marcarTodas = useMarcarTodasLidas();
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? [];
  const temNaoLidas = itens.some((n) => n.lidaEm === null);

  const abrir = (n: Notificacao) => {
    if (n.lidaEm === null) marcar.mutate(n.id);
    if (n.tipo === 'CHAT_NOVA_MENSAGEM') router.push('/chat');
  };

  let vazio;
  if (consulta.isPending) {
    vazio = (
      <View style={styles.carregando} accessible accessibilityLabel="Carregando notificações">
        {[0, 1, 2].map((i) => (
          <SkeletonLoader key={i} altura={76} raio={raio.lg} />
        ))}
      </View>
    );
  } else if (consulta.isError) {
    vazio = <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  } else {
    vazio = (
      <EstadoVazio
        icone={<BellSimpleIcon size={48} color={cores.marca} />}
        titulo="Nada por aqui"
        subtitulo="Respostas de adoção, doações e mensagens da ONG aparecem aqui."
      />
    );
  }

  return (
    <TelaComVoltar>
      <FlatList
        data={itens}
        keyExtractor={(n) => n.id}
        ListHeaderComponent={
          <View>
            <CabecalhoTela titulo="Notificações" />
            {temNaoLidas ? (
              <View style={styles.acoes}>
                <Button
                  titulo="Marcar todas como lidas"
                  variante="ghost"
                  tamanho="sm"
                  carregando={marcarTodas.isPending}
                  onPress={() => {
                    marcarTodas.mutate();
                  }}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={vazio}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <ItemNotificacao
            notificacao={item}
            aoTocar={() => {
              abrir(item);
            }}
          />
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
    </TelaComVoltar>
  );
}

function ItemNotificacao({
  notificacao: n,
  aoTocar,
}: {
  readonly notificacao: Notificacao;
  readonly aoTocar: () => void;
}) {
  const Icone = ICONES[n.tipo];
  const naoLida = n.lidaEm === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${naoLida ? 'Não lida. ' : ''}${n.titulo}. ${n.corpo}. ${tempoRelativo(n.criadoEm)}`}
      onPress={aoTocar}
      style={({ pressed }) => [
        styles.item,
        naoLida ? styles.itemNaoLido : null,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.icone}>
        <Icone size={20} color={cores.marca} />
      </View>
      <View style={styles.textos}>
        <Texto variante="label" cor={cores.tinta}>
          {n.titulo}
        </Texto>
        <Texto variante="body2" cor={cores.tintaCorpo}>
          {n.corpo}
        </Texto>
        <Texto variante="caption" cor={cores.tintaSuave}>
          {tempoRelativo(n.criadoEm)}
        </Texto>
      </View>
      {naoLida ? <View style={styles.ponto} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lista: { paddingBottom: espaco.xl, gap: 10 },
  acoes: { paddingHorizontal: MARGEM_TELA, alignItems: 'flex-end', paddingTop: espaco.sm },
  carregando: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.lg, gap: 10 },
  item: {
    marginHorizontal: MARGEM_TELA,
    flexDirection: 'row',
    gap: espaco.md,
    padding: espaco.lg,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  itemNaoLido: { borderColor: cores.marcaClaraForte, backgroundColor: '#FFFAF6' },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1, gap: 2 },
  ponto: { width: 10, height: 10, borderRadius: 5, backgroundColor: cores.marca, marginTop: 4 },
  mais: { marginVertical: espaco.lg },
});
