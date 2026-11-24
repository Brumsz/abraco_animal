import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Chip, cores, espaco, raio, Texto, useToast } from '@abraco/ui';
import * as ImagePicker from 'expo-image-picker';
import { CameraPlusIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useSessao } from '@/core/sessao';
import { PORTES, SEXOS, TIPOS } from '@/features/animais/domain/rotulos';
import { useDoarAnimal } from '@/features/doacoes-animais/data/hooks';
import {
  dadosDoacao,
  esquemaDoacaoAnimal,
  MAX_FOTOS,
  type FormDoacaoAnimal,
} from '@/features/doacoes-animais/domain/esquema';
import { enderecoEmTexto, fotosDaGaleria } from '@/features/doacoes-animais/domain/fotos';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { estiloChips, GrupoEscolha } from '@/shared/componentes/GrupoEscolha';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { TelaConcluido } from '@/shared/componentes/TelaConcluido';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

const ESPECIES = ['EQUINO', 'CANINO', 'BOVINO', 'OUTRO'] as const;
const SEXOS_OPCOES = ['MACHO', 'FEMEA'] as const;
const PORTES_OPCOES = ['PEQUENO', 'MEDIO', 'GRANDE', 'MUITO_GRANDE'] as const;

/** "Doar um animal" à ONG (sem protótipo; acessado pelo cartão Doar do Verbos do Amor). */
export default function TelaDoarAnimal() {
  const [enviado, setEnviado] = useState<string | null>(null);
  if (enviado !== null) {
    return (
      <TelaConcluido
        titulo="Recebemos!"
        texto={`Obrigado por confiar ${enviado} à Abraço Animal. A equipe vai analisar e entra em contato para combinar a retirada.`}
      />
    );
  }
  return <Formulario aoEnviar={setEnviado} />;
}

function Formulario({ aoEnviar }: { readonly aoEnviar: (nome: string) => void }) {
  const toast = useToast();
  const doar = useDoarAnimal();
  const endereco = useSessao((s) => s.usuario?.endereco);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormDoacaoAnimal, unknown, ReturnType<typeof esquemaDoacaoAnimal.parse>>({
    resolver: zodResolver(esquemaDoacaoAnimal),
    defaultValues: {
      nomeAnimal: '',
      raca: '',
      anos: '',
      meses: '',
      descricao: '',
      motivoDoacao: '',
      enderecoRetirada: enderecoEmTexto(endereco),
      fotos: [],
    },
    mode: 'onTouched',
  });
  const fotos = useWatch({ control, name: 'fotos' });

  const escolherFotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_FOTOS - fotos.length,
      quality: 0.8,
    });
    if (r.canceled) return;
    const { fotos: novas, grandes, excedentes } = fotosDaGaleria(r.assets, fotos.length, MAX_FOTOS);
    setValue('fotos', [...getValues('fotos'), ...novas], { shouldValidate: true });
    if (grandes > 0) {
      toast.mostrar({ tipo: 'erro', mensagem: 'Algumas fotos passam de 5 MB e ficaram de fora.' });
    } else if (excedentes > 0) {
      toast.mostrar({ tipo: 'info', mensagem: `Cabem até ${String(MAX_FOTOS)} fotos.` });
    }
  };

  const enviar = handleSubmit(async (f) => {
    setErroGeral(null);
    const { dados, fotos: arquivos } = dadosDoacao(f);
    try {
      await doar.mutateAsync({ dados, fotos: arquivos });
      aoEnviar(dados.nomeAnimal);
    } catch (erro) {
      const campos = [
        'nomeAnimal',
        'tipo',
        'raca',
        'sexo',
        'porte',
        'descricao',
        'motivoDoacao',
        'enderecoRetirada',
        'fotos',
      ] as const;
      const aplicou = aplicarErrosDeCampo(erro, campos, (c, m) => {
        setError(c, { message: m });
      });
      // A API valida a idade em meses (idadeAprox); no formulário ela está em anos.
      const aplicouIdade = aplicarErrosDeCampo(erro, ['idadeAprox'] as const, (_c, m) => {
        setError('anos', { message: m });
      });
      if (!aplicou && !aplicouIdade) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Enviar para a ONG"
          carregando={doar.isPending}
          onPress={() => void enviar()}
          larguraTotal
        />
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.rolagem}>
          <CabecalhoTela
            titulo="Doar um animal"
            subtitulo="Conte sobre o animal. A equipe analisa e combina a retirada com você."
          />
          <View style={styles.campos}>
            <AvisoErro mensagem={erroGeral} />

            <GrupoEscolha
              rotulo={`Fotos (${String(fotos.length)} de ${String(MAX_FOTOS)})`}
              ajuda="Até 5 MB cada. Mostre o animal de corpo inteiro."
              erro={errors.fotos?.message}
            >
              <View style={styles.fotos}>
                {fotos.map((f, i) => (
                  <View key={f.uri} style={styles.miniatura}>
                    <Image
                      source={{ uri: f.uri }}
                      style={styles.imagem}
                      accessibilityIgnoresInvertColors
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remover foto ${String(i + 1)}`}
                      hitSlop={8}
                      onPress={() => {
                        setValue(
                          'fotos',
                          getValues('fotos').filter((x) => x.uri !== f.uri),
                          { shouldValidate: true },
                        );
                      }}
                      style={styles.remover}
                    >
                      <XIcon size={14} color={cores.branco} weight="bold" />
                    </Pressable>
                  </View>
                ))}
                {fotos.length < MAX_FOTOS ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Adicionar fotos"
                    onPress={() => void escolherFotos()}
                    style={({ pressed }) => [styles.adicionar, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <CameraPlusIcon size={26} color={cores.marca} />
                    <Texto variante="caption" cor={cores.marcaEscura}>
                      Adicionar
                    </Texto>
                  </Pressable>
                ) : null}
              </View>
            </GrupoEscolha>

            <CampoForm
              control={control}
              nome="nomeAnimal"
              rotulo="Nome do animal"
              erro={errors.nomeAnimal?.message}
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
                  <View style={estiloChips.par}>
                    {SEXOS_OPCOES.map((s) => (
                      <Chip
                        key={s}
                        rotulo={SEXOS[s]}
                        expandir
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
              rotulo="Como ele é?"
              placeholder="Temperamento, saúde, vacinas, se convive com outros animais…"
              erro={errors.descricao?.message}
              multiline
              maxLength={5000}
            />
            <CampoForm
              control={control}
              nome="motivoDoacao"
              rotulo="Por que você está doando?"
              placeholder="Só a equipe da ONG lê esta resposta."
              erro={errors.motivoDoacao?.message}
              multiline
              maxLength={3000}
            />
            <CampoForm
              control={control}
              nome="enderecoRetirada"
              rotulo="Onde o animal está?"
              ajuda="Endereço para a equipe buscar o animal."
              erro={errors.enderecoRetirada?.message}
              multiline
              maxLength={500}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TelaComVoltar>
  );
}

const LADO_FOTO = 84;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rolagem: { paddingBottom: espaco.xl },
  campos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: 20 },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm + 2 },
  miniatura: { width: LADO_FOTO, height: LADO_FOTO },
  imagem: {
    width: LADO_FOTO,
    height: LADO_FOTO,
    borderRadius: raio.md,
    backgroundColor: cores.fundoSuave,
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
  rotuloIdade: { marginBottom: espaco.sm },
});
