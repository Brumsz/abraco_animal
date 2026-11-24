import { cores, espaco, fontes, raio, Texto } from '@abraco/ui';
import { CaretRightIcon, type Icon } from 'phosphor-react-native';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export interface Opcao {
  readonly rotulo: string;
  readonly Icone: Icon;
  /** Sem ação: linha só informativa (ex.: e-mail nas Configurações). */
  readonly aoPressionar?: () => void;
  /** Texto à direita (ex.: o e-mail da conta). */
  readonly valor?: string;
  /** Vermelho, sem seta ("Excluir minha conta"). */
  readonly destrutiva?: boolean;
  /** Ícone num círculo laranja-claro (menu do Perfil) ou solto (Configurações). */
  readonly iconeEmCirculo?: boolean;
}

/** Cartão branco com linhas separadas (menus do Perfil e das Configurações). */
export function ListaOpcoes({
  opcoes,
  titulo,
}: {
  readonly opcoes: readonly Opcao[];
  /** Título da seção acima do cartão ("CONTA"). */
  readonly titulo?: string;
}) {
  return (
    <View style={styles.secao}>
      {titulo ? (
        <Texto variante="caption" cor={cores.tintaSuave} style={styles.titulo}>
          {titulo.toLocaleUpperCase('pt-BR')}
        </Texto>
      ) : null}
      <View style={styles.cartao}>
        {opcoes.map((o, i) => (
          <Fragment key={o.rotulo}>
            {i > 0 ? <View style={styles.divisor} /> : null}
            <Linha opcao={o} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function Linha({ opcao: o }: { readonly opcao: Opcao }) {
  const corTexto = o.destrutiva ? cores.erro : cores.tinta;
  const corIcone = o.destrutiva ? cores.erro : o.iconeEmCirculo ? cores.marca : cores.tintaCorpo;
  const conteudo = (
    <>
      <View style={o.iconeEmCirculo ? styles.circulo : styles.iconeSolto}>
        <o.Icone size={20} color={corIcone} />
      </View>
      <Texto variante="body1" cor={corTexto} style={styles.rotulo} numberOfLines={1}>
        {o.rotulo}
      </Texto>
      {o.valor ? (
        <Texto variante="body2" cor={cores.tintaSuave} numberOfLines={1} style={styles.valor}>
          {o.valor}
        </Texto>
      ) : null}
      {o.aoPressionar && !o.destrutiva ? (
        <CaretRightIcon size={18} color={cores.tintaSuave} />
      ) : null}
    </>
  );

  if (!o.aoPressionar) {
    return (
      <View style={styles.linha} accessible accessibilityLabel={`${o.rotulo}: ${o.valor ?? ''}`}>
        {conteudo}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={o.rotulo}
      onPress={o.aoPressionar}
      style={({ pressed }) => [styles.linha, pressed && styles.pressionada]}
    >
      {conteudo}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  secao: { gap: espaco.sm },
  titulo: { fontFamily: fontes.interSemiBold, letterSpacing: 0.6, paddingHorizontal: espaco.xs },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    overflow: 'hidden',
  },
  linha: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.sm,
  },
  pressionada: { backgroundColor: cores.fundoSuave },
  divisor: { height: 1, backgroundColor: cores.linha },
  circulo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeSolto: { width: 24, alignItems: 'center' },
  rotulo: { flex: 1, fontFamily: fontes.interMedium },
  valor: { flexShrink: 1, maxWidth: '55%' },
});
