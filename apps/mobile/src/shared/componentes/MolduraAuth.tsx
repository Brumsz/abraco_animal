import { BotaoVoltar, cores, espaco, raio, Texto } from '@abraco/ui';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FundoMarca } from './FundoMarca';
import { Logo } from './Logo';

interface MolduraAuthProps {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly children: ReactNode;
  /** grande: login (logo de 160 + nome); media: recuperação; compacta: cadastro. */
  readonly cabecalho?: 'grande' | 'media' | 'compacta';
  readonly aoVoltar?: () => void;
}

const LOGO = { grande: 160, media: 120, compacta: 72 } as const;

/**
 * Molde das telas de entrada do protótipo: cabeçalho laranja com a logo e uma
 * folha creme de cantos arredondados (32) que sobe 40 px sobre ele.
 */
export function MolduraAuth({
  titulo,
  subtitulo,
  children,
  cabecalho = 'media',
  aoVoltar,
}: MolduraAuthProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.rolagem}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <FundoMarca style={[styles.cabecalho, { paddingTop: insets.top + espaco.sm }]}>
          {aoVoltar ? (
            <BotaoVoltar
              tema="claro"
              onPress={aoVoltar}
              style={[styles.voltar, { top: insets.top + espaco.sm }]}
            />
          ) : null}
          <Logo largura={LOGO[cabecalho]} />
          {cabecalho === 'grande' ? (
            <Texto variante="label" cor={cores.branco} style={styles.nome}>
              ABRAÇO ANIMAL
            </Texto>
          ) : null}
        </FundoMarca>

        <View style={[styles.folha, { paddingBottom: insets.bottom + espaco.xxl }]}>
          <View style={styles.titulos}>
            <Texto variante="h1" cor={cores.tinta} accessibilityRole="header">
              {titulo}
            </Texto>
            <Texto variante="body1" cor={cores.tintaSuave}>
              {subtitulo}
            </Texto>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { flexGrow: 1 },
  cabecalho: {
    alignItems: 'center',
    paddingBottom: 40 + espaco.xl,
    gap: espaco.lg,
  },
  voltar: { position: 'absolute', left: espaco.xl, zIndex: 1 },
  nome: { letterSpacing: 1.8, opacity: 0.92 },
  folha: {
    flexGrow: 1,
    marginTop: -40,
    backgroundColor: cores.fundo,
    borderTopLeftRadius: raio.folha,
    borderTopRightRadius: raio.folha,
    paddingHorizontal: 28,
    paddingTop: espaco.xxl,
    gap: espaco.lg,
  },
  titulos: { gap: 6 },
});
