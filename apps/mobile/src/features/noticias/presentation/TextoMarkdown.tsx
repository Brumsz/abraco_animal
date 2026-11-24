import { cores, espaco, fontes, Texto } from '@abraco/ui';
import { Linking, StyleSheet, View } from 'react-native';

import { lerMarkdown, type Trecho } from '../domain/markdown';

/** Renderiza o Markdown das notícias só com componentes nativos (sem WebView, sem HTML). */
export function TextoMarkdown({ conteudo }: { readonly conteudo: string }) {
  return (
    <View style={styles.blocos}>
      {lerMarkdown(conteudo).map((b, i) => {
        const chave = String(i);
        switch (b.tipo) {
          case 'titulo':
            return (
              <Texto key={chave} variante={b.nivel === 1 ? 'h2' : 'h3'} accessibilityRole="header">
                <Trechos trechos={b.trechos} />
              </Texto>
            );
          case 'paragrafo':
            return (
              <Texto key={chave} variante="body1" cor={cores.tintaCorpo}>
                <Trechos trechos={b.trechos} />
              </Texto>
            );
          case 'citacao':
            return (
              <View key={chave} style={styles.citacao}>
                <Texto variante="body1" cor={cores.tintaCorpo} style={styles.italico}>
                  <Trechos trechos={b.trechos} />
                </Texto>
              </View>
            );
          case 'lista':
            return (
              <View key={chave} style={styles.lista} accessibilityRole="list">
                {b.itens.map((item, j) => (
                  <View key={String(j)} style={styles.item}>
                    <Texto variante="body1" cor={cores.tintaCorpo} style={styles.marcador}>
                      {b.ordenada ? `${String(j + 1)}.` : '•'}
                    </Texto>
                    <Texto variante="body1" cor={cores.tintaCorpo} style={styles.flex}>
                      <Trechos trechos={item} />
                    </Texto>
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

function Trechos({ trechos }: { readonly trechos: readonly Trecho[] }) {
  return trechos.map((t, i) => {
    const chave = String(i);
    if (t.tipo === 'negrito') {
      return (
        <Texto key={chave} style={styles.negrito}>
          {t.texto}
        </Texto>
      );
    }
    if (t.tipo === 'italico') {
      return (
        <Texto key={chave} style={styles.italico}>
          {t.texto}
        </Texto>
      );
    }
    if (t.tipo === 'link' && t.url) {
      const url = t.url;
      return (
        <Texto
          key={chave}
          cor={cores.marcaEscura}
          style={styles.link}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(url)}
        >
          {t.texto}
        </Texto>
      );
    }
    return t.texto;
  });
}

const styles = StyleSheet.create({
  blocos: { gap: espaco.lg },
  negrito: { fontFamily: fontes.interSemiBold },
  italico: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  citacao: { borderLeftWidth: 3, borderLeftColor: cores.marcaClaraForte, paddingLeft: espaco.md },
  lista: { gap: espaco.xs },
  item: { flexDirection: 'row', gap: espaco.sm },
  marcador: { minWidth: 16 },
  flex: { flex: 1 },
});
