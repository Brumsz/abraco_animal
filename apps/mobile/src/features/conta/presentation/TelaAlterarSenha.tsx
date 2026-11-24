import { zodResolver } from '@hookform/resolvers/zod';
import { Button, cores, Texto, useToast } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';

import { useAlterarSenha } from '../data/hooks';
import { esquemaAlterarSenha, type DadosAlterarSenha } from '../domain/esquemas';

/** Trocar a senha logado. Os outros aparelhos saem da conta; este continua. */
export default function TelaAlterarSenha() {
  const router = useRouter();
  const toast = useToast();
  const alterar = useAlterarSenha();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DadosAlterarSenha>({
    resolver: zodResolver(esquemaAlterarSenha),
    defaultValues: { senhaAtual: '', novaSenha: '', confirmacao: '' },
    mode: 'onTouched',
  });

  const salvar = handleSubmit(async ({ senhaAtual, novaSenha }) => {
    setErroGeral(null);
    try {
      await alterar.mutateAsync({ senhaAtual, novaSenha });
      toast.mostrar({ tipo: 'sucesso', mensagem: 'Senha alterada.' });
      router.back();
    } catch (erro) {
      const aplicou = aplicarErrosDeCampo(erro, ['senhaAtual', 'novaSenha'] as const, (c, m) => {
        setError(c, { message: m });
      });
      if (!aplicou) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaFormulario
      titulo="Alterar senha"
      subtitulo="Por segurança, os outros aparelhos conectados vão sair da sua conta."
      rodape={
        <Button
          titulo="Salvar nova senha"
          carregando={alterar.isPending}
          onPress={() => void salvar()}
          larguraTotal
        />
      }
    >
      <AvisoErro mensagem={erroGeral} />
      <CampoForm
        control={control}
        nome="senhaAtual"
        rotulo="Senha atual"
        erro={errors.senhaAtual?.message}
        senha
        autoComplete="current-password"
        textContentType="password"
      />
      <CampoForm
        control={control}
        nome="novaSenha"
        rotulo="Nova senha"
        erro={errors.novaSenha?.message}
        senha
        autoComplete="new-password"
        textContentType="newPassword"
        ajuda="Mínimo de 8 caracteres, com letras e números."
      />
      <CampoForm
        control={control}
        nome="confirmacao"
        rotulo="Confirme a nova senha"
        erro={errors.confirmacao?.message}
        senha
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Texto variante="caption" cor={cores.tintaSuave}>
        Você vai receber um e-mail avisando da troca.
      </Texto>
    </TelaFormulario>
  );
}
