import { Avatar, Badge, cores, espaco, fontes, raio, Texto } from '@abraco/ui';
import { useRouter, type Href } from 'expo-router';
import {
  GearSixIcon,
  HandHeartIcon,
  HeartIcon,
  InfoIcon,
  NewspaperIcon,
  PawPrintIcon,
  UserIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessao } from '@/core/sessao';
import { usePerfil } from '@/features/auth/data/hooks';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { FundoMarca } from '@/shared/componentes/FundoMarca';
import { ListaOpcoes, type Opcao } from '@/shared/componentes/ListaOpcoes';

import { useResumoConta } from '../data/hooks';

const PAPEL: Record<string, string | undefined> = {
  VOLUNTARIO: 'Voluntário(a)',
  ADMIN: 'Equipe da ONG',
};

/** Protótipo "Perfil": capa, foto, números e o menu da conta. */
export default function TelaPerfil() {
  const router = useRouter();
  const espacoBarra = useEspacoBarra();
  // O perfil da sessão aparece na hora; a consulta traz a versão mais nova.
  const daSessao = useSessao((s) => s.usuario);
  const usuario = usePerfil().data ?? daSessao;
  const resumo = useResumoConta();

  const ir = (destino: Href) => () => {
    router.push(destino);
  };
  const opcoes: Opcao[] = [
    { rotulo: 'Editar perfil', Icone: UserIcon, aoPressionar: ir('/perfil/editar') },
    { rotulo: 'Minhas adoções', Icone: PawPrintIcon, aoPressionar: ir('/minhas-adocoes') },
    { rotulo: 'Minhas doações', Icone: HeartIcon, aoPressionar: ir('/minhas-doacoes') },
    { rotulo: 'Voluntariado', Icone: UsersThreeIcon, aoPressionar: ir('/voluntariar') },
    { rotulo: 'Jornal Abraço Animal', Icone: NewspaperIcon, aoPressionar: ir('/jornal') },
    { rotulo: 'Sobre a ONG', Icone: InfoIcon, aoPressionar: ir('/ong') },
    { rotulo: 'Configurações', Icone: GearSixIcon, aoPressionar: ir('/configuracoes') },
  ].map((o) => ({ ...o, iconeEmCirculo: true }));

  const numero = (n: number | undefined) => (resumo.isSuccess && n !== undefined ? String(n) : '–');
  const papel = usuario ? PAPEL[usuario.role] : undefined;

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.conteudo, { paddingBottom: espacoBarra }]}>
        <View style={styles.topo}>
          <Texto variante="titulo" accessibilityRole="header">
            Perfil
          </Texto>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Configurações"
            onPress={ir('/configuracoes')}
            style={({ pressed }) => [styles.engrenagem, { opacity: pressed ? 0.7 : 1 }]}
          >
            <GearSixIcon size={22} color={cores.tintaCorpo} />
          </Pressable>
        </View>

        <View>
          {usuario?.capaUrl ? (
            <Image
              source={{ uri: usuario.capaUrl }}
              style={styles.capa}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <FundoMarca style={styles.capa} />
          )}
          {/* Só a foto sobe sobre a capa; o nome fica abaixo, no fundo claro (legível). */}
          <View style={styles.moldura}>
            <Avatar nome={usuario?.nome ?? ''} uri={usuario?.fotoUrl} tamanho={76} />
          </View>
          <View style={styles.nome}>
            <Texto variante="h2" numberOfLines={2} accessibilityRole="header">
              {usuario?.nome ?? ''}
            </Texto>
            {papel ? <Badge status="DESTAQUE" texto={papel} /> : null}
          </View>
        </View>

        <View style={styles.numeros} accessibilityRole="summary">
          <Numero valor={numero(resumo.data?.adocoes)} rotulo="Adoções" />
          <Numero valor={numero(resumo.data?.doacoes)} rotulo="Doações" />
          <Numero valor={numero(resumo.data?.apadrinhados)} rotulo="Apadrinhados" />
        </View>

        <ListaOpcoes opcoes={opcoes} />
        <View style={styles.dica}>
          <HandHeartIcon size={16} color={cores.tintaSuave} />
          <Texto variante="caption" cor={cores.tintaSuave}>
            Obrigado por fazer parte da Abraço Animal!
          </Texto>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Numero({ valor, rotulo }: { readonly valor: string; readonly rotulo: string }) {
  return (
    <View style={styles.numero} accessible accessibilityLabel={`${valor} ${rotulo}`}>
      <Texto variante="h1" style={styles.valor}>
        {valor}
      </Texto>
      <Texto variante="caption" cor={cores.tintaSuave}>
        {rotulo}
      </Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { paddingHorizontal: MARGEM_TELA, gap: espaco.lg },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: espaco.lg,
  },
  engrenagem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capa: { height: 112, borderRadius: raio.lg, overflow: 'hidden' },
  moldura: {
    alignSelf: 'flex-start',
    marginTop: -42,
    marginLeft: espaco.lg,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: cores.fundo,
  },
  nome: {
    gap: espaco.sm,
    alignItems: 'flex-start',
    paddingTop: espaco.md,
    paddingHorizontal: espaco.lg,
  },
  numeros: { flexDirection: 'row', gap: espaco.sm },
  numero: {
    flex: 1,
    padding: espaco.md,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    gap: espaco.xxs,
  },
  valor: { fontFamily: fontes.displayExtra },
  dica: { flexDirection: 'row', gap: espaco.xs, justifyContent: 'center', alignItems: 'center' },
});
