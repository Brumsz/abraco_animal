import { Button, cores, espaco, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { CheckCircleIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { TelaComVoltar } from './TelaComVoltar';

/** Confirmação depois de enviar um pedido (adoção, doação de animal…). */
export function TelaConcluido({
  titulo,
  texto,
}: {
  readonly titulo: string;
  readonly texto: string;
}) {
  const router = useRouter();
  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Voltar para o início"
          onPress={() => {
            router.dismissTo('/inicio');
          }}
          larguraTotal
        />
      }
    >
      <View style={styles.conteudo} accessibilityLiveRegion="polite">
        <View style={styles.icone}>
          <CheckCircleIcon size={40} color={cores.sucessoTexto} weight="fill" />
        </View>
        <Texto variante="titulo" accessibilityRole="header">
          {titulo}
        </Texto>
        <Texto variante="body1" cor={cores.tintaCorpo}>
          {texto}
        </Texto>
      </View>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingHorizontal: 28, paddingTop: 40, gap: espaco.lg },
  icone: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: cores.sucessoFundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
