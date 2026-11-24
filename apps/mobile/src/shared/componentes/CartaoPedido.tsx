import { Badge, cores, espaco, raio, Texto, type StatusBadge } from '@abraco/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/** Linha de histórico: imagem/ícone, título, data, status e (opcional) uma observação. */
export function CartaoPedido({
  titulo,
  subtitulo,
  status,
  observacao,
  imagem,
  aoPressionar,
}: {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly status: { readonly texto: string; readonly badge: StatusBadge };
  readonly observacao?: string | null;
  readonly imagem: ReactNode;
  readonly aoPressionar?: () => void;
}) {
  const conteudo = (
    <>
      <View style={styles.imagem}>{imagem}</View>
      <View style={styles.textos}>
        <Texto variante="h3" numberOfLines={1}>
          {titulo}
        </Texto>
        <Texto variante="caption" cor={cores.tintaSuave}>
          {subtitulo}
        </Texto>
        <View style={styles.badge}>
          <Badge status={status.badge} texto={status.texto} />
        </View>
        {observacao ? (
          <Texto variante="body2" cor={cores.tintaCorpo}>
            {observacao}
          </Texto>
        ) : null}
      </View>
    </>
  );
  const rotulo = `${titulo}, ${status.texto}, ${subtitulo}`;
  if (!aoPressionar) {
    return (
      <View style={styles.cartao} accessible accessibilityLabel={rotulo}>
        {conteudo}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={aoPressionar}
      style={({ pressed }) => [styles.cartao, { opacity: pressed ? 0.85 : 1 }]}
    >
      {conteudo}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cartao: {
    flexDirection: 'row',
    gap: espaco.md,
    padding: espaco.md,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  imagem: { width: 72, height: 72, borderRadius: raio.md, overflow: 'hidden' },
  textos: { flex: 1, gap: espaco.xs },
  badge: { flexDirection: 'row' },
});
