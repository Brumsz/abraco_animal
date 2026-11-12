import { zodResolver } from '@hookform/resolvers/zod';
import { Button, cores, espaco, Input, raio, Texto, useToast } from '@abraco/ui';
import { WarningCircleIcon } from 'phosphor-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/shared/componentes/Logo';

import { esquemaLogin, type DadosLogin } from '../domain/esquemas';

export default function TelaLogin() {
  const toast = useToast();
  const campoSenha = useRef<ComponentRef<typeof TextInput>>(null);
  // Erro geral (ex.: credenciais inválidas vindas da API) — exibido inline, nunca em Alert nativo.
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DadosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: '', senha: '' },
    mode: 'onTouched',
  });

  const entrar = handleSubmit(async () => {
    setErroGeral(null);
    // A autenticação real (POST /v1/auth/login) é conectada na Etapa 3.
    await new Promise((resolver) => setTimeout(resolver, 600));
    toast.mostrar({
      tipo: 'info',
      mensagem: 'Versão de demonstração: o login será conectado ao servidor na próxima etapa.',
    });
  });

  const emBreve = (funcionalidade: string) => {
    toast.mostrar({ tipo: 'info', mensagem: `${funcionalidade}: disponível em breve.` });
  };

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.conteudo}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topo}>
            <Logo tamanho="grande" />
          </View>

          <View style={styles.titulos}>
            <Texto variante="h1" cor={cores.marromTexto}>
              Que bom ver você!
            </Texto>
            <Texto variante="body1" cor={cores.neutro600}>
              Entre para acompanhar suas adoções, doações e apadrinhamentos.
            </Texto>
          </View>

          {erroGeral ? (
            <View
              style={styles.erroGeral}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <WarningCircleIcon size={20} color={cores.erroForte} weight="fill" />
              <Texto variante="body2" cor={cores.erroForte} style={styles.flex}>
                {erroGeral}
              </Texto>
            </View>
          ) : null}

          <View style={styles.formulario}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  rotulo="E-mail"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  erro={errors.email?.message}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => campoSenha.current?.focus()}
                />
              )}
            />

            <Controller
              control={control}
              name="senha"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={campoSenha}
                  rotulo="Senha"
                  senha
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  erro={errors.senha?.message}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void entrar()}
                />
              )}
            />

            <Button
              titulo="Esqueci minha senha"
              variante="ghost"
              tamanho="sm"
              style={styles.esqueci}
              onPress={() => {
                emBreve('Recuperação de senha');
              }}
            />
          </View>

          <Button
            titulo="Entrar"
            tamanho="lg"
            larguraTotal
            carregando={isSubmitting}
            onPress={() => void entrar()}
          />

          <View style={styles.rodape}>
            <Texto variante="body2" cor={cores.neutro600}>
              Ainda não tem conta?
            </Texto>
            <Button
              titulo="Criar conta"
              variante="ghost"
              tamanho="sm"
              onPress={() => {
                emBreve('Cadastro');
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tela: { flex: 1, backgroundColor: cores.creme },
  conteudo: {
    flexGrow: 1,
    paddingHorizontal: espaco.xl,
    paddingVertical: espaco.xl,
    gap: espaco.xl,
  },
  topo: { alignItems: 'center', marginTop: espaco.xl },
  titulos: { gap: espaco.xs },
  formulario: { gap: espaco.lg },
  esqueci: { alignSelf: 'flex-end', marginTop: -espaco.sm },
  erroGeral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    padding: espaco.md,
    borderRadius: raio.md,
    backgroundColor: '#FEE2E2',
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.xxs,
  },
});
