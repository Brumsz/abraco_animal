import { Button, CaixaSelecao, cores, espaco, Texto } from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProhibitIcon, WarningIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';

const REGRAS = ['Não doamos para crianças.', 'Não doamos para deixar no terreno.'] as const;

/**
 * Protótipo "Adotar - Aviso". O aceite do termo (exigido pela API) fica aqui,
 * junto das regras que ele resume (decisão de 22/11).
 */
export default function TelaAvisoAdocao() {
  const { animalId } = useLocalSearchParams<{ animalId: string }>();
  const router = useRouter();
  const [aceito, setAceito] = useState(false);

  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Entendi, continuar"
          disabled={!aceito}
          onPress={() => {
            router.push({
              pathname: '/adocao/[animalId]/formulario',
              params: { animalId, termo: 'aceito' },
            });
          }}
          larguraTotal
        />
      }
    >
      <ScrollView contentContainerStyle={styles.conteudo}>
        <View style={styles.icone} importantForAccessibility="no-hide-descendants">
          <WarningIcon size={34} color={cores.avisoTexto} />
        </View>
        <View style={styles.textos}>
          <Texto variante="titulo" accessibilityRole="header">
            Antes de adotar
          </Texto>
          <Texto variante="body1" cor={cores.tintaCorpo} style={styles.subtitulo}>
            Adotar um animal de grande porte requer fôlego financeiro.
          </Texto>
        </View>
        <View style={styles.regras}>
          {REGRAS.map((r) => (
            <View key={r} style={styles.regra}>
              <ProhibitIcon size={22} color={cores.erro} />
              <Texto variante="body1" style={styles.textoRegra}>
                {r}
              </Texto>
            </View>
          ))}
        </View>
        <CaixaSelecao
          marcada={aceito}
          onChange={setAceito}
          rotulo="Li as regras e aceito o termo de adoção da ONG"
        >
          <Texto variante="body2" cor={cores.tintaCorpo}>
            Li as regras e aceito o termo de adoção da ONG.
          </Texto>
        </CaixaSelecao>
        {!aceito ? (
          <Texto variante="caption" cor={cores.tintaSuave}>
            Marque o aceite para continuar.
          </Texto>
        ) : null}
      </ScrollView>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingHorizontal: 28, paddingTop: 40, paddingBottom: espaco.xl, gap: 20 },
  icone: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: cores.avisoFundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { gap: 10 },
  subtitulo: { fontSize: 16, lineHeight: 24 },
  regras: { gap: 10, paddingTop: espaco.sm },
  regra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    padding: espaco.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  textoRegra: { flex: 1 },
});
