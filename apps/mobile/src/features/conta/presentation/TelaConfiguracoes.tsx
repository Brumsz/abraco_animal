import { BottomSheet, Button, cores, espaco, Texto, useToast } from '@abraco/ui';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  DeviceMobileIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  SignOutIcon,
  TrashIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { useSessao } from '@/core/sessao';
import { useSair } from '@/features/auth/data/hooks';
import { mascararTelefone } from '@/features/auth/domain/mascaras';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { ListaOpcoes } from '@/shared/componentes/ListaOpcoes';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { mensagemDeErro } from '@/shared/erros';

import { useExportarDados } from '../data/hooks';

/**
 * Protótipo "Configurações". A seção "Notificações" do protótipo fica para quando
 * o push existir (Etapa 11): um botão que não faz nada enganaria a pessoa.
 */
export default function TelaConfiguracoes() {
  const router = useRouter();
  const usuario = useSessao((s) => s.usuario);
  const sair = useSair();
  const [exportar, setExportar] = useState(false);
  const versao = Constants.expoConfig?.version ?? '';

  return (
    <TelaComVoltar>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <CabecalhoTela titulo="Configurações" />
        <View style={styles.secoes}>
          <ListaOpcoes
            titulo="Conta"
            opcoes={[
              {
                rotulo: 'Alterar senha',
                Icone: LockSimpleIcon,
                aoPressionar: () => {
                  router.push('/configuracoes/senha');
                },
              },
              { rotulo: 'E-mail', Icone: EnvelopeSimpleIcon, valor: usuario?.email ?? '' },
              {
                rotulo: 'Telefone',
                Icone: DeviceMobileIcon,
                valor: usuario ? mascararTelefone(usuario.telefone) : '',
              },
            ]}
          />
          <ListaOpcoes
            titulo="Privacidade e suporte"
            opcoes={[
              {
                rotulo: 'Exportar meus dados',
                Icone: DownloadSimpleIcon,
                aoPressionar: () => {
                  setExportar(true);
                },
              },
              {
                rotulo: 'Termos e privacidade',
                Icone: ShieldCheckIcon,
                aoPressionar: () => {
                  router.push('/configuracoes/termos');
                },
              },
              {
                rotulo: 'Excluir minha conta',
                Icone: TrashIcon,
                destrutiva: true,
                aoPressionar: () => {
                  router.push('/configuracoes/excluir');
                },
              },
            ]}
          />
          <Button
            titulo="Sair"
            variante="contorno"
            icone={<SignOutIcon size={18} color={cores.erro} />}
            carregando={sair.isPending}
            onPress={() => {
              sair.mutate();
            }}
            larguraTotal
          />
          <Texto variante="caption" cor={cores.tintaSuave} style={styles.versao}>
            {`Abraço Animal · versão ${versao}`}
          </Texto>
        </View>
      </ScrollView>
      <FolhaExportar
        visivel={exportar}
        aoFechar={() => {
          setExportar(false);
        }}
      />
    </TelaComVoltar>
  );
}

/** LGPD: cópia dos dados. Avisa antes, porque o arquivo tem CPF e nascimento. */
function FolhaExportar({
  visivel,
  aoFechar,
}: {
  readonly visivel: boolean;
  readonly aoFechar: () => void;
}) {
  const toast = useToast();
  const exportar = useExportarDados();

  const gerar = async () => {
    try {
      const dados = await exportar.mutateAsync();
      aoFechar();
      await Share.share({
        title: 'Meus dados — Abraço Animal',
        message: JSON.stringify(dados, null, 2),
      });
    } catch (erro) {
      toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(erro) });
    }
  };

  return (
    <BottomSheet
      visivel={visivel}
      aoFechar={aoFechar}
      titulo="Exportar meus dados"
      rodape={
        <Button
          titulo="Gerar e compartilhar"
          carregando={exportar.isPending}
          onPress={() => void gerar()}
          larguraTotal
        />
      }
    >
      <View style={styles.folha}>
        <Texto variante="body1" cor={cores.tintaCorpo}>
          Você recebe uma cópia de tudo o que a ONG guarda sobre você: cadastro, pedidos de adoção,
          doações, apadrinhamentos, mensagens e acessos.
        </Texto>
        <Texto variante="body2" cor={cores.avisoTexto}>
          A cópia inclui seu CPF e sua data de nascimento. Guarde ou envie só para quem você confia.
        </Texto>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingBottom: espaco.xxl },
  secoes: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: espaco.xl },
  versao: { textAlign: 'center' },
  folha: { gap: espaco.md },
});
