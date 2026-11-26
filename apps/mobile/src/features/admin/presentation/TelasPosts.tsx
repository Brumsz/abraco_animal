/**
 * Posts do feed (spec: "CRUD com upload de imagens (carrossel), publicar/despublicar").
 * As imagens vão na criação; depois, a API deixa editar só a legenda.
 */
import { Badge, Button, cores, espaco, Input, raio, Texto, useToast } from '@abraco/ui';
import { UPLOAD_IMAGENS } from '@abraco/shared';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraPlusIcon, HeartIcon, ImagesIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { FotoEscolhida } from '@/features/doacoes-animais/domain/esquema';
import { fotosDaGaleria } from '@/features/doacoes-animais/domain/fotos';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { mensagemDeErro } from '@/shared/erros';
import { dataCurta } from '@/shared/tempo';

import { useCriarPost, useGerenciarPost, usePostsEquipe } from '../data/conteudo';
import { LIMITES_CONTEUDO, problemaLegenda, publicacao } from '../domain/conteudo';
import { FolhaConfirmar, Secao } from './componentes';

const MAX_IMAGENS = UPLOAD_IMAGENS.arquivosPorEnvio;

export function TelaPostsEquipe() {
  const router = useRouter();
  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Novo post"
          icone={<PlusIcon size={18} color={cores.branco} weight="bold" />}
          onPress={() => {
            router.push('/admin/posts/novo');
          }}
          larguraTotal
        />
      }
    >
      <ListaPaginada
        consulta={usePostsEquipe()}
        rotuloCarregando="Carregando os posts"
        cabecalho={<CabecalhoTela titulo="Posts" subtitulo="O feed da tela inicial." />}
        vazio={
          <EstadoVazio
            icone={<ImagesIcon size={48} color={cores.marca} />}
            titulo="Nenhum post ainda"
          />
        }
        renderizar={(p) => (
          <CartaoPedido
            titulo={p.legenda.split('\n')[0] ?? ''}
            subtitulo={`${dataCurta(p.criadoEm)} · ${String(p.imagens.length)} ${p.imagens.length === 1 ? 'imagem' : 'imagens'} · ${String(p.totalCurtidas)} curtidas`}
            status={publicacao(p.publicado ?? false)}
            imagem={
              p.imagens[0] ? (
                <Image
                  source={{ uri: p.imagens[0].url }}
                  style={styles.preencher}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={styles.preencher} />
              )
            }
            aoPressionar={() => {
              router.push({ pathname: '/admin/posts/[id]', params: { id: p.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

/** /admin/posts/novo — imagens (1 a 10) e legenda. Nasce como rascunho. */
export function TelaNovoPost() {
  const router = useRouter();
  const toast = useToast();
  const criar = useCriarPost();
  const [imagens, setImagens] = useState<FotoEscolhida[]>([]);
  const [legenda, setLegenda] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const problema = problemaLegenda(legenda);
  const semImagem = imagens.length === 0;

  const escolher = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGENS - imagens.length,
      quality: 0.8,
    });
    if (r.canceled) return;
    const { fotos, grandes } = fotosDaGaleria(r.assets, imagens.length, MAX_IMAGENS);
    setImagens((atuais) => [...atuais, ...fotos]);
    if (grandes > 0) {
      toast.mostrar({
        tipo: 'erro',
        mensagem: 'Algumas imagens passam de 5 MB e ficaram de fora.',
      });
    }
  };

  const publicar = () => {
    setTentou(true);
    setErroGeral(null);
    if (problema || semImagem) return;
    criar.mutate(
      { legenda: legenda.trim(), imagens },
      {
        onSuccess: (p) => {
          toast.mostrar({ tipo: 'sucesso', mensagem: 'Post salvo como rascunho.' });
          router.replace({ pathname: '/admin/posts/[id]', params: { id: p.id } });
        },
        onError: (e) => {
          setErroGeral(mensagemDeErro(e));
        },
      },
    );
  };

  return (
    <TelaFormulario
      titulo="Novo post"
      subtitulo="Ele fica como rascunho até você publicar."
      rodape={
        <Button
          titulo="Salvar rascunho"
          carregando={criar.isPending}
          onPress={publicar}
          larguraTotal
        />
      }
    >
      <AvisoErro mensagem={erroGeral} />
      <View style={styles.grupo}>
        <Texto variante="label" cor={cores.tintaCorpo}>
          {`Imagens (${String(imagens.length)} de ${String(MAX_IMAGENS)})`}
        </Texto>
        <View style={styles.imagens}>
          {imagens.map((f, i) => (
            <View key={f.uri} style={styles.miniatura}>
              <Image
                source={{ uri: f.uri }}
                style={styles.imagem}
                accessibilityIgnoresInvertColors
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover imagem ${String(i + 1)}`}
                hitSlop={8}
                onPress={() => {
                  setImagens((atuais) => atuais.filter((x) => x.uri !== f.uri));
                }}
                style={styles.remover}
              >
                <XIcon size={14} color={cores.branco} weight="bold" />
              </Pressable>
            </View>
          ))}
          {imagens.length < MAX_IMAGENS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adicionar imagens"
              onPress={() => void escolher()}
              style={({ pressed }) => [styles.adicionar, { opacity: pressed ? 0.7 : 1 }]}
            >
              <CameraPlusIcon size={26} color={cores.marca} />
              <Texto variante="caption" cor={cores.marcaEscura}>
                Adicionar
              </Texto>
            </Pressable>
          ) : null}
        </View>
        {tentou && semImagem ? (
          <Texto variante="caption" cor={cores.erroTexto}>
            Escolha ao menos uma imagem.
          </Texto>
        ) : null}
      </View>
      <Input
        rotulo="Legenda"
        value={legenda}
        onChangeText={setLegenda}
        multiline
        maxLength={LIMITES_CONTEUDO.legenda}
        erro={tentou && problema ? problema : undefined}
      />
    </TelaFormulario>
  );
}

/** /admin/posts/[id] — legenda, publicação e remover. O post vem da lista da equipe. */
export function TelaPostEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lista = usePostsEquipe();
  const post = lista.data?.pages.flatMap((p) => p.itens).find((p) => p.id === id);

  if (!post) {
    return (
      <TelaComVoltar>
        {lista.isPending ? (
          <ActivityIndicator color={cores.marca} style={styles.carregando} />
        ) : (
          <EstadoVazio
            icone={<ImagesIcon size={48} color={cores.marca} />}
            titulo="Post não encontrado"
          />
        )}
      </TelaComVoltar>
    );
  }
  return <EdicaoPost key={post.id} post={post} />;
}

type Post = NonNullable<
  ReturnType<typeof usePostsEquipe>['data']
>['pages'][number]['itens'][number];

function EdicaoPost({ post: p }: { readonly post: Post }) {
  const router = useRouter();
  const toast = useToast();
  const { legenda, publicar, remover } = useGerenciarPost(p.id);
  const [texto, setTexto] = useState(p.legenda);
  const [tentou, setTentou] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const publicado = p.publicado ?? false;
  const problema = problemaLegenda(texto);
  const aoErro = (e: unknown) => {
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  return (
    <>
      <TelaFormulario
        titulo="Post"
        subtitulo={`Criado em ${dataCurta(p.criadoEm)}`}
        rodape={
          <Button
            titulo="Salvar legenda"
            carregando={legenda.isPending}
            disabled={texto.trim() === p.legenda}
            onPress={() => {
              setTentou(true);
              if (problema) return;
              legenda.mutate(texto.trim(), {
                onSuccess: () => {
                  toast.mostrar({ tipo: 'sucesso', mensagem: 'Legenda salva.' });
                },
                onError: aoErro,
              });
            }}
            larguraTotal
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carrossel}
          accessibilityLabel={`${String(p.imagens.length)} imagens do post`}
        >
          {p.imagens.map((f) => (
            <Image
              key={f.id}
              source={{ uri: f.url }}
              style={styles.grande}
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
        <View style={styles.curtidas}>
          <HeartIcon size={16} color={cores.marca} weight="fill" />
          <Texto variante="body2" cor={cores.tintaCorpo}>
            {`${String(p.totalCurtidas)} curtidas`}
          </Texto>
        </View>
        <Input
          rotulo="Legenda"
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={LIMITES_CONTEUDO.legenda}
          erro={tentou && problema ? problema : undefined}
        />
        <Secao titulo="Publicação">
          <Badge status={publicacao(publicado).badge} texto={publicacao(publicado).texto} />
          <Button
            titulo={publicado ? 'Despublicar' : 'Publicar no feed'}
            variante={publicado ? 'contorno' : 'primario'}
            carregando={publicar.isPending}
            onPress={() => {
              publicar.mutate(!publicado, {
                onSuccess: () => {
                  toast.mostrar({
                    tipo: 'sucesso',
                    mensagem: publicado ? 'Post despublicado.' : 'Post publicado!',
                  });
                },
                onError: aoErro,
              });
            }}
          />
        </Secao>
        <Button
          titulo="Remover post"
          variante="destrutivo"
          onPress={() => {
            setRemovendo(true);
          }}
        />
      </TelaFormulario>
      <FolhaConfirmar
        visivel={removendo}
        aoFechar={() => {
          setRemovendo(false);
        }}
        titulo="Remover este post?"
        texto="Ele sai do feed junto com as curtidas. Para só esconder, prefira despublicar."
        rotuloAcao="Remover post"
        carregando={remover.isPending}
        aoConfirmar={() => {
          remover.mutate(undefined, {
            onSuccess: () => {
              setRemovendo(false);
              toast.mostrar({ tipo: 'sucesso', mensagem: 'Post removido.' });
              router.back();
            },
            onError: (e) => {
              setRemovendo(false);
              aoErro(e);
            },
          });
        }}
      />
    </>
  );
}

const LADO = 96;

const styles = StyleSheet.create({
  carregando: { marginVertical: espaco.xxl },
  preencher: { flex: 1, backgroundColor: cores.marcaClara },
  grupo: { gap: espaco.sm },
  imagens: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm + 2 },
  miniatura: { width: LADO, height: LADO },
  imagem: { width: LADO, height: LADO, borderRadius: raio.md, backgroundColor: cores.fundoSuave },
  remover: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(28,25,23,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adicionar: {
    width: LADO,
    height: LADO,
    borderRadius: raio.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: cores.marca,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  carrossel: { gap: espaco.sm },
  grande: { width: 240, height: 240, borderRadius: raio.lg, backgroundColor: cores.fundoSuave },
  curtidas: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs },
});
