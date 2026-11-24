import { cores, espaco, Texto, useToast } from '@abraco/ui';
import { ChatCircleDotsIcon } from 'phosphor-react-native';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';
import { Logo } from '@/shared/componentes/Logo';
import { mensagemDeErro } from '@/shared/erros';

import { useAbrirConversa, useConversas, useDigitando } from '../data/hooks';
import { conversaAtual } from '../domain/conversa';
import { Compositor, PainelConversa } from './PainelConversa';

/** Protótipo "Chat - Usuário": conversa única com a equipe da ONG. */
export default function TelaChat() {
  const conversas = useConversas();
  const atual = conversaAtual(conversas.data);
  const espacoBarra = useEspacoBarra();

  let corpo;
  if (conversas.isPending) {
    corpo = <ActivityIndicator color={cores.marca} style={styles.carregando} />;
  } else if (conversas.isError) {
    corpo = <EstadoErro erro={conversas.error} aoTentarDeNovo={() => void conversas.refetch()} />;
  } else if (atual) {
    corpo = (
      <PainelConversa
        conversaId={atual.id}
        souEquipe={false}
        nomeOutroLado="ONG"
        espacoInferior={espacoBarra - espaco.lg}
      />
    );
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
  const espacoBarra = useEspacoBarra();
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
        espacoInferior={espacoBarra - espaco.lg}
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
});
