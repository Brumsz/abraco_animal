/** Gestão de adoções (spec, telas administrativas): lista com filtro e análise do pedido. */
import type { StatusAdocao } from '@abraco/shared';
import { Badge, cores, Texto, useToast } from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HeartIcon } from 'phosphor-react-native';
import { useState } from 'react';

import { MORADIAS } from '@/features/adocoes/domain/esquema';
import { FotoAnimal } from '@/features/animais/presentation/CartaoAnimal';
import { mascararTelefone } from '@/features/auth/domain/mascaras';
import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { mensagemDeErro } from '@/shared/erros';
import { dataCurta } from '@/shared/tempo';

import {
  useAdocaoEquipe,
  useAdocoesEquipe,
  useAprovarAdocao,
  useRecusarAdocao,
} from '../data/hooks';
import { enderecoEmLinha, FILTROS_ADOCAO, STATUS_ADOCAO_EQUIPE } from '../domain/painel';
import {
  AcoesDecisao,
  Campo,
  FiltrosStatus,
  FolhaConfirmar,
  FolhaRecusar,
  Secao,
  TelaDetalhe,
} from './componentes';

export function TelaAdocoesEquipe() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusAdocao | null>('PENDENTE');
  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={useAdocoesEquipe(status)}
        rotuloCarregando="Carregando as solicitações de adoção"
        cabecalho={
          <>
            <CabecalhoTela titulo="Adoções" subtitulo="Solicitações enviadas pelos usuários." />
            <FiltrosStatus
              rotulo="Situação do pedido"
              filtros={FILTROS_ADOCAO}
              valor={status}
              aoMudar={setStatus}
            />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<HeartIcon size={48} color={cores.marca} />}
            titulo={status === 'PENDENTE' ? 'Nenhum pedido esperando' : 'Nenhum pedido aqui'}
            subtitulo={
              status === 'PENDENTE' ? 'Quando alguém pedir para adotar, aparece aqui.' : ''
            }
          />
        }
        renderizar={(a) => (
          <CartaoPedido
            titulo={a.animal.nome}
            subtitulo={`Pedido de ${dataCurta(a.criadoEm)}`}
            status={STATUS_ADOCAO_EQUIPE[a.status]}
            imagem={<FotoAnimal url={a.animal.fotoCapa?.url ?? null} altura={72} raio={14} />}
            aoPressionar={() => {
              router.push({ pathname: '/admin/adocoes/[id]', params: { id: a.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

const moradia = (v: string) => MORADIAS.find((m) => m.valor === v)?.rotulo ?? v;

export function TelaAdocaoEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const consulta = useAdocaoEquipe(id);
  const aprovar = useAprovarAdocao(id);
  const recusar = useRecusarAdocao(id);
  const [folha, setFolha] = useState<'aprovar' | 'recusar' | null>(null);
  const a = consulta.data;

  const aoErro = (e: unknown) => {
    setFolha(null);
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  return (
    <TelaDetalhe
      titulo={a ? `Adoção de ${a.animal.nome}` : 'Adoção'}
      {...(a ? { subtitulo: `Pedido de ${dataCurta(a.criadoEm)}` } : {})}
      consulta={consulta}
      folhas={
        a ? (
          <>
            <FolhaConfirmar
              visivel={folha === 'aprovar'}
              aoFechar={() => {
                setFolha(null);
              }}
              titulo={`Aprovar a adoção de ${a.animal.nome}?`}
              texto={`${a.animal.nome} passa a constar como adotado e ${a.solicitante?.nome ?? 'a pessoa'} recebe um e-mail. Os outros pedidos pendentes para ${a.animal.nome} são recusados automaticamente.`}
              rotuloAcao="Aprovar adoção"
              carregando={aprovar.isPending}
              aoConfirmar={() => {
                aprovar.mutate(undefined, {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({
                      tipo: 'sucesso',
                      mensagem: 'Adoção aprovada. Avisamos por e-mail.',
                    });
                  },
                  onError: aoErro,
                });
              }}
            />
            <FolhaRecusar
              visivel={folha === 'recusar'}
              aoFechar={() => {
                setFolha(null);
              }}
              titulo="Recusar o pedido"
              texto={`${a.animal.nome} continua disponível para outras pessoas.`}
              carregando={recusar.isPending}
              aoConfirmar={(motivo) => {
                recusar.mutate(motivo, {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({
                      tipo: 'sucesso',
                      mensagem: 'Pedido recusado. Avisamos por e-mail.',
                    });
                  },
                  onError: aoErro,
                });
              }}
            />
          </>
        ) : null
      }
      acoes={
        a?.status === 'PENDENTE' ? (
          <AcoesDecisao
            rotuloAprovar="Aprovar adoção"
            ocupado={aprovar.isPending || recusar.isPending}
            aoAprovar={() => {
              setFolha('aprovar');
            }}
            aoRecusar={() => {
              setFolha('recusar');
            }}
          />
        ) : undefined
      }
    >
      {a ? (
        <>
          <Secao titulo="Situação">
            <Badge
              status={STATUS_ADOCAO_EQUIPE[a.status].badge}
              texto={STATUS_ADOCAO_EQUIPE[a.status].texto}
            />
            {a.analisadoEm ? (
              <Campo
                rotulo="Analisado"
                valor={`${dataCurta(a.analisadoEm)}${a.analisadoPor ? ` por ${a.analisadoPor}` : ''}${a.recusaAutomatica ? ' (outro pedido foi aprovado)' : ''}`}
              />
            ) : null}
            {a.motivoRecusa ? <Campo rotulo="Motivo da recusa" valor={a.motivoRecusa} /> : null}
          </Secao>

          <Secao titulo="Solicitante">
            {a.solicitante ? (
              <>
                <Campo rotulo="Nome" valor={a.solicitante.nome} />
                <Campo rotulo="E-mail" valor={a.solicitante.email} />
                <Campo rotulo="Telefone" valor={mascararTelefone(a.solicitante.telefone)} />
                <Campo rotulo="Endereço" valor={enderecoEmLinha(a.solicitante.endereco)} />
              </>
            ) : (
              <Texto variante="body2" cor={cores.tintaSuave}>
                Conta excluída a pedido do titular (LGPD). O histórico fica, sem os dados pessoais.
              </Texto>
            )}
          </Secao>

          <Secao titulo="Triagem">
            <Campo rotulo="Moradia" valor={moradia(a.tipoMoradia)} />
            <Campo rotulo="Espaço adequado" valor={a.possuiEspacoAdequado ? 'Sim' : 'Não'} />
            <Campo rotulo="Outros animais" valor={a.outrosAnimais ?? 'Nenhum informado'} />
            <Campo rotulo="Por que quer adotar" valor={a.motivo} />
            <Campo rotulo="Termo de adoção aceito" valor={dataCurta(a.termoAceitoEm)} />
          </Secao>
        </>
      ) : null}
    </TelaDetalhe>
  );
}
