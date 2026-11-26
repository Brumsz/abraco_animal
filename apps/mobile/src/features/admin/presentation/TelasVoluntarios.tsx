/** Gestão de voluntários: candidaturas para analisar e a lista de ativos (cargo e endereço). */
import type { StatusVoluntario } from '@abraco/shared';
import { Avatar, Badge, cores, Input, useToast } from '@abraco/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UsersThreeIcon } from 'phosphor-react-native';
import { useState } from 'react';

import { mascararTelefone } from '@/features/auth/domain/mascaras';
import { AREAS, DIAS, TURNOS_OPCOES } from '@/features/voluntariado/domain/esquema';
import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { CartaoPedido } from '@/shared/componentes/CartaoPedido';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { mensagemDeErro } from '@/shared/erros';
import { dataCurta } from '@/shared/tempo';

import {
  useAprovarVoluntario,
  useRecusarVoluntario,
  useVoluntarioEquipe,
  useVoluntariosEquipe,
} from '../data/hooks';
import {
  enderecoEmLinha,
  FILTROS_VOLUNTARIO,
  rotulosEm,
  STATUS_VOLUNTARIO_EQUIPE,
} from '../domain/painel';
import {
  AcoesDecisao,
  Campo,
  FiltrosStatus,
  FolhaConfirmar,
  FolhaRecusar,
  Secao,
  TelaDetalhe,
} from './componentes';

const CARGO_MAX = 80;

export function TelaVoluntariosEquipe() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusVoluntario>('PENDENTE');
  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={useVoluntariosEquipe(status)}
        rotuloCarregando="Carregando os voluntários"
        cabecalho={
          <>
            <CabecalhoTela titulo="Voluntários" subtitulo="Candidaturas e equipe ativa." />
            <FiltrosStatus
              rotulo="Situação do voluntário"
              filtros={FILTROS_VOLUNTARIO}
              valor={status}
              aoMudar={setStatus}
            />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<UsersThreeIcon size={48} color={cores.marca} />}
            titulo={status === 'PENDENTE' ? 'Nenhuma candidatura nova' : 'Ninguém por aqui'}
          />
        }
        renderizar={(v) => (
          <CartaoPedido
            titulo={v.candidato.nome}
            subtitulo={
              v.status === 'APROVADO'
                ? (v.cargo ?? 'Voluntário(a)')
                : `Candidatura de ${dataCurta(v.criadoEm)}`
            }
            status={STATUS_VOLUNTARIO_EQUIPE[v.status]}
            observacao={
              v.status === 'APROVADO'
                ? `${v.candidato.endereco.cidade}/${v.candidato.endereco.uf}`
                : rotulosEm(v.areasInteresse, AREAS)
            }
            imagem={<Avatar nome={v.candidato.nome} tamanho={72} />}
            aoPressionar={() => {
              router.push({ pathname: '/admin/voluntarios/[id]', params: { id: v.id } });
            }}
          />
        )}
      />
    </TelaComVoltar>
  );
}

export function TelaVoluntarioEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const consulta = useVoluntarioEquipe(id);
  const aprovar = useAprovarVoluntario(id);
  const recusar = useRecusarVoluntario(id);
  const [folha, setFolha] = useState<'aprovar' | 'recusar' | null>(null);
  const [cargo, setCargo] = useState('');
  const v = consulta.data;

  const aoErro = (e: unknown) => {
    setFolha(null);
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };

  return (
    <TelaDetalhe
      titulo={v ? v.candidato.nome : 'Voluntário'}
      {...(v ? { subtitulo: `Candidatura de ${dataCurta(v.criadoEm)}` } : {})}
      consulta={consulta}
      folhas={
        v ? (
          <>
            <FolhaConfirmar
              visivel={folha === 'aprovar'}
              aoFechar={() => {
                setFolha(null);
              }}
              titulo={`Aprovar ${v.candidato.nome}?`}
              texto="A pessoa passa a fazer parte da equipe de voluntários e recebe um e-mail."
              rotuloAcao="Aprovar"
              carregando={aprovar.isPending}
              aoConfirmar={() => {
                aprovar.mutate(cargo.trim() || null, {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({ tipo: 'sucesso', mensagem: 'Candidatura aprovada.' });
                  },
                  onError: aoErro,
                });
              }}
            >
              <Input
                rotulo="Cargo (opcional)"
                value={cargo}
                onChangeText={setCargo}
                maxLength={CARGO_MAX}
                ajuda="Ex.: cuidador(a), motorista, eventos."
              />
            </FolhaConfirmar>
            <FolhaRecusar
              visivel={folha === 'recusar'}
              aoFechar={() => {
                setFolha(null);
              }}
              titulo="Recusar a candidatura"
              texto="A pessoa pode se candidatar de novo depois."
              carregando={recusar.isPending}
              aoConfirmar={(motivo) => {
                recusar.mutate(motivo, {
                  onSuccess: () => {
                    setFolha(null);
                    toast.mostrar({ tipo: 'sucesso', mensagem: 'Candidatura recusada.' });
                  },
                  onError: aoErro,
                });
              }}
            />
          </>
        ) : null
      }
      acoes={
        v?.status === 'PENDENTE' ? (
          <AcoesDecisao
            rotuloAprovar="Aprovar"
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
      {v ? (
        <>
          <Secao titulo="Situação">
            <Badge
              status={STATUS_VOLUNTARIO_EQUIPE[v.status].badge}
              texto={STATUS_VOLUNTARIO_EQUIPE[v.status].texto}
            />
            {v.cargo ? <Campo rotulo="Cargo" valor={v.cargo} /> : null}
            {v.analisadoEm ? (
              <Campo rotulo="Analisada em" valor={dataCurta(v.analisadoEm)} />
            ) : null}
            {v.motivoRecusa ? <Campo rotulo="Motivo da recusa" valor={v.motivoRecusa} /> : null}
          </Secao>

          <Secao titulo="Contato">
            <Campo rotulo="E-mail" valor={v.candidato.email} />
            <Campo rotulo="Telefone" valor={mascararTelefone(v.candidato.telefone)} />
            <Campo rotulo="Endereço" valor={enderecoEmLinha(v.candidato.endereco)} />
          </Secao>

          <Secao titulo="Como quer ajudar">
            <Campo
              rotulo="Áreas"
              valor={
                rotulosEm(v.areasInteresse, AREAS) +
                (v.areaInteresseOutros ? ` (${v.areaInteresseOutros})` : '')
              }
            />
            <Campo rotulo="Dias" valor={rotulosEm(v.disponibilidadeDias, DIAS)} />
            <Campo rotulo="Turnos" valor={rotulosEm(v.turnos, TURNOS_OPCOES)} />
            {v.habilidades ? <Campo rotulo="Habilidades" valor={v.habilidades} /> : null}
            <Campo rotulo="Motivação" valor={v.motivacao} />
          </Secao>
        </>
      ) : null}
    </TelaDetalhe>
  );
}
