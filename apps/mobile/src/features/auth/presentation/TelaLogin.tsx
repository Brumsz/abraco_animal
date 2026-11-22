import { zodResolver } from '@hookform/resolvers/zod';
import { Button, cores, espaco, Input, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { EnvelopeSimpleIcon, LockSimpleIcon } from 'phosphor-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { MolduraAuth } from '@/shared/componentes/MolduraAuth';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useEntrar } from '../data/hooks';
import { esquemaLogin, type DadosLogin } from '../domain/esquemas';

/** Protótipo "Login - Vazio / Preenchido". */
export default function TelaLogin() {
  const router = useRouter();
  const campoSenha = useRef<ComponentRef<typeof TextInput>>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const entrarNaApi = useEntrar();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: '', senha: '' },
    mode: 'onTouched',
  });

  const entrar = handleSubmit(async (dados) => {
    setErroGeral(null);
    try {
      await entrarNaApi.mutateAsync({ email: dados.email, senha: dados.senha });
      router.replace('/boas-vindas');
    } catch (erro) {
      if (
        !aplicarErrosDeCampo(erro, ['email', 'senha'] as const, (c, m) => {
          setError(c, { message: m });
        })
      ) {
        setErroGeral(mensagemDeErro(erro));
      }
    }
  });

  return (
    <MolduraAuth
      cabecalho="grande"
      titulo="Bem-vindo de volta"
      subtitulo="Entre para adotar, doar e acompanhar quem você ama."
    >
      <AvisoErro mensagem={erroGeral} />

      <View style={styles.campos}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              rotulo="E-mail"
              rotuloOculto
              icone={(cor) => <EnvelopeSimpleIcon size={20} color={cor} />}
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
              rotuloOculto
              senha
              icone={(cor) => <LockSimpleIcon size={20} color={cor} />}
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
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => {
          router.push('/recuperar-senha');
        }}
        hitSlop={espaco.md}
        style={styles.esqueci}
      >
        <Texto variante="label" cor={cores.marcaEscura}>
          Esqueceu a senha?
        </Texto>
      </Pressable>

      <Button
        titulo="Entrar"
        tamanho="lg"
        larguraTotal
        carregando={isSubmitting}
        onPress={() => void entrar()}
      />

      <View style={styles.rodape}>
        <Texto variante="label" cor={cores.tintaSuave} style={styles.regular}>
          Não tem uma conta?
        </Texto>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push('/cadastro');
          }}
          hitSlop={espaco.md}
        >
          <Texto variante="label" cor={cores.marcaEscura}>
            Criar conta
          </Texto>
        </Pressable>
      </View>
    </MolduraAuth>
  );
}

const styles = StyleSheet.create({
  campos: { gap: espaco.md },
  esqueci: { alignSelf: 'flex-end' },
  rodape: { flexDirection: 'row', justifyContent: 'center', gap: espaco.xs },
  regular: { fontWeight: '400' },
});
