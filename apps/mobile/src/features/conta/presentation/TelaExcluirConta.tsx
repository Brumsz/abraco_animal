import { zodResolver } from '@hookform/resolvers/zod';
import { Button, CaixaSelecao, cores, espaco, raio, Texto } from '@abraco/ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useExcluirConta } from '../data/hooks';
import { esquemaExcluirConta, type DadosExcluirConta } from '../domain/esquemas';

const O_QUE_ACONTECE = [
  'Seu nome, e-mail, CPF, telefone e endereço são apagados.',
  'Pedidos de adoção e doações em análise são cancelados.',
  'Conversas, curtidas, notificações e apadrinhamentos são removidos.',
  'A ONG guarda só o histórico sem identificação (ex.: "um animal foi adotado").',
  'Você sai de todos os aparelhos e pode criar uma conta nova depois.',
];

/** LGPD art. 18, VI: excluir a conta. Pede a senha e uma confirmação explícita. */
export default function TelaExcluirConta() {
  const excluir = useExcluirConta();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DadosExcluirConta>({
    resolver: zodResolver(esquemaExcluirConta),
    defaultValues: { senha: '', entendi: false as true },
    mode: 'onTouched',
  });

  // Sucesso: a sessão some e o layout logado leva ao login sozinho.
  const confirmar = handleSubmit(async ({ senha }) => {
    setErroGeral(null);
    try {
      await excluir.mutateAsync(senha);
    } catch (erro) {
      const aplicou = aplicarErrosDeCampo(erro, ['senha'] as const, (c, m) => {
        setError(c, { message: m });
      });
      if (!aplicou) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaFormulario
      titulo="Excluir minha conta"
      subtitulo="Esta ação não pode ser desfeita."
      rodape={
        <Button
          titulo="Excluir conta definitivamente"
          variante="destrutivo"
          carregando={excluir.isPending}
          onPress={() => void confirmar()}
          larguraTotal
        />
      }
    >
      <View style={styles.caixa}>
        <Texto variante="label" cor={cores.erroTexto}>
          O que acontece
        </Texto>
        {O_QUE_ACONTECE.map((t) => (
          <Texto key={t} variante="body2" cor={cores.tintaCorpo}>
            {`•  ${t}`}
          </Texto>
        ))}
      </View>
      <Texto variante="body2" cor={cores.tintaSuave}>
        Quer uma cópia dos seus dados antes? Use “Exportar meus dados” nas Configurações.
      </Texto>
      <AvisoErro mensagem={erroGeral} />
      <CampoForm
        control={control}
        nome="senha"
        rotulo="Sua senha"
        erro={errors.senha?.message}
        senha
        autoComplete="current-password"
        textContentType="password"
      />
      <Controller
        control={control}
        name="entendi"
        render={({ field }) => (
          <CaixaSelecao
            marcada={field.value}
            onChange={field.onChange}
            rotulo="Entendo que a exclusão é definitiva"
            erro={errors.entendi?.message}
          >
            <Texto variante="body2" cor={cores.tintaCorpo}>
              Entendo que a exclusão é definitiva
            </Texto>
          </CaixaSelecao>
        )}
      />
    </TelaFormulario>
  );
}

const styles = StyleSheet.create({
  caixa: {
    gap: espaco.sm,
    padding: espaco.lg,
    borderRadius: raio.lg,
    backgroundColor: cores.erroFundo,
  },
});
