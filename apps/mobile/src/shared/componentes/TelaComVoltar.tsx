import { BotaoVoltar, cores, espaco } from '@abraco/ui';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MARGEM_TELA } from './CabecalhoTela';

/** Telas cheias (fora das abas): botão voltar no topo, como nos protótipos. */
export function TelaComVoltar({
  children,
  rodape,
}: {
  readonly children: ReactNode;
  /** Ação fixa no fim da tela ("Entendi, continuar"). */
  readonly rodape?: ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.topo}>
        <BotaoVoltar
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/inicio');
          }}
        />
      </View>
      <View style={styles.conteudo}>{children}</View>
      {rodape ? <View style={styles.rodape}>{rodape}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xs },
  conteudo: { flex: 1 },
  rodape: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.md, paddingBottom: espaco.md },
});
