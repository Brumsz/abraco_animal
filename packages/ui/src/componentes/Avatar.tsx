import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { cores } from '../tokens/cores';
import { fontes } from '../tokens/tipografia';
import { Texto } from './Texto';

/** "Karina Somaggio" → "KS"; "abraço" → "A"; vazio → "?". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  const resultado = `${primeira}${ultima}`.toLocaleUpperCase('pt-BR');
  return resultado || '?';
}

export interface AvatarProps {
  readonly nome: string;
  readonly uri?: string | null | undefined;
  readonly tamanho?: number;
}

export function Avatar({ nome, uri, tamanho = 48 }: AvatarProps) {
  const [falhou, setFalhou] = useState(false);
  const dimensoes = { width: tamanho, height: tamanho, borderRadius: tamanho / 2 };
  const mostrarFoto = Boolean(uri) && !falhou;

  return (
    <View
      style={[styles.container, dimensoes]}
      accessibilityRole="image"
      accessibilityLabel={`Foto de ${nome}`}
    >
      {mostrarFoto ? (
        <Image
          source={{ uri: uri ?? undefined }}
          style={dimensoes}
          onError={() => {
            setFalhou(true);
          }}
        />
      ) : (
        <Texto
          cor={cores.marromTexto}
          style={{ fontFamily: fontes.poppinsSemiBold, fontSize: tamanho * 0.38 }}
          maxFontSizeMultiplier={1}
          importantForAccessibility="no"
        >
          {iniciais(nome)}
        </Texto>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: cores.laranjaSuave,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
