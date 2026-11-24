import { cores, espaco, fontes, Texto } from '@abraco/ui';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import {
  ChatCircleIcon,
  ClipboardTextIcon,
  HeartIcon,
  HouseIcon,
  PawPrintIcon,
  UserIcon,
  type Icon,
} from 'phosphor-react-native';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Abas conhecidas da barra (nome da rota → rótulo e ícone). */
export const ABAS: Record<string, { rotulo: string; Icone: Icon; destaque?: boolean }> = {
  inicio: { rotulo: 'Início', Icone: HouseIcon },
  adotar: { rotulo: 'Adotar', Icone: PawPrintIcon },
  doar: { rotulo: 'Doar', Icone: HeartIcon, destaque: true },
  central: { rotulo: 'Central', Icone: ClipboardTextIcon },
  chat: { rotulo: 'Chat', Icone: ChatCircleIcon },
  perfil: { rotulo: 'Perfil', Icone: UserIcon },
};

/** Altura ocupada pela barra (para as telas reservarem espaço no fim da rolagem). */
export const ALTURA_BARRA = 72 + espaco.lg;

/** Espaço no fim das telas com abas: a barra flutua sobre o conteúdo. */
export function useEspacoBarra(): number {
  const insets = useSafeAreaInsets();
  return ALTURA_BARRA + Math.max(insets.bottom, espaco.lg) + espaco.lg;
}

/**
 * Barra inferior do protótipo: cartão branco flutuante (raio 28), item ativo com
 * pílula laranja-clara e o botão Doar elevado no centro. Abas escondidas no layout
 * (Doar para o admin, Central para o usuário) não aparecem.
 */
export function BarraNavegacao({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.posicao, { paddingBottom: Math.max(insets.bottom, espaco.lg) }]}
      pointerEvents="box-none"
    >
      <View style={styles.barra} accessibilityRole="tablist">
        {state.routes.map((rota, indice) => {
          const aba = ABAS[rota.name];
          // `href: null` no layout vira `hidden` (aba que não existe para este papel).
          if (!aba || descriptors[rota.key]?.options.hidden) return null;
          const ativa = state.index === indice;
          const { Icone } = aba;

          const tocar = () => {
            const evento = emitter.emit({
              type: 'tabPress',
              target: rota.key,
              canPreventDefault: true,
            });
            if (!ativa && !evento.defaultPrevented) navigateToTab(rota.key);
          };

          return (
            <Pressable
              key={rota.key}
              accessibilityRole="tab"
              accessibilityLabel={aba.rotulo}
              accessibilityState={{ selected: ativa }}
              onPress={tocar}
              style={[styles.item, aba.destaque ? styles.itemDestaque : null]}
            >
              {aba.destaque ? (
                <View style={[styles.botaoDoar, ativa ? styles.botaoDoarAtivo : null]}>
                  <Icone size={24} color={cores.branco} weight={ativa ? 'fill' : 'regular'} />
                </View>
              ) : (
                <View style={[styles.pilula, ativa ? styles.pilulaAtiva : null]}>
                  <Icone
                    size={22}
                    color={ativa ? cores.marca : cores.tintaSuave}
                    weight={ativa ? 'bold' : 'regular'}
                  />
                </View>
              )}
              <Texto
                variante="caption"
                cor={ativa ? cores.marcaEscura : cores.tintaSuave}
                style={{
                  fontFamily: ativa ? fontes.interSemiBold : fontes.interMedium,
                  lineHeight: 14,
                }}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {aba.rotulo}
              </Texto>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const sombra = Platform.select({
  android: { elevation: 12 },
  default: {
    shadowColor: cores.sombra,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
  },
});

const styles = StyleSheet.create({
  posicao: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
  },
  barra: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espaco.sm,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    ...sombra,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 56, justifyContent: 'center' },
  itemDestaque: { marginTop: -28 },
  pilula: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pilulaAtiva: { backgroundColor: cores.marcaClara },
  botaoDoar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: cores.superficie,
    backgroundColor: cores.marca,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 8 },
      default: {
        shadowColor: cores.marca,
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  botaoDoarAtivo: { backgroundColor: cores.marcaEscura },
});
