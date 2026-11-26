/** Cadastro e edição da ficha de um animal (spec: "form com todos os campos"). */
import type { AnimalDetalhe } from '@abraco/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, CaixaSelecao, Chip, cores, espaco, Texto, useToast } from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useAnimal } from '@/features/animais/data/hooks';
import { PORTES, SEXOS, TIPOS } from '@/features/animais/domain/rotulos';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { estiloChips, GrupoEscolha } from '@/shared/componentes/GrupoEscolha';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useAtualizarAnimal, useCriarAnimal } from '../data/cadastros';
import {
  corpoAnimal,
  esquemaAnimal,
  FORM_ANIMAL_VAZIO,
  STATUS_ANIMAL_EQUIPE,
  STATUS_MANUAIS,
  valoresDoAnimal,
  type FormAnimal,
} from '../domain/animais';

const ESPECIES = ['EQUINO', 'CANINO', 'BOVINO', 'OUTRO'] as const;
const SEXOS_OPCOES = ['MACHO', 'FEMEA'] as const;
const PORTES_OPCOES = ['PEQUENO', 'MEDIO', 'GRANDE', 'MUITO_GRANDE'] as const;
const CAMPOS = ['nome', 'tipo', 'raca', 'sexo', 'porte', 'descricao', 'historiaResgate'] as const;

/** /admin/animais/novo */
export function TelaNovoAnimal() {
  const router = useRouter();
  const criar = useCriarAnimal();
  return (
    <FormularioAnimal
      titulo="Novo animal"
      subtitulo="Depois de salvar, você adiciona as fotos."
      valores={FORM_ANIMAL_VAZIO}
      comStatus
      salvando={criar.isPending}
      salvar={async (f) => {
        const a = await criar.mutateAsync({ ...corpoAnimal(f), status: f.status });
        // Fotos precisam do id: segue para a ficha do animal recém-criado.
        router.replace({ pathname: '/admin/animais/[id]', params: { id: a.id } });
      }}
    />
  );
}

/** /admin/animais/[id]/editar */
export function TelaEditarAnimal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useAnimal(id);
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
  return <Edicao animal={consulta.data} />;
}

function Edicao({ animal }: { readonly animal: AnimalDetalhe }) {
  const router = useRouter();
  const toast = useToast();
  const atualizar = useAtualizarAnimal(animal.id);
  return (
    <FormularioAnimal
      titulo={`Editar ${animal.nome}`}
      valores={valoresDoAnimal(animal)}
      comStatus={false}
      salvando={atualizar.isPending}
      salvar={async (f) => {
        await atualizar.mutateAsync(corpoAnimal(f));
        toast.mostrar({ tipo: 'sucesso', mensagem: 'Ficha atualizada.' });
        router.back();
      }}
    />
  );
}

function FormularioAnimal({
  titulo,
  subtitulo,
  valores,
  comStatus,
  salvando,
  salvar,
}: {
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly valores: FormAnimal;
  readonly comStatus: boolean;
  readonly salvando: boolean;
  readonly salvar: (f: ReturnType<typeof esquemaAnimal.parse>) => Promise<void>;
}) {
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormAnimal, unknown, ReturnType<typeof esquemaAnimal.parse>>({
    resolver: zodResolver(esquemaAnimal),
    defaultValues: valores,
    mode: 'onTouched',
  });

  const enviar = handleSubmit(async (f) => {
    setErroGeral(null);
    try {
      await salvar(f);
    } catch (erro) {
      const aplicou = aplicarErrosDeCampo(erro, CAMPOS, (c, m) => {
        setError(c, { message: m });
      });
      // A API valida a idade em meses; no formulário ela está em anos + meses.
      const aplicouIdade = aplicarErrosDeCampo(erro, ['idadeAprox'] as const, (_c, m) => {
        setError('anos', { message: m });
      });
      if (!aplicou && !aplicouIdade) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaComVoltar
      rodape={
        <Button titulo="Salvar" carregando={salvando} onPress={() => void enviar()} larguraTotal />
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.rolagem}>
          <CabecalhoTela titulo={titulo} {...(subtitulo ? { subtitulo } : {})} />
          <View style={styles.campos}>
            <AvisoErro mensagem={erroGeral} />
            <CampoForm
              control={control}
              nome="nome"
              rotulo="Nome"
              erro={errors.nome?.message}
              maxLength={80}
            />

            <Controller
              control={control}
              name="tipo"
              render={({ field }) => (
                <GrupoEscolha rotulo="Espécie" erro={errors.tipo?.message}>
                  <View style={estiloChips.linha}>
                    {ESPECIES.map((t) => (
                      <Chip
                        key={t}
                        rotulo={TIPOS[t].singular}
                        selecionado={field.value === t}
                        onPress={() => {
                          field.onChange(t);
                        }}
                      />
                    ))}
                  </View>
                </GrupoEscolha>
              )}
            />

            <CampoForm
              control={control}
              nome="raca"
              rotulo="Raça"
              placeholder='Ex.: Mangalarga ou "sem raça definida"'
              erro={errors.raca?.message}
              maxLength={80}
            />

            <View>
              <Texto variante="label" cor={cores.tintaCorpo} style={styles.rotuloIdade}>
                Idade aproximada
              </Texto>
              <View style={estiloChips.par}>
                <View style={styles.flex}>
                  <CampoForm
                    control={control}
                    nome="anos"
                    rotulo="Anos"
                    erro={errors.anos?.message}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
                <View style={styles.flex}>
                  <CampoForm
                    control={control}
                    nome="meses"
                    rotulo="Meses"
                    erro={errors.meses?.message}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>
            </View>

            <Controller
              control={control}
              name="sexo"
              render={({ field }) => (
                <GrupoEscolha rotulo="Sexo" erro={errors.sexo?.message}>
                  <View style={estiloChips.linha}>
                    {SEXOS_OPCOES.map((s) => (
                      <Chip
                        key={s}
                        rotulo={SEXOS[s]}
                        selecionado={field.value === s}
                        onPress={() => {
                          field.onChange(s);
                        }}
                      />
                    ))}
                  </View>
                </GrupoEscolha>
              )}
            />

            <Controller
              control={control}
              name="porte"
              render={({ field }) => (
                <GrupoEscolha rotulo="Porte" erro={errors.porte?.message}>
                  <View style={estiloChips.linha}>
                    {PORTES_OPCOES.map((p) => (
                      <Chip
                        key={p}
                        rotulo={PORTES[p]}
                        selecionado={field.value === p}
                        onPress={() => {
                          field.onChange(p);
                        }}
                      />
                    ))}
                  </View>
                </GrupoEscolha>
              )}
            />

            <CampoForm
              control={control}
              nome="descricao"
              rotulo="Como ele é"
              placeholder="Temperamento, cuidados, com quem convive bem…"
              erro={errors.descricao?.message}
              multiline
              maxLength={5000}
            />
            <CampoForm
              control={control}
              nome="historiaResgate"
              rotulo="História do resgate"
              erro={errors.historiaResgate?.message}
              multiline
              maxLength={10000}
            />

            <Controller
              control={control}
              name="vacinado"
              render={({ field }) => (
                <CaixaSelecao rotulo="Vacinado" marcada={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="castrado"
              render={({ field }) => (
                <CaixaSelecao rotulo="Castrado" marcada={field.value} onChange={field.onChange} />
              )}
            />

            {comStatus ? (
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <GrupoEscolha
                    rotulo="Status inicial"
                    ajuda="Só os disponíveis aparecem para adoção no app."
                    erro={errors.status?.message}
                  >
                    <View style={estiloChips.linha}>
                      {STATUS_MANUAIS.map((s) => (
                        <Chip
                          key={s}
                          rotulo={STATUS_ANIMAL_EQUIPE[s].texto}
                          selecionado={field.value === s}
                          onPress={() => {
                            field.onChange(s);
                          }}
                        />
                      ))}
                    </View>
                  </GrupoEscolha>
                )}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  carregando: { marginVertical: espaco.xxl },
  rolagem: { paddingBottom: espaco.xl },
  campos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: 20 },
  rotuloIdade: { marginBottom: espaco.sm },
});
