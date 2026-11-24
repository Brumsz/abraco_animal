import { zodResolver } from '@hookform/resolvers/zod';
import type { UsuarioPerfil } from '@abraco/api-client';
import { Avatar, Button, espaco, Input, Texto, cores, useToast } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { useSessao } from '@/core/sessao';
import { usePerfil } from '@/features/auth/data/hooks';
import { mascararCep, mascararTelefone } from '@/features/auth/domain/mascaras';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useAtualizarPerfil } from '../data/hooks';
import {
  corpoEditarPerfil,
  esquemaEditarPerfil,
  valoresDoPerfil,
  type DadosEditarPerfil,
} from '../domain/esquemas';

const CAMPOS_ENDERECO = [
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
] as const;

/** Protótipo "Editar perfil": nome, telefone e endereço. E-mail só para leitura. */
export default function TelaEditarPerfil() {
  const daSessao = useSessao((s) => s.usuario);
  const perfil = usePerfil();
  const usuario = perfil.data ?? daSessao;

  if (!usuario) {
    return (
      <TelaComVoltar>
        {perfil.isError ? (
          <EstadoErro erro={perfil.error} aoTentarDeNovo={() => void perfil.refetch()} />
        ) : null}
      </TelaComVoltar>
    );
  }
  return <Formulario usuario={usuario} />;
}

function Formulario({ usuario }: { readonly usuario: UsuarioPerfil }) {
  const router = useRouter();
  const toast = useToast();
  const atualizar = useAtualizarPerfil();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<DadosEditarPerfil>({
    resolver: zodResolver(esquemaEditarPerfil),
    defaultValues: valoresDoPerfil(usuario),
    mode: 'onTouched',
  });

  const salvar = handleSubmit(async (d) => {
    setErroGeral(null);
    try {
      await atualizar.mutateAsync(corpoEditarPerfil(d));
      toast.mostrar({ tipo: 'sucesso', mensagem: 'Perfil atualizado.' });
      router.back();
    } catch (erro) {
      const aplicou = aplicarErrosDeCampo(erro, ['nome', 'telefone'] as const, (c, m) => {
        setError(c, { message: m });
      });
      // A API aponta os campos do endereço como "endereco.cep", "endereco.uf"…
      const campoEndereco = aplicarErrosDeCampo(
        erro,
        CAMPOS_ENDERECO.map((c) => `endereco.${c}` as const),
        (c, m) => {
          setError(c.replace('endereco.', '') as (typeof CAMPOS_ENDERECO)[number], {
            message: m,
          });
        },
      );
      if (!aplicou && !campoEndereco) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaFormulario
      titulo="Editar perfil"
      rodape={
        <Button
          titulo="Salvar alterações"
          carregando={atualizar.isPending}
          disabled={!isDirty}
          onPress={() => void salvar()}
          larguraTotal
        />
      }
    >
      <View style={styles.avatar}>
        <Avatar nome={usuario.nome} uri={usuario.fotoUrl} tamanho={96} />
      </View>
      <AvisoErro mensagem={erroGeral} />

      <CampoForm
        control={control}
        nome="nome"
        rotulo="Nome completo"
        erro={errors.nome?.message}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
      />
      <CampoForm
        control={control}
        nome="telefone"
        rotulo="Telefone"
        erro={errors.telefone?.message}
        mascara={mascararTelefone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Input
        rotulo="E-mail"
        value={usuario.email}
        desabilitado
        ajuda="Para trocar o e-mail, fale com a ONG pelo chat."
      />

      <Texto variante="h3" accessibilityRole="header" cor={cores.tinta}>
        Endereço
      </Texto>
      <View style={styles.par}>
        <View style={styles.cep}>
          <CampoForm
            control={control}
            nome="cep"
            rotulo="CEP"
            erro={errors.cep?.message}
            mascara={mascararCep}
            keyboardType="number-pad"
            autoComplete="postal-code"
          />
        </View>
        <View style={styles.uf}>
          <CampoForm
            control={control}
            nome="uf"
            rotulo="UF"
            erro={errors.uf?.message}
            autoCapitalize="characters"
            maxLength={2}
          />
        </View>
      </View>
      <CampoForm control={control} nome="cidade" rotulo="Cidade" erro={errors.cidade?.message} />
      <CampoForm control={control} nome="bairro" rotulo="Bairro" erro={errors.bairro?.message} />
      <CampoForm
        control={control}
        nome="logradouro"
        rotulo="Rua"
        erro={errors.logradouro?.message}
        autoComplete="street-address"
      />
      <View style={styles.par}>
        <View style={styles.numero}>
          <CampoForm
            control={control}
            nome="numero"
            rotulo="Número"
            erro={errors.numero?.message}
          />
        </View>
        <View style={styles.complemento}>
          <CampoForm
            control={control}
            nome="complemento"
            rotulo="Complemento"
            erro={errors.complemento?.message}
          />
        </View>
      </View>
    </TelaFormulario>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center' },
  par: { flexDirection: 'row', gap: espaco.md },
  cep: { flex: 2 },
  uf: { flex: 1 },
  numero: { flex: 1 },
  complemento: { flex: 2 },
});
