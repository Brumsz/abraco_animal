import { Button, cores, espaco, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sair } from '@/core/sessao';

import { ALTURA_BARRA } from './BarraNavegacao';

/** Provisória: abas cuja tela real chega nas próximas partes da Etapa 10. */
export function EmConstrucao({ titulo }: { readonly titulo: string }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <View style={[styles.conteudo, { paddingBottom: ALTURA_BARRA }]}>
        <Texto variante="titulo" cor={cores.tinta} accessibilityRole="header">
          {titulo}
        </Texto>
        <Texto variante="body1" cor={cores.tintaSuave}>
          Esta tela está sendo construída.
        </Texto>
        <Button
          titulo="Sair da conta"
          variante="contorno"
          onPress={() => {
            void sair().then(() => {
              router.replace('/login');
            });
          }}
          style={styles.sair}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flex: 1, paddingHorizontal: 20, paddingTop: espaco.xxl, gap: espaco.sm },
  sair: { marginTop: espaco.xl, alignSelf: 'flex-start' },
});
