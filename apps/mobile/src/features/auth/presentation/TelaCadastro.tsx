import { zodResolver } from '@hookform/resolvers/zod';
import { Button, CaixaSelecao, cores, espaco, Texto } from '@abraco/ui';
import { useRouter } from 'expo-router';
import {
  CalendarBlankIcon,
  DeviceMobileIcon,
  EnvelopeSimpleIcon,
  IdentificationCardIcon,
  LockSimpleIcon,
  MapPinIcon,
  UserIcon,
} from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { MolduraAuth } from '@/shared/componentes/MolduraAuth';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useCadastrar } from '../data/hooks';
import {
  esquemaCadastroEndereco,
  esquemaCadastroPessoal,
  type DadosCadastroEndereco,
  type DadosCadastroPessoal,
} from '../domain/esquemas';
import {
  dataParaIso,
  mascararCep,
  mascararCpf,
  mascararData,
  mascararTelefone,
  soDigitos,
} from '../domain/mascaras';

/**
 * Protótipo "Cadastrar". Dividido em 2 passos: o protótipo tem "Cidade e CEP" num
 * campo só, mas a adoção exige o endereço completo (spec) — o passo 2 pede o
 * endereço e os consentimentos da LGPD.
 */
export default function TelaCadastro() {
  const router = useRouter();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [pessoais, setPessoais] = useState<DadosCadastroPessoal | null>(null);

  return passo === 1 || !pessoais ? (
    <PassoPessoal
      inicial={pessoais}
      aoVoltar={() => {
        router.back();
      }}
      aoEntrar={() => {
        router.replace('/login');
      }}
      aoContinuar={(d) => {
        setPessoais(d);
        setPasso(2);
      }}
    />
  ) : (
    <PassoEndereco
      pessoais={pessoais}
      aoVoltar={() => {
        setPasso(1);
      }}
      aoConcluir={() => {
        router.replace('/boas-vindas');
      }}
      aoCorrigirPessoais={() => {
        setPasso(1);
      }}
    />
  );
}

function PassoPessoal({
  inicial,
  aoVoltar,
  aoEntrar,
  aoContinuar,
}: {
  inicial: DadosCadastroPessoal | null;
  aoVoltar: () => void;
  aoEntrar: () => void;
  aoContinuar: (d: DadosCadastroPessoal) => void;
}) {
  const esquema = useMemo(() => esquemaCadastroPessoal(), []);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DadosCadastroPessoal>({
    resolver: zodResolver(esquema),
    defaultValues: inicial ?? {
      nome: '',
      nascimento: '',
      cpf: '',
      telefone: '',
      email: '',
      senha: '',
    },
    mode: 'onTouched',
  });

  return (
    <MolduraAuth
      cabecalho="compacta"
      titulo="Criar conta"
      subtitulo="Faça parte da família Abraço Animal."
      aoVoltar={aoVoltar}
    >
      <View style={styles.campos}>
        <CampoForm
          control={control}
          nome="nome"
          rotulo="Nome completo"
          rotuloOculto
          erro={errors.nome?.message}
          icone={(c) => <UserIcon size={20} color={c} />}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
        />
        <View style={styles.linha}>
          <View style={styles.metade}>
            <CampoForm
              control={control}
              nome="nascimento"
              rotulo="Nascimento"
              rotuloOculto
              placeholder="Nascimento"
              erro={errors.nascimento?.message}
              mascara={mascararData}
              icone={(c) => <CalendarBlankIcon size={20} color={c} />}
              keyboardType="number-pad"
              accessibilityHint="Data no formato dia, mês e ano"
              autoComplete="birthdate-full"
            />
          </View>
          <View style={styles.metade}>
            <CampoForm
              control={control}
              nome="cpf"
              rotulo="CPF"
              rotuloOculto
              erro={errors.cpf?.message}
              mascara={mascararCpf}
              icone={(c) => <IdentificationCardIcon size={20} color={c} />}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <CampoForm
          control={control}
          nome="telefone"
          rotulo="Telefone com DDD"
          rotuloOculto
          placeholder="(11) 99999-9999"
          erro={errors.telefone?.message}
          mascara={mascararTelefone}
          icone={(c) => <DeviceMobileIcon size={20} color={c} />}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <CampoForm
          control={control}
          nome="email"
          rotulo="E-mail"
          rotuloOculto
          erro={errors.email?.message}
          icone={(c) => <EnvelopeSimpleIcon size={20} color={c} />}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
        />
        <CampoForm
          control={control}
          nome="senha"
          rotulo="Senha"
          rotuloOculto
          senha
          erro={errors.senha?.message}
          icone={(c) => <LockSimpleIcon size={20} color={c} />}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          ajuda="Mínimo de 8 caracteres, com letras e números."
        />
      </View>

      <Button
        titulo="Continuar"
        tamanho="lg"
        larguraTotal
        onPress={() => void handleSubmit(aoContinuar)()}
      />
      <Rodape texto="Já tem conta?" acao="Entrar" onPress={aoEntrar} />
    </MolduraAuth>
  );
}

function PassoEndereco({
  pessoais,
  aoVoltar,
  aoConcluir,
  aoCorrigirPessoais,
}: {
  pessoais: DadosCadastroPessoal;
  aoVoltar: () => void;
  aoConcluir: () => void;
  aoCorrigirPessoais: () => void;
}) {
  const cadastrar = useCadastrar();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosCadastroEndereco>({
    resolver: zodResolver(esquemaCadastroEndereco),
    defaultValues: {
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      // false até a pessoa marcar (o esquema exige true)
      aceitouTermos: false as true,
      consentimentoDados: false as true,
    },
    mode: 'onTouched',
  });

  const enviar = handleSubmit(async (e) => {
    setErroGeral(null);
    try {
      await cadastrar.mutateAsync({
        nome: pessoais.nome.trim(),
        dataNasc: dataParaIso(pessoais.nascimento) ?? '',
        cpf: soDigitos(pessoais.cpf),
        telefone: soDigitos(pessoais.telefone),
        email: pessoais.email.trim(),
        senha: pessoais.senha,
        endereco: {
          cep: soDigitos(e.cep),
          logradouro: e.logradouro.trim(),
          numero: e.numero.trim(),
          complemento: e.complemento.trim() || null,
          bairro: e.bairro.trim(),
          cidade: e.cidade.trim(),
          uf: e.uf.trim().toUpperCase(),
        },
        aceitouTermos: e.aceitouTermos,
        consentimentoDados: e.consentimentoDados,
      });
      aoConcluir();
    } catch (erro) {
      const campos = [
        'cep',
        'logradouro',
        'numero',
        'complemento',
        'bairro',
        'cidade',
        'uf',
      ] as const;
      const aplicou = aplicarErrosDeCampo(erro, campos, (c, m) => {
        setError(c, { message: m });
      });
      // Erro num dado do passo 1 (ex.: CPF): mostra a mensagem e deixa voltar para corrigir.
      if (!aplicou) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <MolduraAuth
      cabecalho="compacta"
      titulo="Onde você mora?"
      subtitulo="Usamos o endereço para analisar adoções. Ele não aparece para ninguém."
      aoVoltar={aoVoltar}
    >
      <AvisoErro mensagem={erroGeral} />
      {erroGeral ? (
        <Button
          titulo="Revisar meus dados"
          variante="ghost"
          tamanho="sm"
          onPress={aoCorrigirPessoais}
        />
      ) : null}

      <View style={styles.campos}>
        <CampoForm
          control={control}
          nome="cep"
          rotulo="CEP"
          erro={errors.cep?.message}
          mascara={mascararCep}
          icone={(c) => <MapPinIcon size={20} color={c} />}
          keyboardType="number-pad"
          autoComplete="postal-code"
          textContentType="postalCode"
        />
        <CampoForm
          control={control}
          nome="logradouro"
          rotulo="Rua"
          erro={errors.logradouro?.message}
          autoComplete="street-address"
          textContentType="streetAddressLine1"
        />
        <View style={styles.linha}>
          <View style={styles.terco}>
            <CampoForm
              control={control}
              nome="numero"
              rotulo="Número"
              erro={errors.numero?.message}
            />
          </View>
          <View style={styles.metade}>
            <CampoForm
              control={control}
              nome="complemento"
              rotulo="Complemento"
              placeholder="Opcional"
              erro={errors.complemento?.message}
            />
          </View>
        </View>
        <CampoForm control={control} nome="bairro" rotulo="Bairro" erro={errors.bairro?.message} />
        <View style={styles.linha}>
          <View style={styles.metade}>
            <CampoForm
              control={control}
              nome="cidade"
              rotulo="Cidade"
              erro={errors.cidade?.message}
              textContentType="addressCity"
            />
          </View>
          <View style={styles.terco}>
            <CampoForm
              control={control}
              nome="uf"
              rotulo="UF"
              placeholder="SP"
              erro={errors.uf?.message}
              mascara={(t) =>
                t
                  .replace(/[^A-Za-z]/g, '')
                  .slice(0, 2)
                  .toUpperCase()
              }
              autoCapitalize="characters"
              textContentType="addressState"
            />
          </View>
        </View>

        <Controller
          control={control}
          name="aceitouTermos"
          render={({ field: { value, onChange } }) => (
            <CaixaSelecao
              rotulo="Li e aceito os termos de uso"
              marcada={value}
              onChange={onChange}
              erro={errors.aceitouTermos?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="consentimentoDados"
          render={({ field: { value, onChange } }) => (
            <CaixaSelecao
              rotulo="Autorizo o uso dos meus dados pela ONG para adoções, doações e contato (LGPD)"
              marcada={value}
              onChange={onChange}
              erro={errors.consentimentoDados?.message}
            />
          )}
        />
      </View>

      <Button
        titulo="Criar conta"
        tamanho="lg"
        larguraTotal
        carregando={isSubmitting}
        onPress={() => void enviar()}
      />
    </MolduraAuth>
  );
}

function Rodape({ texto, acao, onPress }: { texto: string; acao: string; onPress: () => void }) {
  return (
    <View style={styles.rodape}>
      <Texto variante="body2" cor={cores.tintaSuave}>
        {texto}
      </Texto>
      <Pressable accessibilityRole="link" onPress={onPress} hitSlop={espaco.md}>
        <Texto variante="label" cor={cores.marcaEscura}>
          {acao}
        </Texto>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  campos: { gap: espaco.md },
  linha: { flexDirection: 'row', gap: espaco.md },
  metade: { flex: 1 },
  terco: { flex: 0.6 },
  rodape: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: espaco.xs },
});
