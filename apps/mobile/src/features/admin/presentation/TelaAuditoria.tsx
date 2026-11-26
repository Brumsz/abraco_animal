/**
 * Log de auditoria (spec): data, admin, ação, entidade, ID e detalhes, com filtros
 * por período e por admin. No celular a "tabela" vira uma lista de registros.
 */
import { cores, espaco, fontes, Texto } from '@abraco/ui';
import { ClipboardTextIcon } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CabecalhoTela } from '@/shared/componentes/CabecalhoTela';
import { EstadoVazio } from '@/shared/componentes/EstadoTela';
import { ListaPaginada } from '@/shared/componentes/ListaPaginada';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { dataCurta, horaCurta } from '@/shared/tempo';

import { useAdmins, useAuditoria } from '../data/cadastros';
import {
  inicioDoPeriodo,
  PERIODOS,
  resumoDetalhe,
  rotuloAcao,
  type Periodo,
} from '../domain/auditoria';
import { FiltrosStatus } from './componentes';

export default function TelaAuditoria() {
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [adminId, setAdminId] = useState<string | null>(null);
  // Calculado uma vez por escolha: a chave do cache não muda a cada render.
  const de = useMemo(() => inicioDoPeriodo(periodo), [periodo]);
  const admins = useAdmins();
  const filtrosAdmin: { valor: string | null; rotulo: string }[] = [
    { valor: null, rotulo: 'Toda a equipe' },
    ...(admins.data ?? []).map((a) => ({ valor: a.id, rotulo: a.nome })),
  ];

  return (
    <TelaComVoltar>
      <ListaPaginada
        consulta={useAuditoria({ adminId, de })}
        rotuloCarregando="Carregando o log de auditoria"
        cabecalho={
          <>
            <CabecalhoTela titulo="Auditoria" subtitulo="Tudo o que a equipe alterou no app." />
            <FiltrosStatus
              rotulo="Período"
              filtros={PERIODOS}
              valor={periodo}
              aoMudar={setPeriodo}
            />
            {filtrosAdmin.length > 2 ? (
              <FiltrosStatus
                rotulo="Feito por"
                filtros={filtrosAdmin}
                valor={adminId}
                aoMudar={setAdminId}
              />
            ) : null}
          </>
        }
        vazio={
          <EstadoVazio
            icone={<ClipboardTextIcon size={48} color={cores.marca} />}
            titulo="Nenhuma ação no período"
          />
        }
        renderizar={(r) => {
          const detalhe = resumoDetalhe(r.detalhe);
          const quando = `${dataCurta(r.criadoEm)} ${horaCurta(r.criadoEm)}`;
          return (
            <View
              style={styles.registro}
              accessible
              accessibilityLabel={`${quando}, ${r.admin.nome}: ${rotuloAcao(r.acao)}, ${r.entidade} ${r.entidadeId}${detalhe ? `, ${detalhe}` : ''}`}
            >
              <View style={styles.topo}>
                <Texto variante="body1" cor={cores.tinta} style={styles.acao}>
                  {rotuloAcao(r.acao)}
                </Texto>
                <Texto variante="caption" cor={cores.tintaSuave}>
                  {quando}
                </Texto>
              </View>
              <Texto variante="body2" cor={cores.tintaCorpo}>
                por {r.admin.nome}
              </Texto>
              <Texto variante="caption" cor={cores.tintaSuave} numberOfLines={1}>
                {r.entidade} · {r.entidadeId}
              </Texto>
              {detalhe ? (
                <Texto variante="caption" cor={cores.tintaSuave} numberOfLines={2}>
                  {detalhe}
                </Texto>
              ) : null}
            </View>
          );
        }}
      />
    </TelaComVoltar>
  );
}

const styles = StyleSheet.create({
  registro: {
    gap: espaco.xxs,
    paddingVertical: espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
  topo: { flexDirection: 'row', justifyContent: 'space-between', gap: espaco.sm },
  acao: { flex: 1, fontFamily: fontes.interSemiBold },
});
