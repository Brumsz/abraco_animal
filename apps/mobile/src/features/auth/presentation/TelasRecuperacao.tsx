/** Protótipos "Recuperar senha - E-mail / Código / Nova senha". */
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, CampoCodigo, cores, espaco, Input, Texto, useToast } from '@abraco/ui';
import { Redirect, useRouter } from 'expo-router';
import { EnvelopeSimpleIcon, LockSimpleIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { MolduraAuth } from '@/shared/componentes/MolduraAuth';
import { mensagemDeErro } from '@/shared/erros';

import { limparFluxoRecuperacao, useFluxoRecuperacao } from '../data/fluxo-recuperacao';
import { useRedefinirSenha, useSolicitarRecuperacao, useVerificarCodigo } from '../data/hooks';
import { esquemaEmail, esquemaNovaSenha, type DadosNovaSenha } from '../domain/esquemas';

const ESPERA_REENVIO_S = 60;

export function TelaRecuperarEmail() {
  const router = useRouter();
  const solicitar = useSolicitarRecuperacao();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(esquemaEmail),
    defaultValues: { email: useFluxoRecuperacao.getState().email ?? '' },
    mode: 'onTouched',
  });

  const enviar = handleSubmit(async ({ email }) => {
    setErroGeral(null);
    try {
      // A API responde igual exista ou não a conta (não revela quem tem cadastro).
      await solicitar.mutateAsync(email.trim());
      useFluxoRecuperacao.setState({ email: email.trim(), tokenRedefinicao: null });
      router.push('/recuperar-senha/codigo');
    } catch (erro) {
      setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <MolduraAuth
      titulo="Recuperar senha"
      subtitulo="Informe o e-mail da sua conta. Enviaremos um código de 6 dígitos."
      aoVoltar={() => {
        limparFluxoRecuperacao();
        router.back();
      }}
    >
      <AvisoErro mensagem={erroGeral} />
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
            returnKeyType="send"
            onSubmitEditing={() => void enviar()}
          />
        )}
      />
      <Button
        titulo="Enviar código"
        tamanho="lg"
        larguraTotal
        carregando={isSubmitting}
        onPress={() => void enviar()}
      />
    </MolduraAuth>
  );
}

export function TelaRecuperarCodigo() {
  const router = useRouter();
  const email = useFluxoRecuperacao((s) => s.email);
  const verificar = useVerificarCodigo();
  const solicitar = useSolicitarRecuperacao();
  const toast = useToast();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | undefined>();
  const [espera, setEspera] = useState(ESPERA_REENVIO_S);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => {
      setEspera((s) => s - 1);
    }, 1000);
    return () => {
      clearTimeout(t);
    };
  }, [espera]);

  if (!email) return <Redirect href="/recuperar-senha/email" />;

  const confirmar = async (valor = codigo) => {
    if (valor.length !== 6) {
      setErro('Digite os 6 dígitos do código');
      return;
    }
    setErro(undefined);
    try {
      const { tokenRedefinicao } = await verificar.mutateAsync({ email, codigo: valor });
      useFluxoRecuperacao.setState({ tokenRedefinicao });
      router.replace('/recuperar-senha/nova-senha');
    } catch (e) {
      setCodigo('');
      setErro(mensagemDeErro(e));
    }
  };

  const reenviar = async () => {
    try {
      await solicitar.mutateAsync(email);
      setEspera(ESPERA_REENVIO_S);
      toast.mostrar({ tipo: 'sucesso', mensagem: 'Enviamos um novo código.' });
    } catch (e) {
      toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
    }
  };

  return (
    <MolduraAuth
      titulo="Verifique seu e-mail"
      subtitulo="Enviamos um código de 6 dígitos para o seu e-mail. Digite-o abaixo para continuar."
      aoVoltar={() => {
        router.back();
      }}
    >
      <CampoCodigo
        valor={codigo}
        onChange={(v) => {
          setCodigo(v);
          if (erro) setErro(undefined);
        }}
        aoCompletar={(v) => void confirmar(v)}
        erro={erro}
      />
      <Button
        titulo="Confirmar código"
        tamanho="lg"
        larguraTotal
        carregando={verificar.isPending}
        onPress={() => void confirmar()}
      />
      <View style={styles.reenvio}>
        {espera > 0 ? (
          <Texto variante="body2" cor={cores.tintaSuave}>
            Reenviar código em {espera}s
          </Texto>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void reenviar()} hitSlop={espaco.md}>
            <Texto variante="label" cor={cores.marcaEscura}>
              Reenviar código
            </Texto>
          </Pressable>
        )}
      </View>
    </MolduraAuth>
  );
}

export function TelaRecuperarNovaSenha() {
  const router = useRouter();
  const toast = useToast();
  const token = useFluxoRecuperacao((s) => s.tokenRedefinicao);
  const redefinir = useRedefinirSenha();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DadosNovaSenha>({
    resolver: zodResolver(esquemaNovaSenha),
    defaultValues: { senha: '', confirmacao: '' },
    mode: 'onTouched',
  });

  if (!token) return <Redirect href="/recuperar-senha/email" />;

  const enviar = handleSubmit(async ({ senha }) => {
    setErroGeral(null);
    try {
      await redefinir.mutateAsync({ tokenRedefinicao: token, novaSenha: senha });
      limparFluxoRecuperacao();
      toast.mostrar({ tipo: 'sucesso', mensagem: 'Senha alterada. Entre com a nova senha.' });
      router.dismissTo('/login');
    } catch (erro) {
      setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <MolduraAuth
      titulo="Nova senha"
      subtitulo="Crie uma senha com pelo menos 8 caracteres, com letras e números."
      aoVoltar={() => {
        limparFluxoRecuperacao();
        router.dismissTo('/login');
      }}
    >
      <AvisoErro mensagem={erroGeral} />
      <View style={styles.campos}>
        <Controller
          control={control}
          name="senha"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              rotulo="Nova senha"
              rotuloOculto
              senha
              icone={(cor) => <LockSimpleIcon size={20} color={cor} />}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              erro={errors.senha?.message}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
          )}
        />
        <Controller
          control={control}
          name="confirmacao"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              rotulo="Confirmar senha"
              rotuloOculto
              senha
              icone={(cor) => <LockSimpleIcon size={20} color={cor} />}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              erro={errors.confirmacao?.message}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={() => void enviar()}
            />
          )}
        />
      </View>
      <Button
        titulo="Redefinir senha"
        tamanho="lg"
        larguraTotal
        carregando={isSubmitting}
        onPress={() => void enviar()}
      />
    </MolduraAuth>
  );
}

const styles = StyleSheet.create({
  campos: { gap: espaco.md },
  reenvio: { alignItems: 'center' },
});
