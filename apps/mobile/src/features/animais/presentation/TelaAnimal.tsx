import type { AnimalDetalhe } from '@abraco/api-client';
import {
  Badge,
  BotaoVoltar,
  BottomSheet,
  Button,
  cores,
  espaco,
  Input,
  raio,
  SkeletonLoader,
  Texto,
  useToast,
} from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HandHeartIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApadrinhar } from '@/features/apadrinhamentos/data/hooks';
import { useAnimal } from '@/features/animais/data/hooks';
import { idadeTexto, PORTES, SEXOS, TIPOS } from '@/features/animais/domain/rotulos';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { mensagemDeErro } from '@/shared/erros';

import { FotoAnimal } from './CartaoAnimal';

const ALTURA_FOTO = 340;

/** Detalhe do animal (sem protótipo: segue o visual das demais telas). */
export default function TelaAnimal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const consulta = useAnimal(id);
  const voltar = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/adotar');
  };

  if (!consulta.data) {
    return (
      <SafeAreaView style={styles.tela} edges={['top']}>
        <View style={styles.topoSolto}>
          <BotaoVoltar onPress={voltar} />
        </View>
        {consulta.isError ? (
          <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
        ) : (
          <View style={styles.carregando} accessible accessibilityLabel="Carregando animal">
            <SkeletonLoader altura={ALTURA_FOTO} raio={raio.xl} />
            <SkeletonLoader largura="60%" altura={32} />
            <SkeletonLoader altura={80} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const animal = consulta.data;
  return (
    <View style={styles.tela}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <Galeria animal={animal} />
        <View style={styles.corpo}>
          <View style={styles.titulo}>
            <Texto variante="titulo" accessibilityRole="header">
              {animal.nome}
            </Texto>
            <Texto variante="body1" cor={cores.tintaSuave}>
              {TIPOS[animal.tipo].singular} · {animal.raca}
            </Texto>
          </View>

          <View style={styles.fichas}>
            <Ficha rotulo="Idade" valor={idadeTexto(animal.idadeAprox)} />
            <Ficha rotulo="Sexo" valor={SEXOS[animal.sexo]} />
            <Ficha rotulo="Porte" valor={PORTES[animal.porte]} />
          </View>

          <View style={styles.selos}>
            {animal.vacinado ? <Badge status="APROVADA" texto="Vacinado" /> : null}
            {animal.castrado ? <Badge status="APROVADA" texto="Castrado" /> : null}
            {animal.totalPadrinhos > 0 ? (
              <Badge
                status="DESTAQUE"
                texto={`${String(animal.totalPadrinhos)} ${animal.totalPadrinhos === 1 ? 'padrinho' : 'padrinhos'}`}
              />
            ) : null}
          </View>

          <Secao titulo="Sobre" texto={animal.descricao} />
          <Secao titulo="História do resgate" texto={animal.historiaResgate} />
        </View>
      </ScrollView>

      <View style={[styles.voltarSobreFoto, { top: insets.top + espaco.xs }]}>
        <BotaoVoltar onPress={voltar} />
      </View>

      <Acoes animal={animal} />
    </View>
  );
}

function Galeria({ animal }: { readonly animal: AnimalDetalhe }) {
  const { width } = useWindowDimensions();
  const [atual, setAtual] = useState(0);
  const fotos = animal.fotos.length > 0 ? animal.fotos : [];

  if (fotos.length <= 1) {
    return (
      <View style={styles.galeria}>
        <FotoAnimal url={fotos[0]?.url ?? null} altura={ALTURA_FOTO} raio={0} />
      </View>
    );
  }
  return (
    <View style={styles.galeria}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setAtual(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        accessibilityLabel={`Fotos de ${animal.nome}`}
      >
        {fotos.map((f) => (
          <View key={f.id} style={{ width }}>
            <FotoAnimal url={f.url} altura={ALTURA_FOTO} raio={0} />
          </View>
        ))}
      </ScrollView>
      <View
        style={styles.pontos}
        accessibilityLabel={`Foto ${String(atual + 1)} de ${String(fotos.length)}`}
      >
        {fotos.map((f, i) => (
          <View key={f.id} style={[styles.ponto, i === atual ? styles.pontoAtivo : null]} />
        ))}
      </View>
    </View>
  );
}

function Ficha({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }) {
  return (
    <View style={styles.ficha} accessible accessibilityLabel={`${rotulo}: ${valor}`}>
      <Texto variante="caption" cor={cores.tintaSuave}>
        {rotulo}
      </Texto>
      <Texto variante="label" cor={cores.tinta} numberOfLines={2}>
        {valor}
      </Texto>
    </View>
  );
}

function Secao({ titulo, texto }: { readonly titulo: string; readonly texto: string }) {
  return (
    <View style={styles.secao}>
      <Texto variante="h2">{titulo}</Texto>
      <Texto variante="body1" cor={cores.tintaCorpo}>
        {texto}
      </Texto>
    </View>
  );
}

/** Rodapé fixo: apadrinhar (painel de confirmação) e adotar (aviso → formulário). */
function Acoes({ animal }: { readonly animal: AnimalDetalhe }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const apadrinhar = useApadrinhar();
  const [painel, setPainel] = useState(false);
  const [mensagem, setMensagem] = useState('');

  const confirmar = () => {
    apadrinhar.mutate(
      { animalId: animal.id, mensagemPadrinho: mensagem.trim() === '' ? null : mensagem.trim() },
      {
        onSuccess: () => {
          setPainel(false);
          setMensagem('');
          toast.mostrar({
            tipo: 'sucesso',
            mensagem: `Agora você é padrinho(a) de ${animal.nome}!`,
          });
        },
        onError: (erro) => {
          setPainel(false);
          toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(erro) });
        },
      },
    );
  };

  return (
    <View style={[styles.acoes, { paddingBottom: Math.max(insets.bottom, espaco.md) }]}>
      <Button
        titulo="Apadrinhar"
        variante="contorno"
        icone={<HandHeartIcon size={20} color={cores.tinta} />}
        onPress={() => {
          setPainel(true);
        }}
        style={styles.acao}
      />
      <Button
        titulo="Quero adotar"
        onPress={() => {
          router.push({ pathname: '/adocao/[animalId]', params: { animalId: animal.id } });
        }}
        style={styles.acao}
      />
      <BottomSheet
        visivel={painel}
        aoFechar={() => {
          setPainel(false);
        }}
        titulo={`Apadrinhar ${animal.nome}`}
        rodape={
          <Button
            titulo="Quero ser padrinho"
            carregando={apadrinhar.isPending}
            onPress={confirmar}
            larguraTotal
          />
        }
      >
        <Texto variante="body1" cor={cores.tintaCorpo}>
          Padrinhos acompanham a vida de {animal.nome} na ONG e ajudam a cuidar dele até a adoção. A
          equipe entra em contato para combinar como você quer ajudar.
        </Texto>
        <Input
          rotulo="Recado para a equipe (opcional)"
          value={mensagem}
          onChangeText={setMensagem}
          multiline
          maxLength={500}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topoSolto: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xs },
  carregando: { padding: MARGEM_TELA, gap: espaco.lg },
  galeria: { height: ALTURA_FOTO, backgroundColor: cores.fundoSuave },
  pontos: {
    position: 'absolute',
    bottom: espaco.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(28,25,23,0.35)',
  },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  pontoAtivo: { width: 22, backgroundColor: cores.branco },
  voltarSobreFoto: { position: 'absolute', left: MARGEM_TELA },
  corpo: {
    marginTop: -raio.xl,
    borderTopLeftRadius: raio.xl,
    borderTopRightRadius: raio.xl,
    backgroundColor: cores.fundo,
    paddingHorizontal: MARGEM_TELA,
    paddingTop: espaco.xl,
    gap: espaco.lg,
  },
  titulo: { gap: espaco.xs },
  fichas: { flexDirection: 'row', gap: espaco.sm + 2 },
  ficha: {
    flex: 1,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.linha,
    borderRadius: raio.md,
    padding: espaco.md,
    gap: 2,
  },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  secao: { gap: espaco.sm },
  acoes: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: espaco.md,
    paddingHorizontal: MARGEM_TELA,
    paddingTop: espaco.md,
    backgroundColor: cores.fundo,
    borderTopWidth: 1,
    borderTopColor: cores.linha,
  },
  acao: { flex: 1 },
});
