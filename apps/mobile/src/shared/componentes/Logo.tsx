import { cores, fontes, Texto } from '@abraco/ui';
import { HeartStraightIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

interface LogoProps {
  /** claro: para fundo laranja; escuro: para fundo claro. */
  readonly tema?: 'claro' | 'escuro';
  readonly tamanho?: 'pequeno' | 'grande';
}

/**
 * Logo PROVISÓRIA (coração + nome). Substituir pelo arquivo oficial da ONG
 * quando ele for disponibilizado (a pasta /design não veio com o projeto).
 */
export function Logo({ tema = 'escuro', tamanho = 'grande' }: LogoProps) {
  const grande = tamanho === 'grande';
  const corIcone = tema === 'claro' ? cores.laranjaPrimario : cores.creme;
  const fundoIcone = tema === 'claro' ? cores.creme : cores.laranjaPrimario;
  // marromTexto atende AA tanto no creme (14,4:1) quanto no laranja (5,6:1)
  const corTexto = cores.marromTexto;
  const diametro = grande ? 88 : 40;

  return (
    <View
      style={[styles.container, grande ? styles.vertical : styles.horizontal]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Abraço Animal"
    >
      <View
        style={[
          styles.icone,
          {
            width: diametro,
            height: diametro,
            borderRadius: diametro / 2,
            backgroundColor: fundoIcone,
          },
        ]}
      >
        <HeartStraightIcon size={diametro * 0.55} color={corIcone} weight="fill" />
      </View>
      <Texto
        cor={corTexto}
        style={{ fontFamily: fontes.poppinsBold, fontSize: grande ? 28 : 18 }}
        maxFontSizeMultiplier={1.3}
      >
        Abraço Animal
      </Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  vertical: { gap: 12 },
  horizontal: { flexDirection: 'row', gap: 8 },
  icone: { alignItems: 'center', justifyContent: 'center' },
});
