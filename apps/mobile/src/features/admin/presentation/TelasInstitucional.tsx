/**
 * Conteúdo institucional: as seções do Perfil da ONG (Sobre nós, Fundação,
 * Fundadores) e o FAQ (criar, editar, remover e ordenar). Também o atalho
 * "Conteúdo" que reúne as quatro gestões.
 */
import type { SecaoPerfilOng } from '@abraco/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  BottomSheet,
  Button,
  CaixaSelecao,
  Chip,
  cores,
  espaco,
  fontes,
  Input,
  Texto,
  useToast,
} from '@abraco/ui';
import { useRouter } from 'expo-router';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImagesIcon,
  InfoIcon,
  NewspaperIcon,
  PlusIcon,
  QuestionIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { EstadoErro, EstadoVazio } from '@/shared/componentes/EstadoTela';
import { estiloChips } from '@/shared/componentes/GrupoEscolha';
import { ListaOpcoes } from '@/shared/componentes/ListaOpcoes';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useFaqEquipe, useGerenciarFaq, useSalvarSecao, useSecoesEquipe } from '../data/conteudo';
import { moverItem } from '../domain/animais';
import {
  esquemaFaq,
  esquemaSecao,
  LIMITES_CONTEUDO,
  SECOES,
  valoresDaSecao,
  type FormFaq,
  type FormSecao,
} from '../domain/conteudo';

/** /admin/conteudo — as quatro gestões de conteúdo. */
export function TelaConteudo() {
  const router = useRouter();
  return (
    <TelaComVoltar>
      <ScrollView contentContainerStyle={styles.rolagem}>
        <CabecalhoTela titulo="Conteúdo" subtitulo="O que o público lê no app." />
        <View style={styles.blocos}>
          <ListaOpcoes
            opcoes={[
              {
                rotulo: 'Notícias',
                Icone: NewspaperIcon,
                aoPressionar: () => {
                  router.push('/admin/noticias');
                },
              },
              {
                rotulo: 'Posts do feed',
                Icone: ImagesIcon,
                aoPressionar: () => {
                  router.push('/admin/posts');
                },
              },
              {
                rotulo: 'Perfil da ONG',
                Icone: InfoIcon,
                aoPressionar: () => {
                  router.push('/admin/perfil-ong');
                },
              },
              {
                rotulo: 'Perguntas frequentes',
                Icone: QuestionIcon,
                aoPressionar: () => {
                  router.push('/admin/faq');
                },
              },
            ].map((o) => ({ ...o, iconeEmCirculo: true }))}
          />
        </View>
      </ScrollView>
    </TelaComVoltar>
  );
}

// ── Perfil da ONG ───────────────────────────────────────────────────────

export function TelaPerfilOngEquipe() {
  const consulta = useSecoesEquipe();
  const [secao, setSecao] = useState<SecaoPerfilOng>('SOBRE_NOS');

  if (consulta.isPending || consulta.isError) {
    return (
      <TelaComVoltar>
        {consulta.isPending ? (
          <ActivityIndicator color={cores.marca} style={styles.carregando} />
        ) : (
          <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
        )}
      </TelaComVoltar>
    );
  }

  return (
    <EditorSecao
      // Trocar de aba remonta o formulário com os valores daquela seção.
      key={secao}
      secao={secao}
      valores={valoresDaSecao(secao, consulta.data)}
      abas={
        <View
          style={estiloChips.linha}
          accessibilityRole="radiogroup"
          accessibilityLabel="Seção do perfil"
        >
          {SECOES.map((s) => (
            <Chip
              key={s.valor}
              rotulo={s.rotulo}
              selecionado={s.valor === secao}
              onPress={() => {
                setSecao(s.valor);
              }}
            />
          ))}
        </View>
      }
    />
  );
}

function EditorSecao({
  secao,
  valores,
  abas,
}: {
  readonly secao: SecaoPerfilOng;
  readonly valores: FormSecao;
  readonly abas: React.ReactNode;
}) {
  const toast = useToast();
  const salvar = useSalvarSecao(secao);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormSecao, unknown, ReturnType<typeof esquemaSecao.parse>>({
    resolver: zodResolver(esquemaSecao),
    defaultValues: valores,
    mode: 'onTouched',
  });

  const enviar = handleSubmit(async (d) => {
    setErroGeral(null);
    try {
      await salvar.mutateAsync(d);
      toast.mostrar({ tipo: 'sucesso', mensagem: 'Seção salva.' });
    } catch (erro) {
      const aplicou = aplicarErrosDeCampo(erro, ['titulo', 'conteudo'] as const, (c, m) => {
        setError(c, { message: m });
      });
      if (!aplicou) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaFormulario
      titulo="Perfil da ONG"
      subtitulo="Textos da tela Sobre a ONG. Aceitam Markdown."
      rodape={
        <Button
          titulo="Salvar seção"
          carregando={salvar.isPending}
          onPress={() => void enviar()}
          larguraTotal
        />
      }
    >
      {abas}
      <AvisoErro mensagem={erroGeral} />
      <CampoForm
        control={control}
        nome="titulo"
        rotulo="Título"
        erro={errors.titulo?.message}
        maxLength={LIMITES_CONTEUDO.tituloSecao}
      />
      <CampoForm
        control={control}
        nome="conteudo"
        rotulo="Texto"
        ajuda="Markdown: **negrito**, *itálico*, - lista, [link](https://…)"
        erro={errors.conteudo?.message}
        multiline
        maxLength={LIMITES_CONTEUDO.conteudoSecao}
      />
      <Controller
        control={control}
        name="publicado"
        render={({ field }) => (
          <CaixaSelecao rotulo="Mostrar no app" marcada={field.value} onChange={field.onChange} />
        )}
      />
    </TelaFormulario>
  );
}

// ── FAQ ─────────────────────────────────────────────────────────────────

type Pergunta = NonNullable<ReturnType<typeof useFaqEquipe>['data']>[number];

export function TelaFaqEquipe() {
  const toast = useToast();
  const consulta = useFaqEquipe();
  const { reordenar } = useGerenciarFaq();
  const [editando, setEditando] = useState<Pergunta | 'nova' | null>(null);
  const perguntas = [...(consulta.data ?? [])].sort((a, b) => a.ordem - b.ordem);
  const ids = perguntas.map((p) => p.id);

  let corpo;
  if (consulta.isPending) {
    corpo = <ActivityIndicator color={cores.marca} style={styles.carregando} />;
  } else if (consulta.isError) {
    corpo = <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  } else if (perguntas.length === 0) {
    corpo = (
      <EstadoVazio
        icone={<QuestionIcon size={48} color={cores.marca} />}
        titulo="Nenhuma pergunta ainda"
        subtitulo="As perguntas aparecem na aba Dúvidas do Perfil da ONG."
      />
    );
  } else {
    corpo = (
      <View style={styles.blocos}>
        {perguntas.map((p, i) => (
          <View key={p.id} style={styles.pergunta}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Editar: ${p.pergunta}${p.publicado ? '' : ', rascunho'}`}
              onPress={() => {
                setEditando(p);
              }}
              style={({ pressed }) => [styles.textoPergunta, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Texto variante="body1" cor={cores.tinta} style={styles.negrito}>
                {p.pergunta}
              </Texto>
              <Texto variante="body2" cor={cores.tintaSuave} numberOfLines={2}>
                {p.resposta}
              </Texto>
              {!p.publicado ? <Badge status="NEUTRO" texto="Rascunho" /> : null}
            </Pressable>
            <View style={styles.setas}>
              <Seta
                rotulo={`Subir: ${p.pergunta}`}
                desabilitada={i === 0 || reordenar.isPending}
                aoPressionar={() => {
                  reordenar.mutate(moverItem(ids, p.id, -1), {
                    onError: (e) => {
                      toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
                    },
                  });
                }}
              >
                <ArrowUpIcon size={18} color={cores.tinta} />
              </Seta>
              <Seta
                rotulo={`Descer: ${p.pergunta}`}
                desabilitada={i === perguntas.length - 1 || reordenar.isPending}
                aoPressionar={() => {
                  reordenar.mutate(moverItem(ids, p.id, 1), {
                    onError: (e) => {
                      toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
                    },
                  });
                }}
              >
                <ArrowDownIcon size={18} color={cores.tinta} />
              </Seta>
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <>
      <TelaComVoltar
        rodape={
          <Button
            titulo="Nova pergunta"
            icone={<PlusIcon size={18} color={cores.branco} weight="bold" />}
            onPress={() => {
              setEditando('nova');
            }}
            larguraTotal
          />
        }
      >
        <ScrollView contentContainerStyle={styles.rolagem}>
          <CabecalhoTela
            titulo="Perguntas frequentes"
            subtitulo="Use as setas para mudar a ordem."
          />
          {corpo}
        </ScrollView>
      </TelaComVoltar>
      {editando ? (
        <FolhaPergunta
          pergunta={editando === 'nova' ? null : editando}
          aoFechar={() => {
            setEditando(null);
          }}
        />
      ) : null}
    </>
  );
}

function Seta({
  rotulo,
  desabilitada,
  aoPressionar,
  children,
}: {
  readonly rotulo: string;
  readonly desabilitada: boolean;
  readonly aoPressionar: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desabilitada }}
      disabled={desabilitada}
      onPress={aoPressionar}
      style={[styles.seta, { opacity: desabilitada ? 0.3 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

function FolhaPergunta({
  pergunta,
  aoFechar,
}: {
  readonly pergunta: Pergunta | null;
  readonly aoFechar: () => void;
}) {
  const toast = useToast();
  const { salvar, remover } = useGerenciarFaq();
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormFaq, unknown, ReturnType<typeof esquemaFaq.parse>>({
    resolver: zodResolver(esquemaFaq),
    defaultValues: pergunta
      ? { pergunta: pergunta.pergunta, resposta: pergunta.resposta, publicado: pergunta.publicado }
      : { pergunta: '', resposta: '', publicado: true },
  });
  const aoErro = (e: unknown) => {
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  const enviar = handleSubmit((d) => {
    salvar.mutate(
      { id: pergunta?.id ?? null, ...d },
      {
        onSuccess: () => {
          toast.mostrar({ tipo: 'sucesso', mensagem: 'Pergunta salva.' });
          aoFechar();
        },
        onError: aoErro,
      },
    );
  });

  return (
    <BottomSheet
      visivel
      aoFechar={aoFechar}
      titulo={pergunta ? 'Editar pergunta' : 'Nova pergunta'}
      rodape={
        <View style={styles.acoes}>
          <Button
            titulo="Salvar pergunta"
            carregando={salvar.isPending}
            onPress={() => void enviar()}
            larguraTotal
          />
          {pergunta ? (
            <Button
              titulo={confirmandoRemocao ? 'Toque de novo para remover' : 'Remover pergunta'}
              variante={confirmandoRemocao ? 'destrutivo' : 'ghost'}
              carregando={remover.isPending}
              onPress={() => {
                // Dois toques: confirmar sem abrir outra folha por cima desta.
                if (!confirmandoRemocao) {
                  setConfirmandoRemocao(true);
                  return;
                }
                remover.mutate(pergunta.id, {
                  onSuccess: () => {
                    toast.mostrar({ tipo: 'sucesso', mensagem: 'Pergunta removida.' });
                    aoFechar();
                  },
                  onError: aoErro,
                });
              }}
              larguraTotal
            />
          ) : null}
        </View>
      }
    >
      <CampoForm
        control={control}
        nome="pergunta"
        rotulo="Pergunta"
        erro={errors.pergunta?.message}
        maxLength={LIMITES_CONTEUDO.pergunta}
      />
      <Controller
        control={control}
        name="resposta"
        render={({ field }) => (
          <Input
            rotulo="Resposta"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            multiline
            maxLength={LIMITES_CONTEUDO.resposta}
            erro={errors.resposta?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="publicado"
        render={({ field }) => (
          <CaixaSelecao rotulo="Mostrar no app" marcada={field.value} onChange={field.onChange}>
            <Texto variante="caption" cor={cores.tintaSuave}>
              Desmarcada, a pergunta fica como rascunho (só a equipe vê).
            </Texto>
          </CaixaSelecao>
        )}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  rolagem: { paddingBottom: espaco.xl },
  blocos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: espaco.md },
  carregando: { marginVertical: espaco.xxl },
  pergunta: {
    flexDirection: 'row',
    gap: espaco.sm,
    padding: espaco.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  textoPergunta: { flex: 1, gap: espaco.xs, alignItems: 'flex-start' },
  negrito: { fontFamily: fontes.interSemiBold },
  setas: { justifyContent: 'center', gap: espaco.xs },
  seta: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: cores.linha,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acoes: { gap: espaco.sm },
});
