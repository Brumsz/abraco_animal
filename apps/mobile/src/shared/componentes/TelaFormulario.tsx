import { espaco } from '@abraco/ui';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { CabecalhoTela, MARGEM_TELA } from './CabecalhoTela';
import { TelaComVoltar } from './TelaComVoltar';

/** Tela cheia de formulário: voltar, título, campos roláveis e a ação fixa no fim. */
export function TelaFormulario({
  titulo,
  subtitulo,
  rodape,
  children,
}: {
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly rodape?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <TelaComVoltar rodape={rodape}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.rolagem}>
          <CabecalhoTela titulo={titulo} {...(subtitulo ? { subtitulo } : {})} />
          <View style={styles.campos}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rolagem: { paddingBottom: espaco.xl },
  campos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: 20 },
});
