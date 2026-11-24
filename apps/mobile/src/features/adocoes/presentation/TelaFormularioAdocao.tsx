import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Chip, cores, espaco, Texto } from '@abraco/ui';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircleIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { useSolicitarAdocao } from '@/features/adocoes/data/hooks';
import {
  corpoAdocao,
  esquemaAdocao,
  MORADIAS,
  MOTIVO_MIN,
  type FormAdocao,
} from '@/features/adocoes/domain/esquema';
import { useAnimal } from '@/features/animais/data/hooks';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

/** Protótipo "Adotar - Formulário" com os campos da triagem da API. */
export default function TelaFormularioAdocao() {
  const { animalId, termo } = useLocalSearchParams<{ animalId: string; termo?: string }>();
  const animal = useAnimal(animalId).data;
  const [enviado, setEnviado] = useState(false);

  // Sem passar pelo aviso (link direto), volta para ele: o aceite é obrigatório.
  if (termo !== 'aceito') {
    return <Redirect href={{ pathname: '/adocao/[animalId]', params: { animalId } }} />;
  }
  if (enviado) return <PedidoEnviado nome={animal?.nome ?? null} />;
  return (
    <Formulario
      animalId={animalId}
      nome={animal?.nome ?? null}
      aoEnviar={() => {
        setEnviado(true);
      }}
    />
  );
}

function Formulario({
  animalId,
  nome,
  aoEnviar,
}: {
  readonly animalId: string;
  readonly nome: string | null;
  readonly aoEnviar: () => void;
}) {
  const solicitar = useSolicitarAdocao();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormAdocao, unknown, ReturnType<typeof esquemaAdocao.parse>>({
    resolver: zodResolver(esquemaAdocao),
    defaultValues: { motivo: '', outrosAnimais: '' },
    mode: 'onTouched',
  });

  const enviar = handleSubmit(async (f) => {
    setErroGeral(null);
    try {
      await solicitar.mutateAsync(corpoAdocao(animalId, f));
      aoEnviar();
    } catch (erro) {
      const campos = ['tipoMoradia', 'possuiEspacoAdequado', 'motivo', 'outrosAnimais'] as const;
      if (
        !aplicarErrosDeCampo(erro, campos, (c, m) => {
          setError(c, { message: m });
        })
      ) {
        setErroGeral(mensagemDeErro(erro));
      }
    }
  });

  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Enviar pedido"
          carregando={solicitar.isPending}
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
            titulo="Quero adotar"
            subtitulo={
              nome
                ? `Conte um pouco sobre você para analisarmos o pedido de adoção de ${nome}.`
                : 'Conte um pouco sobre você para analisarmos seu pedido.'
            }
          />
          <View style={styles.campos}>
            <AvisoErro mensagem={erroGeral} />

            <Controller
              control={control}
              name="tipoMoradia"
              render={({ field }) => (
                <Grupo rotulo="Onde você mora?" erro={errors.tipoMoradia?.message}>
                  <View style={styles.chips}>
                    {MORADIAS.map((m) => (
                      <Chip
                        key={m.valor}
                        rotulo={m.rotulo}
                        selecionado={field.value === m.valor}
                        onPress={() => {
                          field.onChange(m.valor);
                        }}
                      />
                    ))}
                  </View>
                </Grupo>
              )}
            />

            <Controller
              control={control}
              name="possuiEspacoAdequado"
              render={({ field }) => {
                // Começa sem resposta: o tipo do esquema (boolean) não mostra o undefined inicial.
                const resposta = field.value as boolean | undefined;
                return (
                  <Grupo
                    rotulo="Você tem espaço adequado para o animal?"
                    ajuda="Para cavalos e bois: pasto, baia ou propriedade rural."
                    erro={errors.possuiEspacoAdequado?.message}
                  >
                    <View style={styles.simNao}>
                      <Chip
                        rotulo="Sim"
                        expandir
                        selecionado={resposta === true}
                        onPress={() => {
                          field.onChange(true);
                        }}
                      />
                      <Chip
                        rotulo="Não"
                        expandir
                        selecionado={resposta === false}
                        onPress={() => {
                          field.onChange(false);
                        }}
                      />
                    </View>
                  </Grupo>
                );
              }}
            />

            <CampoForm
              control={control}
              nome="motivo"
              rotulo="Qual seu interesse nessa adoção?"
              placeholder="Conte por que quer adotar e como será a rotina do animal."
              ajuda={`Mínimo de ${String(MOTIVO_MIN)} caracteres.`}
              erro={errors.motivo?.message}
              multiline
              maxLength={3000}
            />
            <CampoForm
              control={control}
              nome="outrosAnimais"
              rotulo="Você tem outros animais? (opcional)"
              placeholder="Quais e quantos?"
              erro={errors.outrosAnimais?.message}
              multiline
              maxLength={1000}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TelaComVoltar>
  );
}

/** Grupo de escolha com rótulo e erro, como os campos do protótipo. */
function Grupo({
  rotulo,
  ajuda,
  erro,
  children,
}: {
  readonly rotulo: string;
  readonly ajuda?: string;
  readonly erro: string | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.grupo} accessibilityRole="radiogroup" accessibilityLabel={rotulo}>
      <Texto variante="label" cor={cores.tintaCorpo}>
        {rotulo}
      </Texto>
      {ajuda ? (
        <Texto variante="caption" cor={cores.tintaSuave}>
          {ajuda}
        </Texto>
      ) : null}
      {children}
      {erro ? (
        <Texto variante="caption" cor={cores.erroTexto} accessibilityRole="alert">
          {erro}
        </Texto>
      ) : null}
    </View>
  );
}

function PedidoEnviado({ nome }: { readonly nome: string | null }) {
  const router = useRouter();
  return (
    <TelaComVoltar
      rodape={
        <Button
          titulo="Voltar para o início"
          onPress={() => {
            router.dismissTo('/inicio');
          }}
          larguraTotal
        />
      }
    >
      <View style={styles.enviado} accessibilityLiveRegion="polite">
        <View style={styles.iconeSucesso}>
          <CheckCircleIcon size={40} color={cores.sucessoTexto} weight="fill" />
        </View>
        <Texto variante="titulo" accessibilityRole="header">
          Pedido enviado!
        </Texto>
        <Texto variante="body1" cor={cores.tintaCorpo}>
          {nome ? `Obrigado por querer dar um lar para ${nome}. ` : 'Obrigado! '}A equipe vai
          analisar com carinho e você recebe a resposta pelas notificações e por e-mail.
        </Texto>
      </View>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rolagem: { paddingBottom: espaco.xl },
  campos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: 20 },
  grupo: { gap: espaco.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  simNao: { flexDirection: 'row', gap: espaco.md },
  enviado: { paddingHorizontal: 28, paddingTop: 40, gap: espaco.lg },
  iconeSucesso: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: cores.sucessoFundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
