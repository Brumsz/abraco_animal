import type { Mensagem } from '@abraco/api-client';
import { cores, espaco, fontes, raio, Texto, useToast } from '@abraco/ui';
import { ArrowRightIcon, ChatCircleDotsIcon } from 'phosphor-react-native';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { chat } from '@/core/chat';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';
import { Logo } from '@/shared/componentes/Logo';
import { mensagemDeErro } from '@/shared/erros';
import { horaCurta, mesmoDia, rotuloDia } from '@/shared/tempo';

import {
  useAbrirConversa,
  useConversas,
  useDigitando,
  useEnviarMensagem,
  useMarcarMensagensLidas,
  useMensagens,
} from '../data/hooks';
import {
  conversaAtual,
  MENSAGEM_MAX,
  situacaoEnvio,
  ultimaDaEquipeNaoLida,
} from '../domain/conversa';

/** Protótipo "Chat - Usuário": conversa única com a equipe da ONG. */
export default function TelaChat() {
  const conversas = useConversas();
  const atual = conversaAtual(conversas.data);

  let corpo;
  if (conversas.isPending) {
    corpo = <ActivityIndicator color={cores.marca} style={styles.carregando} />;
  } else if (conversas.isError) {
    corpo = <EstadoErro erro={conversas.error} aoTentarDeNovo={() => void conversas.refetch()} />;
  } else if (atual) {
    corpo = <Conversa conversaId={atual.id} />;
  } else {
    corpo = <NovaConversa encerrada={conversas.data.length > 0} />;
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <Cabecalho conversaId={atual?.id ?? null} />
      {corpo}
    </SafeAreaView>
  );
}

function Cabecalho({ conversaId }: { readonly conversaId: string | null }) {
  // A chave some sozinha quando o aviso vence (ver useChatAoVivo).
  const digitando = useDigitando((s) => (conversaId ? conversaId in s : false));

  return (
    <View style={styles.cabecalho}>
      <View style={styles.avatar} importantForAccessibility="no-hide-descendants">
        <Logo largura={26} />
      </View>
      <View style={styles.flex}>
        <Texto variante="h3" accessibilityRole="header">
          ONG Abraço Animal
        </Texto>
        <Texto
          variante="caption"
          cor={digitando ? cores.marcaEscura : cores.tintaSuave}
          accessibilityLiveRegion="polite"
        >
          {digitando ? 'Digitando…' : 'Costumamos responder em até 1 dia útil'}
        </Texto>
      </View>
    </View>
  );
}

/** Sem conversa aberta: a primeira mensagem abre uma. */
function NovaConversa({ encerrada }: { readonly encerrada: boolean }) {
  const toast = useToast();
  const abrir = useAbrirConversa();
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        <EstadoVazio
          icone={<ChatCircleDotsIcon size={48} color={cores.marca} />}
          titulo={encerrada ? 'Sua última conversa foi encerrada' : 'Fale com a ONG'}
          subtitulo="Tire dúvidas sobre adoção, visitas, doações ou voluntariado. A equipe responde por aqui."
        />
      </View>
      <Compositor
        enviando={abrir.isPending}
        aoEnviar={async (texto) => {
          try {
            await abrir.mutateAsync({ mensagem: texto });
            return true;
          } catch (e) {
            toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
            return false;
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Conversa({ conversaId }: { readonly conversaId: string }) {
  const toast = useToast();
  const mensagens = useMensagens(conversaId);
  const enviar = useEnviarMensagem(conversaId);
  const marcar = useMarcarMensagensLidas(conversaId);
  const itens = mensagens.data?.pages.flatMap((p) => p.itens) ?? [];
  const minhaUltima = itens.find((m) => !m.autorEhEquipe)?.id;

  // Abriu a conversa (ou chegou resposta): avisa a equipe que leu, uma vez por mensagem.
  const avisada = useRef<string | null>(null);
  const naoLida = ultimaDaEquipeNaoLida(itens);
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
              <Balao mensagem={item} mostrarSituacao={item.id === minhaUltima} />
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
      <Compositor
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
    </KeyboardAvoidingView>
  );
}

function Balao({
  mensagem: m,
  mostrarSituacao,
}: {
  readonly mensagem: Mensagem;
  readonly mostrarSituacao: boolean;
}) {
  const minha = !m.autorEhEquipe;
  return (
    <View style={[styles.linha, minha ? styles.direita : styles.esquerda]}>
      <View
        style={[styles.balao, minha ? styles.balaoMeu : styles.balaoEquipe]}
        accessible
        accessibilityLabel={`${minha ? 'Você' : 'ONG'}, ${horaCurta(m.criadoEm)}: ${m.conteudo}`}
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

function Compositor({
  enviando,
  aoEnviar,
  aoDigitar,
}: {
  readonly enviando: boolean;
  /** Devolve se enviou (o texto só some do campo quando deu certo). */
  readonly aoEnviar: (texto: string) => Promise<boolean>;
  readonly aoDigitar?: () => void;
}) {
  const espacoBarra = useEspacoBarra();
  const [texto, setTexto] = useState('');
  const ultimoAviso = useRef(0);
  const limpo = texto.trim();

  const enviar = async () => {
    if (!limpo || enviando) return;
    if (await aoEnviar(limpo)) setTexto('');
  };

  return (
    <View style={[styles.compositor, { paddingBottom: espacoBarra - espaco.lg }]}>
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
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  carregando: { marginVertical: espaco.xl },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: MARGEM_TELA,
    paddingVertical: espaco.md,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cores.marcaDestaque,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
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
  balaoEquipe: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.linha,
    borderBottomLeftRadius: raio.xs,
  },
  textoBalao: { fontFamily: fontes.interMedium },
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
