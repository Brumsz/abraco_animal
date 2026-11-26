/**
 * Gestão de usuários (spec): busca por nome/e-mail, filtro por papel, ativar ou
 * desativar a conta e promover a voluntário. Contas ADMIN e a própria conta não
 * são alteradas pelo app (a API recusa: ALVO_E_ADMIN, ACAO_NA_PROPRIA_CONTA).
 */
import type { Resposta } from '@abraco/api-client';
import type { Role } from '@abraco/shared';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  cores,
  espaco,
  fontes,
  Input,
  Texto,
  useToast,
} from '@abraco/ui';
import { MagnifyingGlassIcon, UsersIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSessao } from '@/core/sessao';
import { mascararTelefone } from '@/features/auth/domain/mascaras';
import { useAtrasado } from '@/shared/atraso';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { mensagemDeErro } from '@/shared/erros';
import { dataCurta } from '@/shared/tempo';

import { useGerenciarUsuario, useUsuariosEquipe } from '../data/cadastros';
import { Campo, FiltrosStatus } from './componentes';

type Usuario = Resposta<'/v1/admin/usuarios', 'get'>['itens'][number];

const PAPEIS: Record<Role, string> = {
  USUARIO: 'Usuário',
  VOLUNTARIO: 'Voluntário(a)',
  ADMIN: 'Equipe (admin)',
};

const FILTROS = [
  { valor: null, rotulo: 'Todos' },
  { valor: 'USUARIO', rotulo: 'Usuários' },
  { valor: 'VOLUNTARIO', rotulo: 'Voluntários' },
  { valor: 'ADMIN', rotulo: 'Equipe' },
] as const satisfies readonly { valor: Role | null; rotulo: string }[];

export function TelaUsuariosEquipe() {
  const [role, setRole] = useState<Role | null>(null);
  const [busca, setBusca] = useState('');
  const q = useAtrasado(busca);
  const [aberto, setAberto] = useState<Usuario | null>(null);

  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={useUsuariosEquipe(role, q)}
        rotuloCarregando="Carregando os usuários"
        cabecalho={
          <>
            <CabecalhoTela titulo="Usuários" subtitulo="Contas cadastradas no app." />
            <View style={styles.busca}>
              <Input
                rotulo="Buscar por nome ou e-mail"
                rotuloOculto
                placeholder="Buscar por nome ou e-mail"
                value={busca}
                onChangeText={setBusca}
                icone={(cor) => <MagnifyingGlassIcon size={20} color={cor} />}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <FiltrosStatus rotulo="Papel" filtros={FILTROS} valor={role} aoMudar={setRole} />
          </>
        }
        vazio={
          <EstadoVazio
            icone={<UsersIcon size={48} color={cores.marca} />}
            titulo="Ninguém encontrado"
          />
        }
        renderizar={(u) => (
          <LinhaUsuario
            usuario={u}
            aoPressionar={() => {
              setAberto(u);
            }}
          />
        )}
      />
      {aberto ? (
        <FolhaUsuario
          usuario={aberto}
          aoFechar={() => {
            setAberto(null);
          }}
        />
      ) : null}
    </TelaComVoltar>
  );
}

function LinhaUsuario({
  usuario: u,
  aoPressionar,
}: {
  readonly usuario: Usuario;
  readonly aoPressionar: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${u.nome}, ${PAPEIS[u.role]}${u.ativo ? '' : ', conta desativada'}`}
      onPress={aoPressionar}
      style={({ pressed }) => [styles.linha, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Avatar nome={u.nome} tamanho={44} />
      <View style={styles.textos}>
        <Texto variante="body1" cor={cores.tinta} style={styles.nome} numberOfLines={1}>
          {u.nome}
        </Texto>
        <Texto variante="caption" cor={cores.tintaSuave} numberOfLines={1}>
          {u.email}
        </Texto>
      </View>
      <View style={styles.selos}>
        {u.role !== 'USUARIO' ? <Badge status="DESTAQUE" texto={PAPEIS[u.role]} /> : null}
        {!u.ativo ? <Badge status="RECUSADA" texto="Desativada" /> : null}
      </View>
    </Pressable>
  );
}

function FolhaUsuario({
  usuario: u,
  aoFechar,
}: {
  readonly usuario: Usuario;
  readonly aoFechar: () => void;
}) {
  const toast = useToast();
  const euMesmo = useSessao((s) => s.usuario?.id === u.id);
  const { ativo, papel } = useGerenciarUsuario(u.id);
  const gerenciavel = !euMesmo && u.role !== 'ADMIN';

  const aoErro = (e: unknown) => {
    toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
  };
  const concluir = (mensagem: string) => () => {
    toast.mostrar({ tipo: 'sucesso', mensagem });
    aoFechar();
  };

  let acoes = null;
  if (gerenciavel) {
    acoes = (
      <View style={styles.acoes}>
        {u.role === 'USUARIO' ? (
          <Button
            titulo="Promover a voluntário"
            variante="secundario"
            carregando={papel.isPending}
            onPress={() => {
              papel.mutate('VOLUNTARIO', {
                onSuccess: concluir(`${u.nome} agora é voluntário(a).`),
                onError: aoErro,
              });
            }}
            larguraTotal
          />
        ) : (
          <Button
            titulo="Tirar de voluntário"
            variante="contorno"
            carregando={papel.isPending}
            onPress={() => {
              papel.mutate('USUARIO', {
                onSuccess: concluir(`${u.nome} voltou a ser usuário(a).`),
                onError: aoErro,
              });
            }}
            larguraTotal
          />
        )}
        <Button
          titulo={u.ativo ? 'Desativar conta' : 'Reativar conta'}
          variante={u.ativo ? 'destrutivo' : 'primario'}
          carregando={ativo.isPending}
          onPress={() => {
            ativo.mutate(!u.ativo, {
              onSuccess: concluir(u.ativo ? 'Conta desativada.' : 'Conta reativada.'),
              onError: aoErro,
            });
          }}
          larguraTotal
        />
      </View>
    );
  }

  return (
    <BottomSheet visivel aoFechar={aoFechar} titulo={u.nome} rodape={acoes}>
      <Campo rotulo="Papel" valor={`${PAPEIS[u.role]}${u.ativo ? '' : ' · conta desativada'}`} />
      <Campo rotulo="E-mail" valor={u.email} />
      <Campo rotulo="Telefone" valor={mascararTelefone(u.telefone)} />
      <Campo rotulo="Cidade" valor={`${u.cidade}/${u.uf}`} />
      <Campo rotulo="Cadastro" valor={dataCurta(u.criadoEm)} />
      {gerenciavel ? (
        u.ativo ? (
          <Texto variante="caption" cor={cores.tintaSuave}>
            Desativar encerra as sessões da pessoa na hora; ela não consegue mais entrar.
          </Texto>
        ) : null
      ) : (
        <Texto variante="body2" cor={cores.tintaSuave}>
          {euMesmo
            ? 'Esta é a sua conta. Altere seus dados pelo Perfil.'
            : 'Contas da equipe (admin) não são alteradas pelo app.'}
        </Texto>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  busca: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.lg },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
  textos: { flex: 1, gap: espaco.xxs },
  nome: { fontFamily: fontes.displayBold },
  selos: { alignItems: 'flex-end', gap: espaco.xs },
  acoes: { gap: espaco.sm },
});
