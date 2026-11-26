/**
 * Gestão de animais (spec): lista com todos os status e a ficha da equipe —
 * status manual, fotos (enviar, remover, reordenar), editar e remover.
 */
import type { AnimalDetalhe, Foto } from '@abraco/api-client';
import type { StatusAnimal } from '@abraco/shared';
import { UPLOAD_IMAGENS } from '@abraco/shared';
import { Badge, Button, Chip, cores, espaco, Input, raio, Texto, useToast } from '@abraco/ui';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraPlusIcon,
  MagnifyingGlassIcon,
  PawPrintIcon,
  PlusIcon,
  XIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useAnimais, useAnimal } from '@/features/animais/data/hooks';
import { idadeTexto, PORTES, SEXOS, TIPOS } from '@/features/animais/domain/rotulos';
import { FotoAnimal } from '@/features/animais/presentation/CartaoAnimal';
import { fotosDaGaleria } from '@/features/doacoes-animais/domain/fotos';
import { useAtrasado } from '@/shared/atraso';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { estiloChips } from '@/shared/componentes/GrupoEscolha';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { mensagemDeErro } from '@/shared/erros';

import { useAlterarStatusAnimal, useFotosAnimal, useRemoverAnimal } from '../data/cadastros';
import { FILTROS_ANIMAL, moverItem, STATUS_ANIMAL_EQUIPE, STATUS_MANUAIS } from '../domain/animais';
import { Campo, FiltrosStatus, FolhaConfirmar, Secao, TelaDetalhe } from './componentes';

const MAX_FOTOS = UPLOAD_IMAGENS.fotosPorAnimal;

export function TelaAnimaisEquipe() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusAnimal | null>(null);
  const [busca, setBusca] = useState('');
  const q = useAtrasado(busca.trim());

  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Cadastrar animal"
          icone={<PlusIcon size={18} color={cores.branco} weight="bold" />}
          onPress={() => {
            router.push('/admin/animais/novo');
          }}
          larguraTotal
        />
      }
    >
      <ListaPaginada
        consulta={useAnimais({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}
        rotuloCarregando="Carregando os animais"
        cabecalho={
          <>
            <CabecalhoTela
              titulo="Animais"
              subtitulo="Todos os animais da ONG, em qualquer status."
            />
            <View style={styles.busca}>
              <Input
                rotulo="Buscar por nome ou raça"
                rotuloOculto
                placeholder="Buscar por nome ou raça"
                value={busca}
                onChangeText={setBusca}
                icone={(cor) => <MagnifyingGlassIcon size={20} color={cor} />}
                autoCorrect={false}
              />
            </View>
            <FiltrosStatus
              rotulo="Status do animal"
              filtros={FILTROS_ANIMAL}
              valor={status}
              aoMudar={setStatus}
            />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<PawPrintIcon size={48} color={cores.marca} />}
            titulo={q ? 'Nenhum animal encontrado' : 'Nenhum animal aqui'}
          />
        }
        renderizar={(a) => (
          <CartaoPedido
            titulo={a.nome}
            subtitulo={`${TIPOS[a.tipo].singular} · ${a.raca}`}
            status={STATUS_ANIMAL_EQUIPE[a.status]}
            imagem={<FotoAnimal url={a.fotoCapa?.url ?? null} altura={72} raio={14} />}
            aoPressionar={() => {
              router.push({ pathname: '/admin/animais/[id]', params: { id: a.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

export function TelaAnimalEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const consulta = useAnimal(id);
  const remover = useRemoverAnimal(id);
  const [removendo, setRemovendo] = useState(false);
  const a = consulta.data;

  return (
    <TelaDetalhe
      titulo={a ? a.nome : 'Animal'}
      {...(a ? { subtitulo: `${TIPOS[a.tipo].singular} · ${a.raca}` } : {})}
      consulta={consulta}
      folhas={
        a ? (
          <FolhaConfirmar
            visivel={removendo}
            aoFechar={() => {
              setRemovendo(false);
            }}
            titulo={`Remover ${a.nome}?`}
            texto="A ficha sai do app (adoções e doações antigas continuam no histórico). Para só tirar da vitrine, prefira o status Indisponível."
            rotuloAcao="Remover animal"
            carregando={remover.isPending}
            aoConfirmar={() => {
              remover.mutate(undefined, {
                onSuccess: () => {
                  setRemovendo(false);
                  toast.mostrar({ tipo: 'sucesso', mensagem: `${a.nome} foi removido.` });
                  router.back();
                },
                onError: (e) => {
                  setRemovendo(false);
                  toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
                },
              });
            }}
          />
        ) : null
      }
    >
      {a ? (
        <>
          <SecaoStatus animal={a} />
          <SecaoFotos animal={a} />
          <Secao titulo="Ficha">
            <Campo
              rotulo="Idade, sexo e porte"
              valor={`${idadeTexto(a.idadeAprox)} · ${SEXOS[a.sexo]} · ${PORTES[a.porte]}`}
            />
            <Campo
              rotulo="Saúde"
              valor={`${a.vacinado ? 'Vacinado' : 'Não vacinado'} · ${a.castrado ? 'Castrado' : 'Não castrado'}`}
            />
            <Campo rotulo="Padrinhos" valor={String(a.totalPadrinhos)} />
            <Button
              titulo="Editar ficha"
              variante="secundario"
              onPress={() => {
                router.push({ pathname: '/admin/animais/[id]/editar', params: { id: a.id } });
              }}
            />
            <Button
              titulo="Ver como no app"
              variante="ghost"
              onPress={() => {
                router.push({ pathname: '/animal/[id]', params: { id: a.id } });
              }}
            />
          </Secao>
          <Button
            titulo="Remover animal"
            variante="destrutivo"
            onPress={() => {
              setRemovendo(true);
            }}
          />
        </>
      ) : null}
    </TelaDetalhe>
  );
}

function SecaoStatus({ animal: a }: { readonly animal: AnimalDetalhe }) {
  const toast = useToast();
  const alterar = useAlterarStatusAnimal(a.id);
  return (
    <Secao titulo="Status">
      <Badge
        status={STATUS_ANIMAL_EQUIPE[a.status].badge}
        texto={STATUS_ANIMAL_EQUIPE[a.status].texto}
      />
      {a.status === 'ADOTADO' ? (
        <Texto variante="body2" cor={cores.tintaSuave}>
          Adotado pela aprovação de uma adoção. Se o animal voltar para a ONG, escolha outro status.
        </Texto>
      ) : null}
      <View
        style={estiloChips.linha}
        accessibilityRole="radiogroup"
        accessibilityLabel="Mudar status"
      >
        {STATUS_MANUAIS.map((s) => (
          <Chip
            key={s}
            rotulo={STATUS_ANIMAL_EQUIPE[s].texto}
            selecionado={a.status === s}
            onPress={() => {
              if (a.status === s || alterar.isPending) return;
              alterar.mutate(s, {
                onSuccess: () => {
                  toast.mostrar({
                    tipo: 'sucesso',
                    mensagem: `Status: ${STATUS_ANIMAL_EQUIPE[s].texto}.`,
                  });
                },
                onError: (e) => {
                  toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
                },
              });
            }}
          />
        ))}
      </View>
    </Secao>
  );
}

const ordenadas = (fotos: readonly Foto[]) => [...fotos].sort((x, y) => x.ordem - y.ordem);

/**
 * Fotos: a primeira é a capa. Reordenar com setas (acessível; arrastar exigiria
 * uma biblioteca de gestos a mais só para isto).
 */
function SecaoFotos({ animal: a }: { readonly animal: AnimalDetalhe }) {
  const toast = useToast();
  const { enviar, reordenar, remover } = useFotosAnimal(a.id);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const fotos = ordenadas(a.fotos);
  const ids = fotos.map((f) => f.id);
  const ocupado = enviar.isPending || reordenar.isPending || remover.isPending;
  const erro = (e: unknown) => {
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  const adicionar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_FOTOS - fotos.length,
      quality: 0.8,
    });
    if (r.canceled) return;
    const { fotos: novas, grandes } = fotosDaGaleria(r.assets, fotos.length, MAX_FOTOS);
    if (grandes > 0) {
      toast.mostrar({ tipo: 'erro', mensagem: 'Algumas fotos passam de 5 MB e ficaram de fora.' });
    }
    if (novas.length === 0) return;
    enviar.mutate(novas, {
      onSuccess: () => {
        toast.mostrar({ tipo: 'sucesso', mensagem: 'Fotos enviadas.' });
      },
      onError: erro,
    });
  };

  const mover = (id: string, direcao: -1 | 1) => {
    reordenar.mutate(moverItem(ids, id, direcao), { onError: erro });
  };

  return (
    <Secao titulo={`Fotos (${String(fotos.length)} de ${String(MAX_FOTOS)})`}>
      {fotos.length === 0 ? (
        <Texto variante="body2" cor={cores.tintaSuave}>
          Sem fotos, o animal aparece com um desenho de patinha. A primeira foto é a capa.
        </Texto>
      ) : null}
      <View style={styles.fotos}>
        {fotos.map((f, i) => (
          <View key={f.id} style={styles.miniatura}>
            <Image
              source={{ uri: f.url }}
              style={styles.imagem}
              accessibilityLabel={`Foto ${String(i + 1)}${i === 0 ? ', capa' : ''}`}
              accessibilityIgnoresInvertColors
            />
            {i === 0 ? (
              <View style={styles.capa}>
                <Texto variante="caption" cor={cores.branco}>
                  Capa
                </Texto>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover foto ${String(i + 1)}`}
              hitSlop={8}
              disabled={ocupado}
              onPress={() => {
                setRemovendo(f.id);
              }}
              style={styles.remover}
            >
              <XIcon size={14} color={cores.branco} weight="bold" />
            </Pressable>
            <View style={styles.setas}>
              <BotaoSeta
                rotulo={`Mover foto ${String(i + 1)} para a frente`}
                desabilitado={i === 0 || ocupado}
                aoPressionar={() => {
                  mover(f.id, -1);
                }}
              >
                <ArrowLeftIcon size={14} color={cores.tinta} weight="bold" />
              </BotaoSeta>
              <BotaoSeta
                rotulo={`Mover foto ${String(i + 1)} para trás`}
                desabilitado={i === fotos.length - 1 || ocupado}
                aoPressionar={() => {
                  mover(f.id, 1);
                }}
              >
                <ArrowRightIcon size={14} color={cores.tinta} weight="bold" />
              </BotaoSeta>
            </View>
          </View>
        ))}
        {fotos.length < MAX_FOTOS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adicionar fotos"
            accessibilityState={{ busy: enviar.isPending }}
            disabled={ocupado}
            onPress={() => void adicionar()}
            style={({ pressed }) => [styles.adicionar, { opacity: pressed || ocupado ? 0.6 : 1 }]}
          >
            <CameraPlusIcon size={26} color={cores.marca} />
            <Texto variante="caption" cor={cores.marcaEscura}>
              {enviar.isPending ? 'Enviando…' : 'Adicionar'}
            </Texto>
          </Pressable>
        ) : null}
      </View>
      <FolhaConfirmar
        visivel={removendo !== null}
        aoFechar={() => {
          setRemovendo(null);
        }}
        titulo="Remover esta foto?"
        texto="A foto sai da ficha do animal."
        rotuloAcao="Remover foto"
        carregando={remover.isPending}
        aoConfirmar={() => {
          if (!removendo) return;
          remover.mutate(removendo, {
            onSettled: () => {
              setRemovendo(null);
            },
            onError: erro,
          });
        }}
      />
    </Secao>
  );
}

function BotaoSeta({
  rotulo,
  desabilitado,
  aoPressionar,
  children,
}: {
  readonly rotulo: string;
  readonly desabilitado: boolean;
  readonly aoPressionar: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desabilitado }}
      disabled={desabilitado}
      hitSlop={6}
      onPress={aoPressionar}
      style={[styles.seta, { opacity: desabilitado ? 0.35 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

const LADO_FOTO = 96;

const styles = StyleSheet.create({
  busca: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.lg },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm + 2 },
  miniatura: { width: LADO_FOTO, height: LADO_FOTO },
  imagem: {
    width: LADO_FOTO,
    height: LADO_FOTO,
    borderRadius: raio.md,
    backgroundColor: cores.fundoSuave,
  },
  capa: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: raio.pilula,
    backgroundColor: 'rgba(28,25,23,0.7)',
  },
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
  setas: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  seta: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adicionar: {
    width: LADO_FOTO,
    height: LADO_FOTO,
    borderRadius: raio.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: cores.marca,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
