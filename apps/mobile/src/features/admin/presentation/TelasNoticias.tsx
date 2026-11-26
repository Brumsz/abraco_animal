/**
 * Gestão de notícias (spec: "CRUD com editor de texto rico (opcional: Markdown),
 * publicar/despublicar"). Texto em Markdown com pré-visualização — o mesmo
 * renderizador do Jornal, então a equipe vê exatamente o que o público verá.
 */
import type { Resposta } from '@abraco/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Button, Chip, cores, espaco, raio, Texto, useToast } from '@abraco/ui';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NewspaperIcon, PlusIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { fotosDaGaleria } from '@/features/doacoes-animais/domain/fotos';
import { TextoMarkdown } from '@/features/noticias/presentation/TextoMarkdown';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';
import { dataCurta } from '@/shared/tempo';

import {
  useGerenciarNoticia,
  useNoticiaEquipe,
  useNoticiasEquipe,
  useSalvarNoticia,
  type FiltroNoticias,
} from '../data/conteudo';
import { esquemaNoticia, LIMITES_CONTEUDO, publicacao, type FormNoticia } from '../domain/conteudo';
import { FiltrosStatus, FolhaConfirmar, Secao } from './componentes';

type Noticia = Resposta<'/v1/admin/noticias/{id}', 'get'>;

const FILTROS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'publicadas', rotulo: 'Publicadas' },
  { valor: 'rascunhos', rotulo: 'Rascunhos' },
] as const satisfies readonly { valor: FiltroNoticias; rotulo: string }[];

export function TelaNoticiasEquipe() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroNoticias>('todas');
  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Nova notícia"
          icone={<PlusIcon size={18} color={cores.branco} weight="bold" />}
          onPress={() => {
            router.push('/admin/noticias/nova');
          }}
          larguraTotal
        />
      }
    >
      <ListaPaginada
        consulta={useNoticiasEquipe(filtro)}
        rotuloCarregando="Carregando as notícias"
        cabecalho={
          <>
            <CabecalhoTela titulo="Notícias" subtitulo="O Jornal Abraço Animal." />
            <FiltrosStatus
              rotulo="Publicação"
              filtros={FILTROS}
              valor={filtro}
              aoMudar={setFiltro}
            />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<NewspaperIcon size={48} color={cores.marca} />}
            titulo="Nenhuma notícia aqui"
          />
        }
        renderizar={(n) => (
          <CartaoPedido
            titulo={n.titulo}
            subtitulo={`Atualizada em ${dataCurta(n.atualizadoEm)}`}
            status={publicacao(n.publicado)}
            observacao={n.resumo}
            imagem={<Miniatura url={n.imagem} />}
            aoPressionar={() => {
              router.push({ pathname: '/admin/noticias/[id]', params: { id: n.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

function Miniatura({ url }: { readonly url: string | null }) {
  if (!url) {
    return (
      <View style={styles.semImagem}>
        <NewspaperIcon size={32} color={cores.marca} />
      </View>
    );
  }
  return <Image source={{ uri: url }} style={styles.preencher} accessibilityIgnoresInvertColors />;
}

/** /admin/noticias/nova — salva como rascunho e abre a edição (capa e publicação). */
export function TelaNovaNoticia() {
  const router = useRouter();
  const salvar = useSalvarNoticia(null);
  return (
    <EditorNoticia
      titulo="Nova notícia"
      subtitulo="Ela fica como rascunho até você publicar."
      valores={{ titulo: '', resumo: '', conteudo: '' }}
      rotuloSalvar="Salvar rascunho"
      salvando={salvar.isPending}
      salvar={async (d) => {
        const n = await salvar.mutateAsync(d);
        router.replace({ pathname: '/admin/noticias/[id]', params: { id: n.id } });
      }}
    />
  );
}

/** /admin/noticias/[id] — editar, capa, publicar/despublicar e remover. */
export function TelaNoticiaEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useNoticiaEquipe(id);
  if (consulta.isPending) {
    return (
      <TelaComVoltar>
        <ActivityIndicator color={cores.marca} style={styles.carregando} />
      </TelaComVoltar>
    );
  }
  if (consulta.isError) {
    return (
      <TelaComVoltar>
        <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
      </TelaComVoltar>
    );
  }
  return <EdicaoNoticia noticia={consulta.data} />;
}

function EdicaoNoticia({ noticia: n }: { readonly noticia: Noticia }) {
  const router = useRouter();
  const toast = useToast();
  const salvar = useSalvarNoticia(n.id);
  const { publicar, capa, remover } = useGerenciarNoticia(n.id);
  const [removendo, setRemovendo] = useState(false);
  const aoErro = (e: unknown) => {
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  const escolherCapa = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled) return;
    const { fotos, grandes } = fotosDaGaleria(r.assets, 0, 1);
    const imagem = fotos[0];
    if (grandes > 0 || !imagem) {
      toast.mostrar({ tipo: 'erro', mensagem: 'A imagem passa de 5 MB.' });
      return;
    }
    capa.mutate(imagem, { onError: aoErro });
  };

  return (
    <>
      <EditorNoticia
        titulo="Editar notícia"
        subtitulo={`Endereço: /jornal/${n.slug}`}
        valores={{ titulo: n.titulo, resumo: n.resumo, conteudo: n.conteudo ?? '' }}
        rotuloSalvar="Salvar alterações"
        salvando={salvar.isPending}
        salvar={async (d) => {
          await salvar.mutateAsync(d);
          toast.mostrar({ tipo: 'sucesso', mensagem: 'Notícia salva.' });
        }}
        extra={
          <>
            <Secao titulo="Publicação">
              <Badge status={publicacao(n.publicado).badge} texto={publicacao(n.publicado).texto} />
              <Texto variante="body2" cor={cores.tintaSuave}>
                {n.publicado
                  ? 'Aparece no Jornal do app para todo mundo.'
                  : 'Só a equipe vê. Publique quando estiver pronta.'}
              </Texto>
              <Button
                titulo={n.publicado ? 'Despublicar' : 'Publicar no Jornal'}
                variante={n.publicado ? 'contorno' : 'primario'}
                carregando={publicar.isPending}
                onPress={() => {
                  publicar.mutate(!n.publicado, {
                    onSuccess: () => {
                      toast.mostrar({
                        tipo: 'sucesso',
                        mensagem: n.publicado ? 'Notícia despublicada.' : 'Notícia publicada!',
                      });
                    },
                    onError: aoErro,
                  });
                }}
              />
            </Secao>

            <Secao titulo="Imagem de capa">
              {n.imagem ? (
                <Image
                  source={{ uri: n.imagem }}
                  style={styles.capa}
                  accessibilityLabel="Capa atual"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Texto variante="body2" cor={cores.tintaSuave}>
                  Sem capa. A notícia aparece só com o texto.
                </Texto>
              )}
              <Button
                titulo={n.imagem ? 'Trocar imagem' : 'Escolher imagem'}
                variante="secundario"
                carregando={capa.isPending}
                onPress={() => void escolherCapa()}
              />
              {n.imagem ? (
                <Button
                  titulo="Tirar a capa"
                  variante="ghost"
                  disabled={capa.isPending}
                  onPress={() => {
                    capa.mutate(null, { onError: aoErro });
                  }}
                />
              ) : null}
            </Secao>

            <Button
              titulo="Remover notícia"
              variante="destrutivo"
              onPress={() => {
                setRemovendo(true);
              }}
            />
          </>
        }
      />
      <FolhaConfirmar
        visivel={removendo}
        aoFechar={() => {
          setRemovendo(false);
        }}
        titulo="Remover esta notícia?"
        texto="Ela sai do Jornal e da lista da equipe. Para só esconder, prefira despublicar."
        rotuloAcao="Remover notícia"
        carregando={remover.isPending}
        aoConfirmar={() => {
          remover.mutate(undefined, {
            onSuccess: () => {
              setRemovendo(false);
              toast.mostrar({ tipo: 'sucesso', mensagem: 'Notícia removida.' });
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

function EditorNoticia({
  titulo,
  subtitulo,
  valores,
  rotuloSalvar,
  salvando,
  salvar,
  extra,
}: {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly valores: FormNoticia;
  readonly rotuloSalvar: string;
  readonly salvando: boolean;
  readonly salvar: (d: ReturnType<typeof esquemaNoticia.parse>) => Promise<void>;
  readonly extra?: React.ReactNode;
}) {
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [previa, setPrevia] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormNoticia, unknown, ReturnType<typeof esquemaNoticia.parse>>({
    resolver: zodResolver(esquemaNoticia),
    defaultValues: valores,
    mode: 'onTouched',
  });
  const conteudo = useWatch({ control, name: 'conteudo' });

  const enviar = handleSubmit(async (d) => {
    setErroGeral(null);
    try {
      await salvar(d);
    } catch (erro) {
      const campos = ['titulo', 'resumo', 'conteudo'] as const;
      const aplicou = aplicarErrosDeCampo(erro, campos, (c, m) => {
        setError(c, { message: m });
      });
      if (!aplicou) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaFormulario
      titulo={titulo}
      subtitulo={subtitulo}
      rodape={
        <Button
          titulo={rotuloSalvar}
          carregando={salvando}
          onPress={() => void enviar()}
          larguraTotal
        />
      }
    >
      <AvisoErro mensagem={erroGeral} />
      <CampoForm
        control={control}
        nome="titulo"
        rotulo="Título"
        erro={errors.titulo?.message}
        maxLength={LIMITES_CONTEUDO.titulo}
      />
      <CampoForm
        control={control}
        nome="resumo"
        rotulo="Resumo"
        ajuda="Aparece na lista do Jornal."
        erro={errors.resumo?.message}
        multiline
        maxLength={LIMITES_CONTEUDO.resumo}
      />
      <View style={styles.abas} accessibilityRole="radiogroup" accessibilityLabel="Modo do texto">
        <Chip
          rotulo="Escrever"
          selecionado={!previa}
          onPress={() => {
            setPrevia(false);
          }}
        />
        <Chip
          rotulo="Pré-visualizar"
          selecionado={previa}
          onPress={() => {
            setPrevia(true);
          }}
        />
      </View>
      {previa ? (
        <View style={styles.previa}>
          {conteudo.trim() ? (
            <TextoMarkdown conteudo={conteudo} />
          ) : (
            <Texto variante="body2" cor={cores.tintaSuave}>
              Nada escrito ainda.
            </Texto>
          )}
        </View>
      ) : (
        <CampoForm
          control={control}
          nome="conteudo"
          rotulo="Texto da notícia"
          ajuda="Markdown: # Título, **negrito**, *itálico*, - lista, [link](https://…)"
          erro={errors.conteudo?.message}
          multiline
          maxLength={LIMITES_CONTEUDO.conteudo}
        />
      )}
      {extra}
    </TelaFormulario>
  );
}

const styles = StyleSheet.create({
  carregando: { marginVertical: espaco.xxl },
  preencher: { flex: 1 },
  semImagem: {
    flex: 1,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abas: { flexDirection: 'row', gap: espaco.sm },
  previa: {
    padding: espaco.lg,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    minHeight: 120,
  },
  capa: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: raio.md,
    backgroundColor: cores.fundoSuave,
  },
});
