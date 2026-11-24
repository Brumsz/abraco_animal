import type { Dashboard } from '@abraco/api-client';
import {
  Button,
  cores,
  espaco,
  fontes,
  raio,
  SkeletonLoader,
  sombraSuave,
  Texto,
} from '@abraco/ui';
import { useRouter } from 'expo-router';
import {
  CaretRightIcon,
  ChatCircleDotsIcon,
  HandHeartIcon,
  HeartIcon,
  type Icon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { centavosDaApi, formatarReais } from '@/features/pix/domain/valores';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { ListaOpcoes } from '@/shared/componentes/ListaOpcoes';
import { dataCurta } from '@/shared/tempo';

import { usePainel } from '../data/hooks';
import { barrasPorMes, rotaPendencia, TIPO_PENDENCIA } from '../domain/painel';

/**
 * Protótipo "Central" (aba do admin) com os números da spec: adoções e doações
 * pendentes, animais disponíveis, Pix do mês, gráfico de 6 meses e últimas pendências.
 */
export default function TelaCentral() {
  const router = useRouter();
  const espacoBarra = useEspacoBarra();
  const painel = usePainel();

  let corpo: ReactNode;
  if (painel.isPending) {
    corpo = (
      <View style={styles.blocos} accessible accessibilityLabel="Carregando a Central">
        <SkeletonLoader altura={220} raio={24} />
        <SkeletonLoader altura={220} raio={24} />
      </View>
    );
  } else if (painel.isError) {
    corpo = <EstadoErro erro={painel.error} aoTentarDeNovo={() => void painel.refetch()} />;
  } else {
    const d = painel.data;
    corpo = (
      <View style={styles.blocos}>
        <Cartao Icone={HeartIcon} titulo="Solicitações de adoção">
          <View style={styles.indicadores}>
            <Indicador valor={String(d.adocoesPendentes)} rotulo="Pendentes" tom="aviso" />
            <Indicador
              valor={String(d.animaisDisponiveis)}
              rotulo="Animais disponíveis"
              tom="sucesso"
            />
          </View>
          <Button
            titulo="Ver solicitações"
            onPress={() => {
              router.push('/admin/adocoes');
            }}
            larguraTotal
          />
        </Cartao>

        <Cartao Icone={HandHeartIcon} titulo="Doações">
          <View style={styles.indicadores}>
            <Indicador
              valor={String(d.doacoesAnimaisPendentes)}
              rotulo="Animais para analisar"
              tom="aviso"
            />
            <Indicador
              valor={formatarReais(centavosDaApi(d.doacoesFinanceirasMes.total))}
              rotulo={`Pix no mês (${String(d.doacoesFinanceirasMes.quantidade)})`}
              tom="info"
            />
          </View>
          <Button
            titulo="Ver doações de animais"
            variante="secundario"
            onPress={() => {
              router.push('/admin/doacoes-animais');
            }}
            larguraTotal
          />
        </Cartao>

        <Grafico meses={d.adocoesPorMes} />
        <Pendencias itens={d.ultimasPendencias} />

        <ListaOpcoes
          titulo="Gestão"
          opcoes={[
            {
              rotulo: 'Voluntários',
              Icone: UsersThreeIcon,
              iconeEmCirculo: true,
              aoPressionar: () => {
                router.push('/admin/voluntarios');
              },
            },
            {
              rotulo: 'Atendimento',
              Icone: ChatCircleDotsIcon,
              iconeEmCirculo: true,
              aoPressionar: () => {
                router.navigate('/chat');
              },
            },
          ]}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: espacoBarra }}>
        <CabecalhoTela titulo="Central" subtitulo="Acompanhe as solicitações da ONG." />
        {corpo}
      </ScrollView>
    </SafeAreaView>
  );
}

function Cartao({
  Icone,
  titulo,
  children,
}: {
  readonly Icone: Icon;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.cartao}>
      <View style={styles.cartaoTopo}>
        <View style={styles.circulo}>
          <Icone size={22} color={cores.marca} />
        </View>
        <Texto variante="h3" accessibilityRole="header" style={styles.flex}>
          {titulo}
        </Texto>
      </View>
      {children}
    </View>
  );
}

const TONS = {
  aviso: { fundo: cores.avisoFundo, texto: cores.avisoTexto },
  sucesso: { fundo: cores.sucessoFundo, texto: cores.sucessoTexto },
  info: { fundo: cores.infoFundo, texto: cores.infoTexto },
} as const;

/** Quadrado colorido do protótipo: número grande e rótulo. */
function Indicador({
  valor,
  rotulo,
  tom,
}: {
  readonly valor: string;
  readonly rotulo: string;
  readonly tom: keyof typeof TONS;
}) {
  const c = TONS[tom];
  return (
    <View
      style={[styles.indicador, { backgroundColor: c.fundo }]}
      accessible
      accessibilityLabel={`${valor} ${rotulo}`}
    >
      <Texto
        variante="h1"
        cor={c.texto}
        style={styles.numero}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {valor}
      </Texto>
      <Texto variante="caption" cor={c.texto} style={styles.rotuloIndicador}>
        {rotulo}
      </Texto>
    </View>
  );
}

const ALTURA_GRAFICO = 96;

/** "Adoções por mês" (6 meses): barras simples, sem biblioteca de gráficos. */
function Grafico({ meses }: { readonly meses: Dashboard['adocoesPorMes'] }) {
  const barras = barrasPorMes(meses);
  const resumo = barras.map((b) => `${b.rotulo} ${String(b.total)}`).join(', ');
  return (
    <View style={styles.cartao}>
      <Texto variante="h3" accessibilityRole="header">
        Adoções por mês
      </Texto>
      <View
        style={styles.grafico}
        accessible
        accessibilityLabel={`Adoções aprovadas nos últimos 6 meses: ${resumo}`}
      >
        {barras.map((b, i) => (
          <View key={b.mes} style={styles.coluna}>
            <Texto variante="caption" cor={cores.tintaCorpo}>
              {String(b.total)}
            </Texto>
            <View
              style={[
                styles.barra,
                {
                  height: Math.max(4, b.proporcao * ALTURA_GRAFICO),
                  backgroundColor: i === barras.length - 1 ? cores.marca : cores.marcaClaraForte,
                },
              ]}
            />
            <Texto variante="caption" cor={cores.tintaSuave}>
              {b.rotulo}
            </Texto>
          </View>
        ))}
      </View>
    </View>
  );
}

function Pendencias({ itens }: { readonly itens: Dashboard['ultimasPendencias'] }) {
  const router = useRouter();
  return (
    <View style={styles.cartao}>
      <Texto variante="h3" accessibilityRole="header">
        Últimas pendências
      </Texto>
      {itens.length === 0 ? (
        <Texto variante="body2" cor={cores.tintaSuave}>
          Nada esperando análise. Tudo em dia!
        </Texto>
      ) : (
        itens.map((p, i) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`${TIPO_PENDENCIA[p.tipo]}: ${p.titulo}, ${dataCurta(p.criadoEm)}`}
            onPress={() => {
              router.push(rotaPendencia(p));
            }}
            style={({ pressed }) => [
              styles.pendencia,
              i > 0 && styles.divisor,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.flex}>
              <Texto variante="caption" cor={cores.marcaEscura} style={styles.tipo}>
                {TIPO_PENDENCIA[p.tipo]}
              </Texto>
              <Texto variante="body2" cor={cores.tinta} numberOfLines={1}>
                {p.titulo}
              </Texto>
            </View>
            <Texto variante="caption" cor={cores.tintaSuave}>
              {dataCurta(p.criadoEm).slice(0, 5)}
            </Texto>
            <CaretRightIcon size={16} color={cores.tintaSuave} />
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  blocos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl + espaco.xs, gap: espaco.lg },
  cartao: {
    gap: espaco.lg,
    padding: espaco.lg + espaco.xs,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    ...sombraSuave,
  },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  circulo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicadores: { flexDirection: 'row', gap: 10 },
  indicador: {
    flex: 1,
    gap: espaco.xxs,
    paddingVertical: espaco.md,
    paddingHorizontal: 14,
    borderRadius: raio.botao,
  },
  numero: { fontFamily: fontes.displayExtra, fontSize: 26, lineHeight: 32 },
  rotuloIndicador: { fontFamily: fontes.interMedium },
  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: espaco.sm,
  },
  coluna: { flex: 1, alignItems: 'center', gap: espaco.xs },
  barra: { width: '70%', borderRadius: raio.xs },
  pendencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    minHeight: 48,
    paddingVertical: espaco.xs,
  },
  divisor: { borderTopWidth: 1, borderTopColor: cores.linha, paddingTop: espaco.sm },
  tipo: { fontFamily: fontes.interSemiBold },
});
