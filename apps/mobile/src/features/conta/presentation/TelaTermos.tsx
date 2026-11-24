import { cores, espaco, Texto } from '@abraco/ui';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';

/**
 * Resumo de como o app trata os dados (LGPD). O texto jurídico completo da ONG
 * entra aqui quando for entregue; este resumo descreve o que o app de fato faz.
 */
const SECOES: readonly { titulo: string; texto: string }[] = [
  {
    titulo: 'Quais dados guardamos',
    texto:
      'Nome, e-mail, telefone, endereço, CPF e data de nascimento, informados no cadastro. Também os pedidos de adoção, doações, apadrinhamentos, candidatura de voluntariado e as mensagens do chat.',
  },
  {
    titulo: 'Para que usamos',
    texto:
      'Para analisar adoções com responsabilidade, combinar a retirada de animais doados, confirmar doações e conversar com você. Não vendemos nem compartilhamos seus dados para publicidade.',
  },
  {
    titulo: 'Como protegemos',
    texto:
      'CPF e data de nascimento ficam criptografados. A senha nunca é guardada, só uma assinatura dela. A conexão com o servidor é sempre segura e a sessão fica no armazenamento protegido do celular.',
  },
  {
    titulo: 'Seus direitos',
    texto:
      'Você pode corrigir seus dados em “Editar perfil”, receber uma cópia em “Exportar meus dados” e excluir a conta em “Excluir minha conta”, tudo nas Configurações. Dúvidas: fale com a ONG pelo chat.',
  },
];

export default function TelaTermos() {
  return (
    <TelaComVoltar>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <CabecalhoTela titulo="Termos e privacidade" subtitulo="Como cuidamos dos seus dados." />
        <View style={styles.secoes}>
          {SECOES.map((s) => (
            <View key={s.titulo} style={styles.secao}>
              <Texto variante="h3" accessibilityRole="header">
                {s.titulo}
              </Texto>
              <Texto variante="body1" cor={cores.tintaCorpo}>
                {s.texto}
              </Texto>
            </View>
          ))}
        </View>
      </ScrollView>
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingBottom: espaco.xxl },
  secoes: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: espaco.xl },
  secao: { gap: espaco.sm },
});
