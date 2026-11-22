import { cores, espaco, raio, Texto } from '@abraco/ui';
import { WarningCircleIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

/** Erro geral do formulário (ex.: credenciais inválidas), inline — nunca Alert nativo. */
export function AvisoErro({ mensagem }: { readonly mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <View style={styles.caixa} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <WarningCircleIcon size={20} color={cores.erro} weight="fill" />
      <Texto variante="body2" cor={cores.erroTexto} style={styles.texto}>
        {mensagem}
      </Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    padding: espaco.md,
    borderRadius: raio.md,
    backgroundColor: cores.erroFundo,
  },
  texto: { flex: 1 },
});
