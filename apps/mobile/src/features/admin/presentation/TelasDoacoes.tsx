/**
 * Gestão de doações de animais: mesmo padrão das adoções, com a etapa extra
 * "Recebida" (a API cria o animal em tratamento automaticamente).
 */
import type { StatusDoacaoAnimal } from '@abraco/shared';
import { Badge, Button, cores, espaco, Texto, useToast } from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HandHeartIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { idadeTexto, PORTES, SEXOS, TIPOS } from '@/features/animais/domain/rotulos';
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
  useAvancarDoacao,
  useDoacaoEquipe,
  useDoacoesEquipe,
  useRecusarDoacao,
} from '../data/hooks';
import { FILTROS_DOACAO, STATUS_DOACAO_EQUIPE } from '../domain/painel';
import {
  AcoesDecisao,
  Campo,
  FiltrosStatus,
  FolhaConfirmar,
  FolhaRecusar,
  Secao,
  TelaDetalhe,
} from './componentes';

export function TelaDoacoesEquipe() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusDoacaoAnimal | null>('PENDENTE');
  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={useDoacoesEquipe(status)}
        rotuloCarregando="Carregando as doações de animais"
        cabecalho={
          <>
            <CabecalhoTela
              titulo="Doações de animais"
              subtitulo="Animais que as pessoas querem doar à ONG."
            />
            <FiltrosStatus
              rotulo="Situação da doação"
              filtros={FILTROS_DOACAO}
              valor={status}
              aoMudar={setStatus}
            />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<HandHeartIcon size={48} color={cores.marca} />}
            titulo="Nenhuma doação aqui"
          />
        }
        renderizar={(d) => (
          <CartaoPedido
            titulo={d.nomeAnimal}
            subtitulo={`${TIPOS[d.tipo].singular} · enviada em ${dataCurta(d.criadoEm)}`}
            status={STATUS_DOACAO_EQUIPE[d.status]}
            imagem={<FotoAnimal url={d.fotos[0]?.url ?? null} altura={72} raio={14} />}
            aoPressionar={() => {
              router.push({ pathname: '/admin/doacoes-animais/[id]', params: { id: d.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

type Folha = 'aprovar' | 'receber' | 'recusar' | null;

export function TelaDoacaoEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const consulta = useDoacaoEquipe(id);
  const avancar = useAvancarDoacao(id);
  const recusar = useRecusarDoacao(id);
  const [folha, setFolha] = useState<Folha>(null);
  const d = consulta.data;
  const ocupado = avancar.isPending || recusar.isPending;

  const aoErro = (e: unknown) => {
    setFolha(null);
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };
  const fechar = () => {
    setFolha(null);
  };

  let acoes;
  if (d?.status === 'PENDENTE') {
    acoes = (
      <AcoesDecisao
        rotuloAprovar="Aprovar doação"
        ocupado={ocupado}
        aoAprovar={() => {
          setFolha('aprovar');
        }}
        aoRecusar={() => {
          setFolha('recusar');
        }}
      />
    );
  } else if (d?.status === 'APROVADA') {
    acoes = (
      <AcoesDecisao
        rotuloAprovar="Marcar como recebida"
        ocupado={ocupado}
        aoAprovar={() => {
          setFolha('receber');
        }}
        aoRecusar={() => {
          setFolha('recusar');
        }}
      />
    );
  }

  return (
    <TelaDetalhe
      titulo={d ? d.nomeAnimal : 'Doação'}
      {...(d ? { subtitulo: `Doação enviada em ${dataCurta(d.criadoEm)}` } : {})}
      consulta={consulta}
      folhas={
        d ? (
          <>
            <FolhaConfirmar
              visivel={folha === 'aprovar'}
              aoFechar={fechar}
              titulo={`Aceitar ${d.nomeAnimal}?`}
              texto={`${d.doador?.nome ?? 'O doador'} recebe um e-mail e a equipe combina a retirada. Quando o animal chegar, marque a doação como recebida.`}
              rotuloAcao="Aprovar doação"
              carregando={avancar.isPending}
              aoConfirmar={() => {
                avancar.mutate('aprovar', {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({ tipo: 'sucesso', mensagem: 'Doação aprovada.' });
                  },
                  onError: aoErro,
                });
              }}
            />
            <FolhaConfirmar
              visivel={folha === 'receber'}
              aoFechar={fechar}
              titulo={`${d.nomeAnimal} chegou à ONG?`}
              texto={`O app cadastra ${d.nomeAnimal} como animal "em tratamento", com as fotos da doação. Depois é só completar a ficha.`}
              rotuloAcao="Marcar como recebida"
              carregando={avancar.isPending}
              aoConfirmar={() => {
                avancar.mutate('receber', {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({ tipo: 'sucesso', mensagem: `${d.nomeAnimal} foi cadastrado.` });
                  },
                  onError: aoErro,
                });
              }}
            />
            <FolhaRecusar
              visivel={folha === 'recusar'}
              aoFechar={fechar}
              titulo="Recusar a doação"
              texto={`${d.doador?.nome ?? 'O doador'} recebe o motivo por e-mail.`}
              carregando={recusar.isPending}
              aoConfirmar={(motivo) => {
                recusar.mutate(motivo, {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({ tipo: 'sucesso', mensagem: 'Doação recusada.' });
                  },
                  onError: aoErro,
                });
              }}
            />
          </>
        ) : null
      }
      acoes={acoes}
    >
      {d ? (
        <>
          {d.fotos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fotos}
              accessibilityLabel={`${String(d.fotos.length)} fotos de ${d.nomeAnimal}`}
            >
              {d.fotos.map((f) => (
                <View key={f.id} style={styles.foto}>
                  <FotoAnimal url={f.url} altura={140} raio={16} />
                </View>
              ))}
            </ScrollView>
          ) : null}

          <Secao titulo="Situação">
            <Badge
              status={STATUS_DOACAO_EQUIPE[d.status].badge}
              texto={STATUS_DOACAO_EQUIPE[d.status].texto}
            />
            {d.analisadoEm ? (
              <Campo
                rotulo="Analisada"
                valor={`${dataCurta(d.analisadoEm)}${d.analisadoPor ? ` por ${d.analisadoPor}` : ''}`}
              />
            ) : null}
            {d.recebidoEm ? <Campo rotulo="Recebida em" valor={dataCurta(d.recebidoEm)} /> : null}
            {d.motivoRecusa ? <Campo rotulo="Motivo da recusa" valor={d.motivoRecusa} /> : null}
            {d.animalCriadoId ? (
              <Button
                titulo="Ver ficha do animal"
                variante="secundario"
                onPress={() => {
                  if (d.animalCriadoId) {
                    router.push({ pathname: '/animal/[id]', params: { id: d.animalCriadoId } });
                  }
                }}
              />
            ) : null}
          </Secao>

          <Secao titulo="Animal">
            <Campo rotulo="Tipo e raça" valor={`${TIPOS[d.tipo].singular} · ${d.raca}`} />
            <Campo
              rotulo="Idade, sexo e porte"
              valor={`${idadeTexto(d.idadeAprox)} · ${SEXOS[d.sexo]} · ${PORTES[d.porte]}`}
            />
            <Campo rotulo="Descrição" valor={d.descricao} />
            <Campo rotulo="Por que está doando" valor={d.motivoDoacao} />
          </Secao>

          <Secao titulo="Doador">
            {d.doador ? (
              <>
                <Campo rotulo="Nome" valor={d.doador.nome} />
                <Campo rotulo="E-mail" valor={d.doador.email} />
                <Campo rotulo="Telefone" valor={mascararTelefone(d.doador.telefone)} />
              </>
            ) : (
              <Texto variante="body2" cor={cores.tintaSuave}>
                Conta excluída a pedido do titular (LGPD).
              </Texto>
            )}
            <Campo rotulo="Endereço para retirada" valor={d.enderecoRetirada} />
          </Secao>
        </>
      ) : null}
    </TelaDetalhe>
  );
}

const styles = StyleSheet.create({
  fotos: { gap: espaco.sm },
  foto: { width: 180 },
});
