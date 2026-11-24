import { Chip, cores, espaco } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { HeartIcon, PixLogoIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FotoAnimal } from '@/features/animais/presentation/CartaoAnimal';
import { useMinhasDoacoesAnimais } from '@/features/doacoes-animais/data/hooks';
import { useHistoricoPix } from '@/features/pix/data/hooks';
import { centavosDaApi, formatarReais } from '@/features/pix/domain/valores';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { estiloChips } from '@/shared/componentes/GrupoEscolha';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { dataCurta } from '@/shared/tempo';

import { STATUS_DOACAO_ANIMAL, STATUS_PIX } from '../domain/rotulos';

type Aba = 'pix' | 'animais';

/** Histórico de doações: Pix e animais doados à ONG. */
export default function TelaMinhasDoacoes() {
  const [aba, setAba] = useState<Aba>('pix');
  const cabecalho = (
    <View>
      <CabecalhoTela titulo="Minhas doações" subtitulo="Obrigado por cada ajuda!" />
      <View
        style={[estiloChips.linha, styles.abas]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Tipo de doação"
      >
        <Chip
          rotulo="Pix"
          selecionado={aba === 'pix'}
          onPress={() => {
            setAba('pix');
          }}
        />
        <Chip
          rotulo="Animais"
          selecionado={aba === 'animais'}
          onPress={() => {
            setAba('animais');
          }}
        />
      </View>
    </View>
  );
  return (
    <TelaComVoltar>
      {aba === 'pix' ? <ListaPix cabecalho={cabecalho} /> : <ListaAnimais cabecalho={cabecalho} />}
    </TelaComVoltar>
  );
}

function ListaPix({ cabecalho }: { readonly cabecalho: React.ReactElement }) {
  const router = useRouter();
  return (
    <ListaPaginada
      consulta={useHistoricoPix()}
      rotuloCarregando="Carregando suas doações por Pix"
      cabecalho={cabecalho}
      vazio={
        <EstadoVazio
          icone={<HeartIcon size={48} color={cores.marca} />}
          titulo="Nenhum Pix ainda"
          acao={{
            titulo: 'Doar com Pix',
            aoPressionar: () => {
              router.navigate('/doar');
            },
          }}
        />
      }
      renderizar={(d) => (
        <CartaoPedido
          titulo={formatarReais(centavosDaApi(d.valor))}
          subtitulo={dataCurta(d.paidAt ?? d.criadoEm)}
          status={STATUS_PIX[d.status]}
          observacao={d.anonima ? 'Doação anônima' : null}
          imagem={
            <View style={styles.icone}>
              <PixLogoIcon size={32} color={cores.marca} />
            </View>
          }
        />
      )}
    />
  );
}

function ListaAnimais({ cabecalho }: { readonly cabecalho: React.ReactElement }) {
  const router = useRouter();
  return (
    <ListaPaginada
      consulta={useMinhasDoacoesAnimais()}
      rotuloCarregando="Carregando os animais que você doou"
      cabecalho={cabecalho}
      vazio={
        <EstadoVazio
          icone={<HeartIcon size={48} color={cores.marca} />}
          titulo="Nenhum animal doado"
          acao={{
            titulo: 'Doar um animal',
            aoPressionar: () => {
              router.push('/doar-animal');
            },
          }}
        />
      }
      renderizar={(d) => (
        <CartaoPedido
          titulo={d.nomeAnimal}
          subtitulo={`Enviado em ${dataCurta(d.criadoEm)}`}
          status={STATUS_DOACAO_ANIMAL[d.status]}
          observacao={d.status === 'RECUSADA' ? d.motivoRecusa : null}
          imagem={<FotoAnimal url={d.fotos[0]?.url ?? null} altura={72} raio={14} />}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  abas: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.lg, paddingBottom: espaco.md },
  icone: {
    flex: 1,
    backgroundColor: cores.marcaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
