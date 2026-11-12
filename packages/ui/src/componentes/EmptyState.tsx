import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { cores } from '../tokens/cores';
import { espaco } from '../tokens/layout';
import { Button } from './Button';
import { Texto } from './Texto';

export interface EmptyStateProps {
  /** Ilustração ou ícone grande. */
  readonly ilustracao?: ReactNode;
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly acao?: { readonly titulo: string; readonly aoPressionar: () => void };
}

export function EmptyState({ ilustracao, titulo, subtitulo, acao }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {ilustracao ? (
        <View style={styles.ilustracao} importantForAccessibility="no-hide-descendants">
          {ilustracao}
        </View>
      ) : null}
      <Texto variante="h3" cor={cores.marromTexto} alinhamento="center">
        {titulo}
      </Texto>
      {subtitulo ? (
        <Texto variante="body2" cor={cores.neutro600} alinhamento="center">
          {subtitulo}
        </Texto>
      ) : null}
      {acao ? (
        <Button titulo={acao.titulo} onPress={acao.aoPressionar} style={styles.acao} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaco.xxl,
    gap: espaco.sm,
  },
  ilustracao: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: cores.laranjaClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.md,
  },
  acao: { marginTop: espaco.lg },
});
