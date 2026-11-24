import type { Mensagem } from '@abraco/api-client';
import { cores, espaco, fontes, raio, Texto, useToast } from '@abraco/ui';
import { ArrowRightIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { chat } from '@/core/chat';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { mensagemDeErro } from '@/shared/erros';
import { horaCurta, mesmoDia, rotuloDia } from '@/shared/tempo';

import { useEnviarMensagem, useMarcarMensagensLidas, useMensagens } from '../data/hooks';
import { MENSAGEM_MAX, situacaoEnvio, ultimaDoOutroLadoNaoLida } from '../domain/conversa';

/**
 * Mensagens de uma conversa (bolhas, separador de dia, "Visto") e o campo de envio.
 * O mesmo componente serve ao usuário e à equipe (spec: "mesmo componente do chat").
 */
export function PainelConversa({
  conversaId,
  souEquipe,
  nomeOutroLado,
  espacoInferior,
  encerrada = false,
}: {
  readonly conversaId: string;
  /** Quem está vendo é a ONG (admin): as bolhas "minhas" são as da equipe. */
  readonly souEquipe: boolean;
  /** Como o leitor de tela chama o outro lado ("ONG", "Izabella Fortunato"). */
  readonly nomeOutroLado: string;
  /** Espaço sob o campo de envio (barra de abas ou borda do aparelho). */
  readonly espacoInferior: number;
  /** Conversa encerrada: só leitura. */
  readonly encerrada?: boolean;
}) {
  const toast = useToast();
  const mensagens = useMensagens(conversaId);
  const enviar = useEnviarMensagem(conversaId);
  const marcar = useMarcarMensagensLidas(conversaId);
  const itens = mensagens.data?.pages.flatMap((p) => p.itens) ?? [];
  const minhaUltima = itens.find((m) => m.autorEhEquipe === souEquipe)?.id;

  // Abriu a conversa (ou chegou resposta): avisa o outro lado que leu, uma vez por mensagem.
  const avisada = useRef<string | null>(null);
  const naoLida = ultimaDoOutroLadoNaoLida(itens, souEquipe);
  useEffect(() => {
    if (!naoLida || avisada.current === naoLida) return;
    avisada.current = naoLida;
    marcar.mutate(naoLida);
  }, [naoLida, marcar]);

  if (mensagens.isError && itens.length === 0) {
    return <EstadoErro erro={mensagens.error} aoTentarDeNovo={() => void mensagens.refetch()} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        inverted
        data={itens}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.mensagens}
        renderItem={({ item, index }) => {
          const anterior = itens[index + 1];
          return (
            <View>
              {!anterior || !mesmoDia(anterior.criadoEm, item.criadoEm) ? (
                <View style={styles.dia}>
                  <Texto variante="caption" cor={cores.tintaCorpo}>
                    {rotuloDia(item.criadoEm)}
                  </Texto>
                </View>
              ) : null}
              <Balao
                mensagem={item}
                minha={item.autorEhEquipe === souEquipe}
                nomeOutroLado={nomeOutroLado}
                mostrarSituacao={item.id === minhaUltima}
              />
            </View>
          );
        }}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (mensagens.hasNextPage && !mensagens.isFetchingNextPage) {
            void mensagens.fetchNextPage();
          }
        }}
        ListFooterComponent={
          mensagens.isPending || mensagens.isFetchingNextPage ? (
            <ActivityIndicator color={cores.marca} style={styles.carregando} />
          ) : undefined
        }
      />
      {encerrada ? (
        <View style={[styles.encerrada, { paddingBottom: espacoInferior }]}>
          <Texto variante="body2" cor={cores.tintaSuave} style={styles.centro}>
            Conversa encerrada. Só dá para ler as mensagens.
          </Texto>
        </View>
      ) : (
        <Compositor
          espacoInferior={espacoInferior}
          enviando={enviar.isPending}
          aoDigitar={() => {
            chat.digitando(conversaId);
          }}
          aoEnviar={async (texto) => {
            try {
              await enviar.mutateAsync(texto);
              return true;
            } catch (e) {
              toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
              return false;
            }
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Balao({
  mensagem: m,
  minha,
  nomeOutroLado,
  mostrarSituacao,
}: {
  readonly mensagem: Mensagem;
  readonly minha: boolean;
  readonly nomeOutroLado: string;
  readonly mostrarSituacao: boolean;
}) {
  return (
    <View style={[styles.linha, minha ? styles.direita : styles.esquerda]}>
      <View
        style={[styles.balao, minha ? styles.balaoMeu : styles.balaoOutro]}
        accessible
        accessibilityLabel={`${minha ? 'Você' : nomeOutroLado}, ${horaCurta(m.criadoEm)}: ${m.conteudo}`}
      >
        <Texto variante="body1" cor={minha ? cores.branco : cores.tinta} style={styles.textoBalao}>
          {m.conteudo}
        </Texto>
      </View>
      {mostrarSituacao ? (
        <Texto variante="caption" cor={cores.tintaSuave}>
          {situacaoEnvio(m, horaCurta)}
        </Texto>
      ) : null}
    </View>
  );
}

const INTERVALO_DIGITANDO_MS = 3000;

export function Compositor({
  espacoInferior,
  enviando,
  aoEnviar,
  aoDigitar,
}: {
  readonly espacoInferior: number;
  readonly enviando: boolean;
  /** Devolve se enviou (o texto só some do campo quando deu certo). */
  readonly aoEnviar: (texto: string) => Promise<boolean>;
  readonly aoDigitar?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const ultimoAviso = useRef(0);
  const limpo = texto.trim();

  const enviar = async () => {
    if (!limpo || enviando) return;
    if (await aoEnviar(limpo)) setTexto('');
  };

  return (
    <View style={[styles.compositor, { paddingBottom: espacoInferior }]}>
      <TextInput
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          // "Digitando…" para a equipe, no máximo a cada 3 s.
          const agora = Date.now();
          if (aoDigitar && agora - ultimoAviso.current > INTERVALO_DIGITANDO_MS) {
            ultimoAviso.current = agora;
            aoDigitar();
          }
        }}
        placeholder="Escreva uma mensagem..."
        placeholderTextColor={cores.tintaSuave}
        accessibilityLabel="Mensagem"
        multiline
        maxLength={MENSAGEM_MAX}
        style={styles.campo}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enviar mensagem"
        accessibilityState={{ disabled: !limpo || enviando }}
        disabled={!limpo || enviando}
        onPress={() => void enviar()}
        style={({ pressed }) => [styles.enviar, { opacity: !limpo ? 0.5 : pressed ? 0.8 : 1 }]}
      >
        {enviando ? (
          <ActivityIndicator color={cores.branco} />
        ) : (
          <ArrowRightIcon size={22} color={cores.branco} weight="bold" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centro: { textAlign: 'center' },
  carregando: { marginVertical: espaco.xl },
  mensagens: { paddingHorizontal: MARGEM_TELA, paddingVertical: espaco.lg, gap: espaco.md },
  dia: {
    alignSelf: 'center',
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.xs,
    borderRadius: raio.pilula,
    backgroundColor: cores.fundoSuave,
    marginBottom: espaco.md,
  },
  linha: { gap: espaco.xs, maxWidth: '82%' },
  direita: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  esquerda: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  balao: { paddingHorizontal: espaco.lg, paddingVertical: espaco.md, borderRadius: raio.lg },
  balaoMeu: { backgroundColor: cores.marca, borderBottomRightRadius: raio.xs },
  balaoOutro: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.linha,
    borderBottomLeftRadius: raio.xs,
  },
  textoBalao: { fontFamily: fontes.interMedium },
  encerrada: {
    paddingHorizontal: MARGEM_TELA,
    paddingTop: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.linha,
  },
  compositor: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espaco.sm,
    paddingHorizontal: MARGEM_TELA,
    paddingTop: espaco.sm,
  },
  campo: {
    flex: 1,
    minHeight: 52,
    maxHeight: 140,
    paddingHorizontal: espaco.lg,
    paddingTop: 15,
    paddingBottom: 15,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: cores.linhaForte,
    backgroundColor: cores.superficie,
    fontFamily: fontes.interRegular,
    fontSize: 15,
    color: cores.tinta,
  },
  enviar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: cores.marca,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
