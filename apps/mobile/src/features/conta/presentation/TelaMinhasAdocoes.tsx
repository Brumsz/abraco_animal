import { cores } from '@abraco/ui';
import { useRouter } from 'expo-router';
import { PawPrintIcon } from 'phosphor-react-native';

import { FotoAnimal } from '@/features/animais/presentation/CartaoAnimal';
import { useMinhasAdocoes } from '@/features/adocoes/data/hooks';
import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { dataCurta } from '@/shared/tempo';

import { STATUS_ADOCAO } from '../domain/rotulos';

/** Pedidos de adoção da pessoa e a resposta da equipe. */
export default function TelaMinhasAdocoes() {
  const router = useRouter();
  const adocoes = useMinhasAdocoes();
  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={adocoes}
        rotuloCarregando="Carregando seus pedidos de adoção"
        cabecalho={
          <CabecalhoTela
            titulo="Minhas adoções"
            subtitulo="Acompanhe a resposta da equipe a cada pedido."
          />
        }
        vazio={
          <EstadoVazio
            icone={<PawPrintIcon size={48} color={cores.marca} />}
            titulo="Nenhum pedido ainda"
            subtitulo="Quando você pedir para adotar um animal, o pedido aparece aqui."
            acao={{
              titulo: 'Conhecer os animais',
              aoPressionar: () => {
                router.navigate('/adotar');
              },
            }}
          />
        }
        renderizar={(a) => (
          <CartaoPedido
            titulo={a.animal.nome}
            subtitulo={`Pedido de ${dataCurta(a.criadoEm)}`}
            status={STATUS_ADOCAO[a.status]}
            observacao={a.status === 'RECUSADA' ? a.motivoRecusa : null}
            imagem={<FotoAnimal url={a.animal.fotoCapa?.url ?? null} altura={72} raio={14} />}
            aoPressionar={() => {
              router.push({ pathname: '/animal/[id]', params: { id: a.animal.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}
