/**
 * Atendimento da equipe — protótipos "Chat - Admin - Conversas" e "Chat - Admin -
 * Conversa". A conversa usa o mesmo painel do chat do usuário (spec).
 */
import type { Conversa } from '@abraco/api-client';
import type { StatusConversa } from '@abraco/shared';
import {
  Avatar,
  BotaoVoltar,
  Button,
  cores,
  espaco,
  fontes,
  Input,
  raio,
  Texto,
  useToast,
} from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatCircleDotsIcon, MagnifyingGlassIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDigitando } from '@/features/chat/data/hooks';
import { previaConversa } from '@/features/chat/domain/conversa';
import { PainelConversa } from '@/features/chat/presentation/PainelConversa';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { mensagemDeErro } from '@/shared/erros';
import { quandoCurto } from '@/shared/tempo';

import { useAtenderConversa, useConversasEquipe } from '../data/hooks';
import { correspondeBusca } from '../domain/painel';
import { FiltrosStatus, FolhaConfirmar } from './componentes';

const FILTROS = [
  { valor: 'ABERTA', rotulo: 'Abertas' },
  { valor: 'ENCERRADA', rotulo: 'Encerradas' },
] as const satisfies readonly { valor: StatusConversa; rotulo: string }[];

const nomeDe = (c: Conversa) => c.usuario?.nome ?? 'Usuário';

/** Aba Chat do admin: conversas mais recentes primeiro, com busca por nome. */
export function TelaConversasEquipe() {
  const router = useRouter();
  const espacoBarra = useEspacoBarra();
  const [status, setStatus] = useState<StatusConversa>('ABERTA');
  const [busca, setBusca] = useState('');

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <ListaPaginada
        consulta={useConversasEquipe(status)}
        rotuloCarregando="Carregando as conversas"
        espacoFinal={espacoBarra}
        filtrar={(c) => correspondeBusca(nomeDe(c), busca)}
        cabecalho={
          <>
            <CabecalhoTela titulo="Conversas" subtitulo="Mensagens enviadas pelos usuários." />
            <View style={styles.busca}>
              <Input
                rotulo="Buscar por nome"
                rotuloOculto
                placeholder="Buscar por nome"
                value={busca}
                onChangeText={setBusca}
                icone={(cor) => <MagnifyingGlassIcon size={20} color={cor} />}
                autoCorrect={false}
              />
            </View>
            <FiltrosStatus
              rotulo="Situação da conversa"
              filtros={FILTROS}
              valor={status}
              aoMudar={setStatus}
            />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<ChatCircleDotsIcon size={48} color={cores.marca} />}
            titulo={busca.trim() ? 'Ninguém com esse nome' : 'Nenhuma conversa aqui'}
            {...(status === 'ABERTA' && !busca.trim()
              ? { subtitulo: 'Quando alguém escrever para a ONG, a conversa aparece aqui.' }
              : {})}
          />
        }
        renderizar={(c) => (
          <LinhaConversa
            conversa={c}
            aoPressionar={() => {
              router.push({ pathname: '/admin/conversas/[id]', params: { id: c.id } });
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

function LinhaConversa({
  conversa: c,
  aoPressionar,
}: {
  readonly conversa: Conversa;
  readonly aoPressionar: () => void;
}) {
  const nome = nomeDe(c);
  const naoLidas = c.naoLidas > 0;
  const quando = quandoCurto(c.ultimaMensagem?.criadoEm ?? c.atualizadoEm);
  const previa = previaConversa(c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${nome}, ${quando}: ${previa}${naoLidas ? `, ${String(c.naoLidas)} não lidas` : ''}`}
      onPress={aoPressionar}
      style={({ pressed }) => [styles.linha, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Avatar nome={nome} tamanho={48} />
      <View style={styles.textos}>
        <Texto variante="body1" cor={cores.tinta} style={styles.nome} numberOfLines={1}>
          {nome}
        </Texto>
        <Texto
          variante="body2"
          cor={naoLidas ? cores.tinta : cores.tintaSuave}
          style={naoLidas ? styles.previaForte : undefined}
          numberOfLines={1}
        >
          {previa}
        </Texto>
      </View>
      <View style={styles.lado}>
        <Texto
          variante="caption"
          cor={naoLidas ? cores.marcaEscura : cores.tintaSuave}
          style={naoLidas ? styles.previaForte : undefined}
        >
          {quando}
        </Texto>
        {naoLidas ? (
          <View style={styles.contador}>
            <Texto variante="caption" cor={cores.branco} style={styles.previaForte}>
              {c.naoLidas > 99 ? '99+' : String(c.naoLidas)}
            </Texto>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Uma conversa: cabeçalho com a pessoa, assumir/encerrar e o mesmo painel do usuário. */
export function TelaConversaEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // Todas as conversas (abertas e encerradas): a desta tela está entre as mais recentes.
  const conversas = useConversasEquipe(null);
  const conversa = conversas.data?.pages.flatMap((p) => p.itens).find((c) => c.id === id);
  const atender = useAtenderConversa(id);
  const [encerrando, setEncerrando] = useState(false);
  const digitando = useDigitando((s) => id in s);
  const nome = conversa ? nomeDe(conversa) : 'Conversa';
  const aberta = conversa?.status !== 'ENCERRADA';

  let subtitulo = 'Sem atendente';
  if (digitando) subtitulo = 'Digitando…';
  else if (!aberta) subtitulo = 'Conversa encerrada';
  else if (conversa?.atendente) subtitulo = `Atendida por ${conversa.atendente}`;
  if (!digitando && conversa?.assunto) subtitulo = `${conversa.assunto} · ${subtitulo}`;

  const aoErro = (e: unknown) => {
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <View style={styles.cabecalho}>
        <BotaoVoltar
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/chat');
          }}
        />
        <Avatar nome={nome} tamanho={44} />
        <View style={styles.textos}>
          <Texto variante="h3" accessibilityRole="header" numberOfLines={1}>
            {nome}
          </Texto>
          <Texto
            variante="caption"
            cor={digitando ? cores.marcaEscura : cores.tintaSuave}
            accessibilityLiveRegion="polite"
            numberOfLines={1}
          >
            {subtitulo}
          </Texto>
        </View>
      </View>

      {conversa && aberta ? (
        <View style={styles.acoes}>
          {!conversa.atendente ? (
            <Button
              titulo="Assumir atendimento"
              tamanho="sm"
              carregando={atender.isPending && atender.variables === 'assumir'}
              onPress={() => {
                atender.mutate('assumir', { onError: aoErro });
              }}
            />
          ) : null}
          <Button
            titulo="Encerrar"
            tamanho="sm"
            variante="contorno"
            onPress={() => {
              setEncerrando(true);
            }}
          />
        </View>
      ) : null}

      <PainelConversa
        conversaId={id}
        souEquipe
        nomeOutroLado={nome}
        espacoInferior={Math.max(insets.bottom, espaco.md)}
        encerrada={!aberta}
      />

      <FolhaConfirmar
        visivel={encerrando}
        aoFechar={() => {
          setEncerrando(false);
        }}
        titulo="Encerrar a conversa?"
        texto={`${nome} não poderá mais responder aqui. Se precisar, a pessoa abre uma nova conversa.`}
        rotuloAcao="Encerrar conversa"
        carregando={atender.isPending && atender.variables === 'encerrar'}
        aoConfirmar={() => {
          atender.mutate('encerrar', {
            onSuccess: () => {
              setEncerrando(false);
              toast.mostrar({ tipo: 'sucesso', mensagem: 'Conversa encerrada.' });
            },
            onError: (e) => {
              setEncerrando(false);
              aoErro(e);
            },
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  busca: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.lg },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md + espaco.xxs,
    paddingVertical: espaco.md,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
  textos: { flex: 1, gap: espaco.xxs },
  nome: { fontFamily: fontes.displayBold },
  previaForte: { fontFamily: fontes.interSemiBold },
  lado: { alignItems: 'flex-end', gap: espaco.xs, minWidth: 44 },
  contador: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: espaco.xs + espaco.xxs,
    borderRadius: raio.pilula,
    backgroundColor: cores.marcaEscura,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: MARGEM_TELA,
    paddingVertical: espaco.md,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
  acoes: {
    flexDirection: 'row',
    gap: espaco.sm,
    paddingHorizontal: MARGEM_TELA,
    paddingVertical: espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
});
